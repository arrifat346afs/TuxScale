import { app } from 'electron'
import { execFile, spawn, type ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'

export type ProgressData = {
  current: number
  total: number
  stage: 'extracting' | 'upscaling' | 'reassembling' | 'done'
  message?: string
  overall?: number
  batchInfo?: {
    currentVideo: number
    totalVideos: number
    videoName: string
  }
}

export const FORMAT_CONFIG: Record<
  string,
  { codec: string; pixFmt: string; ext: string; audioCodec?: string }
> = {
  mp4: { codec: 'libx264', pixFmt: 'yuv420p', ext: '.mp4' },
  webm: { codec: 'libvpx-vp9', pixFmt: 'yuva420p', ext: '.webm' },
  mkv: { codec: 'libx264', pixFmt: 'yuv420p', ext: '.mkv' },
  avi: { codec: 'mpeg4', pixFmt: 'yuv420p', ext: '.avi' },
  mov: { codec: 'libx264', pixFmt: 'yuv420p', ext: '.mov' },
  mp3: { codec: 'libmp3lame', pixFmt: '', ext: '.mp3', audioCodec: 'libmp3lame' },
  wav: { codec: 'pcm_s16le', pixFmt: '', ext: '.wav', audioCodec: 'pcm_s16le' },
  aac: { codec: 'aac', pixFmt: '', ext: '.aac', audioCodec: 'aac' },
  flac: { codec: 'flac', pixFmt: '', ext: '.flac', audioCodec: 'flac' }
}

export type UpscaleVideoOptions = {
  videoPath: string
  outputPath?: string
  model: string
  scale: string
  ttaMode?: boolean
  tileSize?: number
  outputFormat?: string
  onProgress: (data: ProgressData) => void
  sendLog: (message: string) => void
}

let currentProcesses: ChildProcess[] = []
let tempDirCleanup: string[] = []

export function stopAllProcesses(): void {
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

function trackProcess(proc: ChildProcess): void {
  currentProcesses.push(proc)
  proc.on('close', () => {
    currentProcesses = currentProcesses.filter((p) => p !== proc)
  })
}

function getBinaryPath(): string {
  const platform = process.platform
  const binaryName = platform === 'win32' ? 'upscayl-bin.exe' : 'upscayl-bin'
  const binaryDir = app.isPackaged
    ? path.join(process.resourcesPath, platform, 'bin')
    : path.join(process.cwd(), 'resources', platform, 'bin')
  return path.join(binaryDir, binaryName)
}

function getModelPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'models')
    : path.join(process.cwd(), 'resources', 'models')
}

function getTempDir(): string {
  const tempBase = app.getPath('temp')
  const dir = path.join(tempBase, 'videoup-temp', Date.now().toString())
  fs.mkdirSync(dir, { recursive: true })
  tempDirCleanup.push(dir)
  return dir
}

function getVideoFps(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=r_frame_rate',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        videoPath
      ],
      (error, stdout) => {
        if (error) return reject(error)
        const fpsStr = stdout.trim()
        if (fpsStr.includes('/')) {
          const [num, den] = fpsStr.split('/').map(Number)
          resolve(num / den)
        } else {
          resolve(Number(fpsStr))
        }
      }
    )
  })
}

function getFrameCount(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      [
        '-v',
        'error',
        '-count_frames',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=nb_read_frames',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        videoPath
      ],
      (error, stdout) => {
        if (error) {
          getFrameCountFallback(videoPath).then(resolve).catch(reject)
          return
        }
        const count = parseInt(stdout.trim())
        if (!isNaN(count) && count > 0) {
          resolve(count)
        } else {
          getFrameCountFallback(videoPath).then(resolve).catch(reject)
        }
      }
    )
  })
}

async function getFrameCountFallback(videoPath: string): Promise<number> {
  const [fps, duration] = await Promise.all([getVideoFps(videoPath), getVideoDuration(videoPath)])
  return Math.round(fps * duration)
}

function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        videoPath
      ],
      (error, stdout) => {
        if (error) return reject(error)
        resolve(parseFloat(stdout.trim()))
      }
    )
  })
}

function extractFrames(
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

function upscaleFramesBatch(
  frameDir: string,
  upscaledDir: string,
  model: string,
  scale: string,
  totalFrames: number,
  ttaMode: boolean,
  tileSize: number,
  onProgress: (current: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const binaryPath = getBinaryPath()
    const modelPath = getModelPath()

    const args = [
      '-i',
      frameDir,
      '-o',
      upscaledDir,
      '-m',
      modelPath,
      '-n',
      model,
      '-s',
      scale,
      // Lower concurrency to avoid excessive RAM usage.
      // The previous 2:4:2 setting processed 4 frames simultaneously,
      // which could consume ~14 GB on high-res/4x upscales.
      '-j',
      '1:1:1',
      '-f',
      'jpg',
      '-c',
      '5'
    ]

    if (ttaMode) {
      args.push('-x')
    }

    if (tileSize > 0) {
      args.push('-t', String(tileSize))
    }

    const proc = spawn(binaryPath, args)

    trackProcess(proc)

    let completedFrames = 0
    proc.stderr?.on('data', (data: Buffer) => {
      const output = data.toString()
      const matches = output.match(/100\.00%/g)
      if (matches) {
        completedFrames += matches.length
        onProgress(Math.min(completedFrames, totalFrames))
      }
    })

    proc.on('close', (code) => {
      if (code === 0) {
        onProgress(totalFrames)
        resolve()
      } else if (code === null) {
        reject(new Error('Process was terminated'))
      } else {
        reject(new Error(`upscayl-bin exited with code ${code}`))
      }
    })

    proc.on('error', reject)
  })
}

function reassembleVideo(
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

function extractAudio(videoPath: string, outputPath: string, format: string): Promise<void> {
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

const AUDIO_FORMATS = new Set(['mp3', 'wav', 'aac', 'flac'])

export async function upscaleSingleVideo(options: UpscaleVideoOptions): Promise<string> {
  const { videoPath, model, scale, ttaMode, tileSize, onProgress, sendLog } = options
  const outputFormat = options.outputFormat ?? 'mp4'
  const cfg = FORMAT_CONFIG[outputFormat] ?? FORMAT_CONFIG['mp4']
  const isAudio = AUDIO_FORMATS.has(outputFormat)

  const videoName = path.basename(videoPath, path.extname(videoPath))
  let outputPath = options.outputPath

  if (!outputPath) {
    const dir = path.dirname(videoPath)
    const suffix = isAudio ? '_audio' : '_upscaled'
    outputPath = path.join(dir, `${videoName}${suffix}${cfg.ext}`)
  } else if (!outputPath.endsWith(cfg.ext)) {
    outputPath = `${outputPath}${cfg.ext}`
  }

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

  const tempDir = getTempDir()
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
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  }
}
