import path from 'path'
import fs from 'fs'
import type { Engine, EngineUpscaleOptions, EngineStatus } from '../types'
import {
  getBinaryPath,
  getModelPath,
  createNcnnTempDir,
  removeTempDir,
  extractFrames,
  upscaleFramesBatch,
  reassembleVideo,
  extractAudio,
  stopNcnnProcesses
} from './runner'
import { getVideoFps, getFrameCount } from '../shared/ffmpeg'
import { resolveOutputPath, AUDIO_FORMATS } from '../shared/output'
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

  stop(): void {
    stopNcnnProcesses()
  }
}
