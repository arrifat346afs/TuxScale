import path from 'path'
import fs from 'fs'
import type {
  Engine,
  EngineUpscaleOptions,
  EngineImageUpscaleOptions,
  EngineStatus
} from '../types'
import {
  getBinaryPath,
  getModelPath,
  createNcnnTempDir,
  removeTempDir,
  extractFrames,
  upscaleFramesBatch,
  reassembleVideo,
  extractAudio,
  runUpscaylBinImage,
  stopNcnnProcesses
} from './runner'
import { getVideoFps, getFrameCount } from '../shared/ffmpeg'
import { resolveOutputPath, AUDIO_FORMATS } from '../shared/output'
import { resolveImageOutputPath } from '../shared/image-output'
import { getModel } from '../../getmodel'

export class NcnnEngine implements Engine {
  readonly id = 'ncnn' as const

  async isAvailable(): Promise<boolean> {
    const binary = getBinaryPath()
    return fs.existsSync(binary)
  }

  async getStatus(): Promise<EngineStatus> {
    const binary = getBinaryPath()
    const modelsDir = getModelPath()
    const binaryExists = fs.existsSync(binary)
    const modelsExist = fs.existsSync(modelsDir)

    return {
      backend: 'ncnn',
      available: binaryExists,
      details: {
        binary: {
          ok: binaryExists,
          message: binaryExists ? 'upscayl-bin found' : `Binary missing at ${binary}`
        },
        models: {
          ok: modelsExist,
          message: modelsExist ? 'NCNN model files found' : `Models missing at ${modelsDir}`
        },
        vulkan: {
          ok: true,
          message: 'Vulkan API acceleration (NVIDIA/AMD/Intel)'
        }
      }
    }
  }

  getModels(): string[] {
    return getModel()
  }

  async upscale(options: EngineUpscaleOptions): Promise<string> {
    const { videoPath, model, scale, ttaMode, tileSize, batchSize, onProgress, sendLog } = options
    const outputFormat = options.outputFormat ?? 'mp4'
    const isAudio = AUDIO_FORMATS.has(outputFormat)
    const outputPath = resolveOutputPath(videoPath, options.outputPath, outputFormat)
    const videoName = path.basename(videoPath, path.extname(videoPath))

    if (isAudio) {
      sendLog(`Extracting audio from ${videoName}`)
      onProgress({
        current: 0,
        total: 1,
        stage: 'reassembling',
        message: `Extracting audio to ${outputFormat}...`,
        overall: 0.5
      })

      await extractAudio(videoPath, outputPath, outputFormat)

      onProgress({
        current: 1,
        total: 1,
        stage: 'done',
        message: 'Audio extraction complete!',
        overall: 1.0
      })
      sendLog(`Audio extraction complete! Output: ${outputPath}`)

      return outputPath
    }

    sendLog(`Starting upscale for ${videoName}`)
    sendLog(`Model: ${model}, Scale: ${scale}x`)
    sendLog(`Output format: ${outputFormat}`)
    if (ttaMode) sendLog('TTA mode: enabled')
    if (tileSize && tileSize > 0) sendLog(`Tile size: ${tileSize}`)

    const tempDir = createNcnnTempDir()
    const frameDir = path.join(tempDir, 'frames')
    const upscaledDir = path.join(tempDir, 'upscaled')
    fs.mkdirSync(frameDir, { recursive: true })
    fs.mkdirSync(upscaledDir, { recursive: true })

    try {
      const totalFrames = await getFrameCount(videoPath)
      sendLog(`Total frames to process: ${totalFrames}`)

      const fps = await getVideoFps(videoPath)
      sendLog(`Video FPS: ${fps}`)

      onProgress({
        current: 0,
        total: totalFrames,
        stage: 'extracting',
        message: 'Extracting frames from video...'
      })
      sendLog('Extracting frames with ffmpeg...')
      await extractFrames(videoPath, frameDir, totalFrames, (current) => {
        onProgress({
          current,
          total: totalFrames,
          stage: 'extracting',
          message: `Extracting frame ${current}/${totalFrames}`,
          overall: 0
        })
      })

      const frameFiles = fs
        .readdirSync(frameDir)
        .filter((f) => f.endsWith('.jpg'))
        .sort()
      const actualFrameCount = frameFiles.length
      sendLog(`Extracted ${actualFrameCount} frames. Starting upscale...`)

      const effectiveBatchSize = batchSize ?? 10
      sendLog(`Processing in batches of ${effectiveBatchSize} frames to limit memory usage`)

      onProgress({
        current: 0,
        total: actualFrameCount,
        stage: 'upscaling',
        message: 'Upscaling frames...'
      })
      await upscaleFramesBatch(
        frameDir,
        upscaledDir,
        model,
        scale,
        actualFrameCount,
        ttaMode ?? false,
        tileSize ?? 0,
        effectiveBatchSize,
        (current) => {
          onProgress({
            current,
            total: actualFrameCount,
            stage: 'upscaling',
            message: `Upscaling frame ${current}/${actualFrameCount}`,
            overall: 0.15 + 0.75 * (current / actualFrameCount)
          })
        }
      )

      sendLog('Reassembling video with ffmpeg...')
      onProgress({
        current: 0,
        total: 1,
        stage: 'reassembling',
        message: 'Reassembling video...',
        overall: 0.93
      })
      await reassembleVideo(upscaledDir, outputPath, fps, outputFormat)

      onProgress({
        current: 1,
        total: 1,
        stage: 'done',
        message: 'Upscaling complete!',
        overall: 1.0
      })
      sendLog(`Upscaling complete! Output: ${outputPath}`)

      return outputPath
    } finally {
      removeTempDir(tempDir)
    }
  }

  async upscaleImages(options: EngineImageUpscaleOptions): Promise<string[]> {
    const { inputPaths, model, scale, ttaMode, tileSize, onProgress, sendLog } = options
    if (inputPaths.length === 0) return []

    const outputFormat = (options.outputFormat || 'png').toLowerCase().replace(/^\./, '')
    const format = outputFormat === 'jpeg' ? 'jpg' : outputFormat
    const compression =
      options.outputQuality !== undefined
        ? format === 'png'
          ? Math.max(0, Math.min(9, Math.round(options.outputQuality / 10)))
          : options.outputQuality
        : format === 'png'
          ? 0
          : 95

    sendLog(
      `[NCNN] Starting image upscale with model '${model}', scale ${scale}x, format ${format}`
    )
    if (ttaMode) sendLog('[NCNN] TTA mode enabled')
    if (tileSize && tileSize > 0) sendLog(`[NCNN] Tile size: ${tileSize}`)

    const tempDir = createNcnnTempDir()

    try {
      if (inputPaths.length === 1) {
        const inputPath = inputPaths[0]
        const finalOutputPath = resolveImageOutputPath(inputPath, options.outputPath, format)
        const tempOutputFile = path.join(tempDir, `upscaled_${Date.now()}.${format}`)

        sendLog(`[NCNN] Upscaling single image: ${path.basename(inputPath)}`)
        onProgress({
          current: 0,
          total: 100,
          stage: 'upscaling',
          message: `Upscaling ${path.basename(inputPath)}...`,
          overall: 0
        })

        await runUpscaylBinImage({
          inputPath,
          outputPath: tempOutputFile,
          model,
          scale: String(scale),
          format,
          compression,
          ttaMode: ttaMode ?? false,
          tileSize: tileSize ?? 0,
          onProgressLine: (line) => {
            const match = line.match(/(\d+(?:\.\d+)?)%/)
            if (match) {
              const pct = parseFloat(match[1])
              onProgress({
                current: Math.round(pct),
                total: 100,
                stage: 'upscaling',
                message: `Upscaling image (${Math.round(pct)}%)...`,
                overall: pct / 100
              })
            }
          }
        })

        if (!fs.existsSync(tempOutputFile)) {
          throw new Error('upscayl-bin completed but output image was not generated.')
        }

        fs.mkdirSync(path.dirname(finalOutputPath), { recursive: true })
        fs.renameSync(tempOutputFile, finalOutputPath)

        onProgress({
          current: 1,
          total: 1,
          stage: 'done',
          message: 'Upscaling complete!',
          overall: 1.0
        })
        sendLog(`[NCNN] Image upscaled successfully: ${finalOutputPath}`)
        return [finalOutputPath]
      }

      // Batch image upscaling
      const total = inputPaths.length
      sendLog(`[NCNN] Starting batch upscale for ${total} images`)

      const inDir = path.join(tempDir, 'in')
      const outDir = path.join(tempDir, 'out')
      fs.mkdirSync(inDir, { recursive: true })
      fs.mkdirSync(outDir, { recursive: true })

      // Create hard links or copy images into inDir
      const mapping: { stagedName: string; originalPath: string }[] = []
      for (let i = 0; i < inputPaths.length; i++) {
        const orig = inputPaths[i]
        const ext = path.extname(orig)
        const stagedName = `img_${String(i).padStart(6, '0')}${ext}`
        const stagedPath = path.join(inDir, stagedName)
        try {
          fs.linkSync(orig, stagedPath)
        } catch {
          fs.copyFileSync(orig, stagedPath)
        }
        mapping.push({ stagedName, originalPath: orig })
      }

      onProgress({
        current: 0,
        total,
        stage: 'upscaling',
        message: `Starting batch upscaling for ${total} images...`,
        overall: 0,
        batchInfo: {
          currentVideo: 0,
          totalVideos: total,
          videoName: path.basename(inputPaths[0])
        }
      })

      // Interval to monitor generated output files in outDir
      let completedCount = 0
      const seenFiles = new Set<string>()
      const checkInterval = setInterval(() => {
        try {
          if (!fs.existsSync(outDir)) return
          const files = fs.readdirSync(outDir)
          for (const f of files) {
            if (!seenFiles.has(f)) {
              seenFiles.add(f)
              completedCount++
              const currentName = path.basename(
                inputPaths[Math.min(completedCount - 1, total - 1)] ?? ''
              )
              onProgress({
                current: completedCount,
                total,
                stage: 'upscaling',
                message: `Upscaled ${completedCount}/${total} images`,
                overall: completedCount / total,
                batchInfo: {
                  currentVideo: completedCount,
                  totalVideos: total,
                  videoName: currentName
                }
              })
            }
          }
        } catch {
          // Ignore polling errors
        }
      }, 300)

      try {
        await runUpscaylBinImage({
          inputPath: inDir,
          outputPath: outDir,
          model,
          scale: String(scale),
          format,
          compression,
          ttaMode: ttaMode ?? false,
          tileSize: tileSize ?? 0
        })
      } finally {
        clearInterval(checkInterval)
      }

      // Move generated files to target destinations
      const resultPaths: string[] = []
      let failedCount = 0

      for (let i = 0; i < mapping.length; i++) {
        const { stagedName, originalPath } = mapping[i]
        const baseStaged = path.basename(stagedName, path.extname(stagedName))
        const generatedCandidate = path.join(outDir, `${baseStaged}.${format}`)

        if (fs.existsSync(generatedCandidate)) {
          const targetFinal = resolveImageOutputPath(originalPath, options.outputPath, format)
          fs.mkdirSync(path.dirname(targetFinal), { recursive: true })
          fs.renameSync(generatedCandidate, targetFinal)
          resultPaths.push(targetFinal)
        } else {
          failedCount++
          sendLog(`[NCNN] Warning: Image failed to upscale: ${path.basename(originalPath)}`)
        }
      }

      if (failedCount > 0) {
        sendLog(`[NCNN] Batch finished with ${failedCount} failures out of ${total} images.`)
      }

      onProgress({
        current: total,
        total,
        stage: 'done',
        message: `Batch upscaled ${resultPaths.length}/${total} images successfully!`,
        overall: 1.0,
        batchInfo: {
          currentVideo: total,
          totalVideos: total,
          videoName: `${resultPaths.length}/${total} done`
        }
      })
      sendLog(`[NCNN] Batch complete. ${resultPaths.length}/${total} images saved.`)

      return resultPaths
    } finally {
      removeTempDir(tempDir)
    }
  }

  stop(): void {
    stopNcnnProcesses()
  }
}
