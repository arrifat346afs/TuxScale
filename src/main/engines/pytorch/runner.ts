import { spawn, type ChildProcess } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import readline from 'readline'
import type {
  Engine,
  EngineUpscaleOptions,
  EngineImageUpscaleOptions,
  EngineStatus
} from '../types'
import {
  detectPyTorch,
  getScriptPath,
  getImageScriptPath,
  resolvePythonCommand,
  type PyTorchDetection
} from './detect'
import { parseProgressLine } from './progress'
import { resolveOutputPath, FORMAT_CONFIG } from '../shared/output'
import { resolveImageOutputPath } from '../shared/image-output'

export function resolvePyTorchWeightsDir(modelName?: string): string {
  const candidates: string[] = []

  // 1. Packaged resources or project root resources/models
  const resourcesModels = app.isPackaged
    ? path.join(process.resourcesPath, 'models')
    : path.join(process.cwd(), 'resources', 'models')
  candidates.push(resourcesModels)

  // 2. Project root models (<cwd>/models)
  const rootModels = path.join(process.cwd(), 'models')
  candidates.push(rootModels)

  // 3. User data directory (<userData>/models)
  try {
    const userDataModels = path.join(app.getPath('userData'), 'models')
    candidates.push(userDataModels)
  } catch {
    // app.getPath might fail if electron app is not ready
  }

  // If a model is specified, search for the actual .pth file (project root first)
  if (modelName) {
    const filename = `${modelName}.pth`
    for (const dir of candidates) {
      const candidate = path.join(dir, filename)
      if (fs.existsSync(candidate)) {
        try {
          const stat = fs.statSync(candidate)
          // Skip Git LFS pointer stubs (< 1MB) so search continues or downloads real weights
          if (stat.size >= 1024 * 1024) {
            return dir
          }
        } catch {
          // Ignore
        }
      }
    }
  }

  // If no weights file was found, prefer an existing directory (project root first)
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir
    }
  }

  return candidates[0] || path.join(app.getPath('userData'), 'models')
}

export const PYTORCH_MODELS = [
  'realesr-animevideov3',
  'realesr-general-wdn-x4v3',
  '4x-UltraSharpV2'
]

export class PyTorchEngine implements Engine {
  readonly id = 'pytorch' as const
  private activeProcesses: ChildProcess[] = []
  private currentPartialFiles: string[] = []

  async isAvailable(customPythonPath?: string): Promise<boolean> {
    const status = await this.detect(customPythonPath)
    return status.available
  }

  async detect(customPythonPath?: string): Promise<PyTorchDetection> {
    return detectPyTorch(customPythonPath)
  }

  async getStatus(customPythonPath?: string): Promise<EngineStatus> {
    const detection = await this.detect(customPythonPath)
    return {
      backend: 'pytorch',
      available: detection.available,
      gpuName: detection.gpuName,
      pythonInfo: detection.pythonInfo,
      details: detection.details
    }
  }

  getModels(): string[] {
    const models = new Set(PYTORCH_MODELS)
    const dirs = [
      app.isPackaged
        ? path.join(process.resourcesPath, 'models')
        : path.join(process.cwd(), 'resources', 'models'),
      path.join(process.cwd(), 'models')
    ]
    try {
      dirs.push(path.join(app.getPath('userData'), 'models'))
    } catch {
      // Ignore
    }

    for (const dir of dirs) {
      if (fs.existsSync(dir)) {
        try {
          const files = fs.readdirSync(dir)
          for (const file of files) {
            if (file.endsWith('.pth')) {
              models.add(path.basename(file, '.pth'))
            }
          }
        } catch {
          // Ignore read error
        }
      }
    }
    return Array.from(models)
  }

  async upscale(options: EngineUpscaleOptions): Promise<string> {
    const {
      videoPath,
      model,
      scale,
      customPythonPath,
      tileSize,
      onProgress,
      sendLog,
      pytorchLowVram,
      pytorchEncoder,
      pytorchSkipDuplicates
    } = options
    const outputFormat = options.outputFormat ?? 'mp4'

    const detection = await this.detect(customPythonPath)
    if (!detection.available) {
      const failing = Object.entries(detection.details)
        .filter(([, v]) => !v.ok)
        .map(([k, v]) => `${k}: ${v.message}`)
        .join(' | ')
      throw new Error(`PyTorch backend is unavailable: ${failing}`)
    }

    const scriptPath = getScriptPath()
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`PyTorch worker script not found at: ${scriptPath}`)
    }

    const pythonBin = resolvePythonCommand(customPythonPath).command
    const weightsDir = resolvePyTorchWeightsDir(model)

    // PyTorch backend directly creates an MP4 file
    const needsConversion = outputFormat !== 'mp4'
    const intermediateMp4 = needsConversion
      ? resolveOutputPath(videoPath, undefined, 'mp4', `_pt_temp_${Date.now()}`)
      : resolveOutputPath(videoPath, options.outputPath, 'mp4')

    const finalOutputPath = resolveOutputPath(videoPath, options.outputPath, outputFormat)

    this.currentPartialFiles = [intermediateMp4]
    if (needsConversion) {
      this.currentPartialFiles.push(finalOutputPath)
    }

    const effectiveTile = pytorchLowVram ? (tileSize && tileSize > 0 ? tileSize : 512) : 0
    const encoderChoice = pytorchEncoder ?? 'auto'

    sendLog(`[PyTorch] Starting stream upscale for ${path.basename(videoPath)}`)
    sendLog(
      `[PyTorch] Model: ${model}, Scale: ${scale}x (Tile: ${effectiveTile}, Encoder: ${encoderChoice})`
    )
    sendLog(`[PyTorch] Weights directory: ${weightsDir}`)
    sendLog(`[PyTorch] Target container: ${outputFormat}`)

    const args = [
      scriptPath,
      '--input',
      videoPath,
      '--output',
      intermediateMp4,
      '--model',
      model,
      '--scale',
      String(scale),
      '--tile',
      String(effectiveTile),
      '--encoder',
      encoderChoice,
      '--ffmpeg-bin',
      'ffmpeg',
      '--weights-dir',
      weightsDir
    ]

    if (pytorchLowVram) {
      args.push('--low-vram')
    }
    if (pytorchSkipDuplicates === false) {
      args.push('--no-skip-duplicates')
    } else {
      args.push('--skip-duplicates')
    }

    onProgress({
      current: 0,
      total: 1,
      stage: 'upscaling',
      message: 'Initializing PyTorch model and streaming pipeline...',
      overall: 0
    })

    // Spawn the Python worker
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(pythonBin, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.activeProcesses.push(proc)

      const rl = readline.createInterface({ input: proc.stdout! })
      rl.on('line', (line) => {
        const prog = parseProgressLine(line)
        if (prog) {
          onProgress(prog)
        }
      })

      proc.stderr?.on('data', (data: Buffer) => {
        const str = data.toString('utf-8')
        const lines = str.split('\n').filter((l) => l.trim().length > 0)
        for (const l of lines) {
          sendLog(l)
        }
      })

      proc.on('close', (code) => {
        this.activeProcesses = this.activeProcesses.filter((p) => p !== proc)
        if (code === 0) {
          resolve()
        } else if (code === null) {
          reject(new Error('PyTorch upscaling process was cancelled'))
        } else {
          reject(new Error(`PyTorch worker failed with exit code ${code}`))
        }
      })

      proc.on('error', (err) => {
        this.activeProcesses = this.activeProcesses.filter((p) => p !== proc)
        reject(new Error(`Failed to spawn Python process (${pythonBin}): ${err.message}`))
      })
    })

    // If conversion is needed (e.g. user requested webm, mkv, avi, mov)
    if (needsConversion) {
      sendLog(`[PyTorch] Converting intermediate MP4 to ${outputFormat.toUpperCase()}...`)
      onProgress({
        current: 0,
        total: 1,
        stage: 'reassembling',
        message: `Converting to ${outputFormat}...`,
        overall: 0.95
      })

      const cfg = FORMAT_CONFIG[outputFormat] ?? FORMAT_CONFIG['mp4']
      await new Promise<void>((resolve, reject) => {
        const convArgs = ['-v', 'error', '-i', intermediateMp4, '-c:v', cfg.codec]
        if (cfg.pixFmt) {
          convArgs.push('-pix_fmt', cfg.pixFmt)
        }
        convArgs.push('-an', '-y', finalOutputPath)

        const proc = spawn('ffmpeg', convArgs)
        this.activeProcesses.push(proc)

        proc.on('close', (code) => {
          this.activeProcesses = this.activeProcesses.filter((p) => p !== proc)
          if (code === 0) {
            resolve()
          } else if (code === null) {
            reject(new Error('Conversion process was cancelled'))
          } else {
            reject(new Error(`FFmpeg format conversion exited with code ${code}`))
          }
        })

        proc.on('error', (err) => {
          this.activeProcesses = this.activeProcesses.filter((p) => p !== proc)
          reject(err)
        })
      })

      // Clean up intermediate mp4
      try {
        if (fs.existsSync(intermediateMp4)) {
          fs.unlinkSync(intermediateMp4)
        }
      } catch {
        // Ignore
      }
    }

    this.currentPartialFiles = []

    onProgress({
      current: 1,
      total: 1,
      stage: 'done',
      message: 'PyTorch upscaling complete!',
      overall: 1.0
    })
    sendLog(`[PyTorch] Upscaling complete! Output: ${finalOutputPath}`)

    return finalOutputPath
  }

  async upscaleImages(options: EngineImageUpscaleOptions): Promise<string[]> {
    const {
      inputPaths,
      model,
      scale,
      customPythonPath,
      tileSize,
      outputQuality,
      onProgress,
      sendLog,
      pytorchLowVram
    } = options
    if (inputPaths.length === 0) return []

    const detection = await this.detect(customPythonPath)
    if (!detection.available) {
      const failing = Object.entries(detection.details)
        .filter(([, v]) => !v.ok)
        .map(([k, v]) => `${k}: ${v.message}`)
        .join(' | ')
      throw new Error(`PyTorch backend is unavailable: ${failing}`)
    }

    const scriptPath = getImageScriptPath()
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`PyTorch image worker script not found at: ${scriptPath}`)
    }

    const pythonBin = resolvePythonCommand(customPythonPath).command
    const weightsDir = resolvePyTorchWeightsDir(model)
    const outputFormat = (options.outputFormat || 'png').toLowerCase().replace(/^\./, '')
    const format = outputFormat === 'jpeg' ? 'jpg' : outputFormat
    const quality = outputQuality ?? 95

    // Resolve non-overwriting distinct output paths for all input files
    const reservedPaths = new Set<string>()
    const resolvedOutputs = inputPaths.map((p) => {
      const out = resolveImageOutputPath(p, options.outputPath, format, reservedPaths)
      reservedPaths.add(out)
      return out
    })
    this.currentPartialFiles = [...resolvedOutputs]

    const total = inputPaths.length
    sendLog(
      `[PyTorch] Starting image upscale for ${total} image(s) with model '${model}', scale ${scale}x, format ${format}`
    )
    if (pytorchLowVram) sendLog('[PyTorch] Low VRAM mode enabled')

    const tempDir = app.getPath('temp')
    const inListFile = path.join(tempDir, `tuxscale_pt_in_${Date.now()}.json`)
    const outListFile = path.join(tempDir, `tuxscale_pt_out_${Date.now()}.json`)

    fs.writeFileSync(inListFile, JSON.stringify(inputPaths), 'utf-8')
    fs.writeFileSync(outListFile, JSON.stringify(resolvedOutputs), 'utf-8')

    const args = [
      scriptPath,
      '--input-list',
      inListFile,
      '--output-list',
      outListFile,
      '--model',
      model,
      '--scale',
      String(scale),
      '--format',
      format,
      '--quality',
      String(quality),
      '--weights-dir',
      weightsDir
    ]

    if (pytorchLowVram) {
      args.push('--low-vram')
    }
    if (tileSize && tileSize > 0) {
      args.push('--tile', String(tileSize))
    }

    onProgress({
      current: 0,
      total,
      stage: 'upscaling',
      message: `Initializing PyTorch image upscaling for ${total} image(s)...`,
      overall: 0,
      batchInfo:
        total > 1
          ? {
              currentVideo: 0,
              totalVideos: total,
              videoName: path.basename(inputPaths[0])
            }
          : undefined
    })

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(pythonBin, args, {
          stdio: ['ignore', 'pipe', 'pipe']
        })
        this.activeProcesses.push(proc)

        const rl = readline.createInterface({ input: proc.stdout! })
        rl.on('line', (line) => {
          const trimmed = line.trim()
          if (trimmed.startsWith('PROGRESS ')) {
            const parts = trimmed.split(' ')
            const current = parseInt(parts[1], 10) || 0
            const tot = parseInt(parts[2], 10) || total
            const isDone = current === tot

            if (total === 1) {
              onProgress({
                current,
                total: tot,
                stage: isDone ? 'done' : 'upscaling',
                message: isDone
                  ? 'Image upscaling complete!'
                  : `Upscaling ${path.basename(inputPaths[0])}...`,
                overall: tot > 0 ? current / tot : 0
              })
            } else {
              const currentName = path.basename(
                inputPaths[Math.min(Math.max(0, current - 1), total - 1)] ?? ''
              )
              onProgress({
                current,
                total: tot,
                stage: isDone ? 'done' : 'upscaling',
                message: isDone
                  ? `Batch upscaling complete! (${tot}/${tot})`
                  : `Upscaled ${current}/${tot} images`,
                overall: tot > 0 ? current / tot : 0,
                batchInfo: {
                  currentVideo: current,
                  totalVideos: tot,
                  videoName: currentName
                }
              })
            }
          }
        })

        proc.stderr?.on('data', (data: Buffer) => {
          const str = data.toString('utf-8')
          const lines = str.split('\n').filter((l) => l.trim().length > 0)
          for (const l of lines) {
            sendLog(l)
          }
        })

        proc.on('close', (code) => {
          this.activeProcesses = this.activeProcesses.filter((p) => p !== proc)
          if (code === 0) {
            resolve()
          } else if (code === null) {
            reject(new Error('PyTorch image upscaling process was cancelled'))
          } else {
            reject(new Error(`PyTorch image worker failed with exit code ${code}`))
          }
        })

        proc.on('error', (err) => {
          this.activeProcesses = this.activeProcesses.filter((p) => p !== proc)
          reject(new Error(`Failed to spawn Python process (${pythonBin}): ${err.message}`))
        })
      })

      const existingOutputs = resolvedOutputs.filter((p) => fs.existsSync(p))
      onProgress({
        current: total,
        total,
        stage: 'done',
        message: 'Image upscaling complete!',
        overall: 1.0,
        batchInfo:
          total > 1
            ? {
                currentVideo: total,
                totalVideos: total,
                videoName: `${existingOutputs.length}/${total} done`
              }
            : undefined
      })
      sendLog(
        `[PyTorch] Upscaling complete! Generated ${existingOutputs.length}/${total} image file(s).`
      )

      this.currentPartialFiles = []
      return existingOutputs
    } finally {
      try {
        if (fs.existsSync(inListFile)) fs.unlinkSync(inListFile)
        if (fs.existsSync(outListFile)) fs.unlinkSync(outListFile)
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  stop(): void {
    for (const proc of this.activeProcesses) {
      if (!proc.killed) {
        try {
          proc.kill('SIGTERM')
        } catch {
          // Ignore
        }
      }
    }
    this.activeProcesses = []

    // Clean up partial files
    for (const file of this.currentPartialFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file)
        }
        const partFile = `${file}.part`
        if (fs.existsSync(partFile)) {
          fs.unlinkSync(partFile)
        }
        const dir = path.dirname(file)
        const base = path.basename(file)
        if (fs.existsSync(dir)) {
          const matching = fs.readdirSync(dir).filter((f) => f.startsWith(`${base}.tmp`))
          for (const m of matching) {
            try {
              fs.unlinkSync(path.join(dir, m))
            } catch {
              // Ignore
            }
          }
        }
      } catch {
        // Ignore
      }
    }
    this.currentPartialFiles = []
  }
}
