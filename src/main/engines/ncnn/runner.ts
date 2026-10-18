import { app } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { FORMAT_CONFIG } from '../shared/output'

let currentProcesses: ChildProcess[] = []
let tempDirCleanup: string[] = []

export function stopNcnnProcesses(): void {
  for (const proc of currentProcesses) {
    if (!proc.killed) {
      proc.kill('SIGTERM')
    }
  }
  currentProcesses = []

  for (const dir of tempDirCleanup) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  }
  tempDirCleanup = []
}

export function trackProcess(proc: ChildProcess): void {
  currentProcesses.push(proc)
  proc.on('close', () => {
    currentProcesses = currentProcesses.filter((p) => p !== proc)
  })
}

export function getBinaryPath(): string {
  const platform = process.platform
  const binaryName = platform === 'win32' ? 'upscayl-bin.exe' : 'upscayl-bin'
  const binaryDir = app.isPackaged
    ? path.join(process.resourcesPath, platform, 'bin')
    : path.join(process.cwd(), 'resources', platform, 'bin')
  return path.join(binaryDir, binaryName)
}

export function getModelPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'models')
    : path.join(process.cwd(), 'resources', 'models')
}

export function createNcnnTempDir(): string {
  const tempBase = app.getPath('temp')
  const dir = path.join(tempBase, 'tuxscale-temp', Date.now().toString())
  fs.mkdirSync(dir, { recursive: true })
  tempDirCleanup.push(dir)
  return dir
}

export function removeTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
  tempDirCleanup = tempDirCleanup.filter((d) => d !== dir)
}

export function extractFrames(
  videoPath: string,
  frameDir: string,
  totalFrames: number,
  onProgress: (current: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-i', videoPath, '-q:v', '2', frameDir + '/frame_%06d.jpg'])

    trackProcess(proc)

    let lastFrame = 0
    proc.stderr?.on('data', (data: Buffer) => {
      const output = data.toString()
      const match = output.match(/frame=\s*(\d+)/)
      if (match) {
        lastFrame = parseInt(match[1])
        onProgress(lastFrame)
      }
    })

    proc.on('close', (code) => {
      if (code === 0) {
        onProgress(totalFrames)
        resolve()
      } else if (code === null) {
        reject(new Error('Process was terminated'))
      } else {
        reject(new Error(`ffmpeg frame extraction exited with code ${code}`))
      }
    })

    proc.on('error', reject)
  })
}

export function runUpscaylBin(
  inputDir: string,
  outputDir: string,
  model: string,
  scale: string,
  ttaMode: boolean,
  tileSize: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const binaryPath = getBinaryPath()
    const modelPath = getModelPath()

    const args = [
      '-i',
      inputDir,
      '-o',
      outputDir,
      '-m',
      modelPath,
      '-n',
      model,
      '-s',
      scale,
      '-j',
      '1:1:1',
      '-f',
      'jpg',
      '-c',
      '5'
    ]

    if (ttaMode) args.push('-x')
    if (tileSize > 0) args.push('-t', String(tileSize))

    const proc = spawn(binaryPath, args)
    trackProcess(proc)

    proc.on('close', (code) => {
      if (code === 0) resolve()
      else if (code === null) reject(new Error('Process was terminated'))
      else reject(new Error(`upscayl-bin exited with code ${code}`))
    })

    proc.on('error', reject)
  })
}

export function runUpscaylBinImage(options: {
  inputPath: string
  outputPath: string
  model: string
  scale: string
  format: string
  compression?: number
  ttaMode?: boolean
  tileSize?: number
  onProgressLine?: (line: string) => void
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const binaryPath = getBinaryPath()
    const modelPath = getModelPath()

    const args = [
      '-i',
      options.inputPath,
      '-o',
      options.outputPath,
      '-m',
      modelPath,
      '-n',
      options.model,
      '-s',
      options.scale,
      '-f',
      options.format,
      '-c',
      String(options.compression ?? (options.format === 'png' ? 0 : 5))
    ]

    if (options.ttaMode) args.push('-x')
    if (options.tileSize && options.tileSize > 0) args.push('-t', String(options.tileSize))

    const proc = spawn(binaryPath, args)
    trackProcess(proc)

    proc.stdout?.on('data', (data: Buffer) => {
      options.onProgressLine?.(data.toString('utf-8'))
    })

    proc.stderr?.on('data', (data: Buffer) => {
      options.onProgressLine?.(data.toString('utf-8'))
    })

    proc.on('close', (code) => {
      if (code === 0) resolve()
      else if (code === null) reject(new Error('Process was terminated'))
      else reject(new Error(`upscayl-bin exited with code ${code}`))
    })

    proc.on('error', reject)
  })
}

export async function upscaleFramesBatch(
  frameDir: string,
  upscaledDir: string,
  model: string,
  scale: string,
  totalFrames: number,
  ttaMode: boolean,
  tileSize: number,
  batchSize: number,
  onProgress: (current: number) => void
): Promise<void> {
  const frameFiles = fs
    .readdirSync(frameDir)
    .filter((f) => f.endsWith('.jpg'))
    .sort()

  let completedFrames = 0

  for (let i = 0; i < frameFiles.length; i += batchSize) {
    const batch = frameFiles.slice(i, i + batchSize)
    const batchInputDir = path.join(frameDir, `_batch_in_${i}`)
    const batchOutputDir = path.join(frameDir, `_batch_out_${i}`)

    fs.mkdirSync(batchInputDir, { recursive: true })
    fs.mkdirSync(batchOutputDir, { recursive: true })

    for (const frame of batch) {
      fs.renameSync(path.join(frameDir, frame), path.join(batchInputDir, frame))
    }

    await runUpscaylBin(batchInputDir, batchOutputDir, model, scale, ttaMode, tileSize)

    const outputFiles = fs.readdirSync(batchOutputDir)
    for (const f of outputFiles) {
      fs.renameSync(path.join(batchOutputDir, f), path.join(upscaledDir, f))
    }

    fs.rmSync(batchInputDir, { recursive: true, force: true })
    fs.rmSync(batchOutputDir, { recursive: true, force: true })

    completedFrames += batch.length
    onProgress(Math.min(completedFrames, totalFrames))
  }
}

export function reassembleVideo(
  frameDir: string,
  outputPath: string,
  fps: number,
  format: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cfg = FORMAT_CONFIG[format] ?? FORMAT_CONFIG['mp4']
    const args = ['-i', path.join(frameDir, 'frame_%06d.jpg'), '-c:v', cfg.codec]

    if (cfg.pixFmt) {
      args.push('-pix_fmt', cfg.pixFmt)
    }

    args.push('-r', String(fps), '-y', outputPath)

    const proc = spawn('ffmpeg', args)
    trackProcess(proc)

    proc.on('close', (code) => {
      if (code === 0) resolve()
      else if (code === null) reject(new Error('Process was terminated'))
      else reject(new Error(`ffmpeg reassembly exited with code ${code}`))
    })

    proc.on('error', reject)
  })
}

export function extractAudio(videoPath: string, outputPath: string, format: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cfg = FORMAT_CONFIG[format] ?? FORMAT_CONFIG['mp3']
    const proc = spawn('ffmpeg', [
      '-i',
      videoPath,
      '-vn',
      '-c:a',
      cfg.audioCodec ?? 'libmp3lame',
      '-y',
      outputPath
    ])

    trackProcess(proc)

    proc.on('close', (code) => {
      if (code === 0) resolve()
      else if (code === null) reject(new Error('Process was terminated'))
      else reject(new Error(`ffmpeg audio extraction exited with code ${code}`))
    })

    proc.on('error', reject)
  })
}
