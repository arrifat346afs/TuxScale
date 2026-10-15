import { spawn, type ChildProcess } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import readline from 'readline'
import type { Engine, EngineUpscaleOptions, EngineStatus } from '../types'
import { detectPyTorch, getScriptPath, resolvePythonCommand, type PyTorchDetection } from './detect'
import { parseProgressLine } from './progress'
import { resolveOutputPath, FORMAT_CONFIG } from '../shared/output'

export const PYTORCH_MODELS = ['realesr-animevideov3']

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
      details: detection.details
    }
  }

  getModels(): string[] {
    return [...PYTORCH_MODELS]
  }

  async upscale(options: EngineUpscaleOptions): Promise<string> {
    const { videoPath, model, scale, customPythonPath, tileSize, onProgress, sendLog } = options
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

    const pythonBin = resolvePythonCommand(customPythonPath)
    const weightsDir = path.join(app.getPath('userData'), 'models')

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

    sendLog(`[PyTorch] Starting stream upscale for ${path.basename(videoPath)}`)
    sendLog(`[PyTorch] Model: ${model}, Scale: ${scale}x`)
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
      String(tileSize ?? 0),
      '--ffmpeg-bin',
      'ffmpeg',
      '--weights-dir',
      weightsDir
    ]

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
      } catch {
        // Ignore
      }
    }
    this.currentPartialFiles = []
  }
}
