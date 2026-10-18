import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import { getProxyPath, hasCachedProxy, getFrameCachePath, hasCachedFrame } from './cache'
import { probeVideo } from './probe'

export const PREVIEW_MAX_SECONDS = 60

const activeTranscodes = new Map<string, ChildProcess>()

/**
 * Cancels any active proxy transcode for the given video path.
 */
export function cancelProxy(videoPath: string): void {
  const proc = activeTranscodes.get(videoPath)
  if (proc) {
    try {
      proc.kill('SIGKILL')
    } catch {
      // Ignore
    }
    activeTranscodes.delete(videoPath)
  }
  const proxyPath = getProxyPath(videoPath)
  const partPath = `${proxyPath}.part.mp4`
  try {
    if (fs.existsSync(partPath)) {
      fs.unlinkSync(partPath)
    }
  } catch {
    // Ignore
  }
}

/**
 * Generates an H.264 proxy with ffmpeg if not already cached.
 * Scaled to max 1280 px wide, ultrafast preset, crf 26, yuv420p, no audio, faststart.
 * Truncated to PREVIEW_MAX_SECONDS (60) if original duration exceeds 60s.
 */
export async function generateProxy(
  videoPath: string,
  duration?: number
): Promise<{ proxyPath: string; truncated: boolean }> {
  let dur = duration
  if (dur === undefined) {
    try {
      const info = await probeVideo(videoPath)
      dur = info.duration
    } catch {
      dur = 0
    }
  }
  const isTruncated = dur > PREVIEW_MAX_SECONDS
  const proxyPath = getProxyPath(videoPath)

  if (hasCachedProxy(videoPath)) {
    return { proxyPath, truncated: isTruncated }
  }

  // Cancel any existing run for this path
  cancelProxy(videoPath)

  const partPath = `${proxyPath}.part.mp4`

  const args: string[] = ['-y']
  // Input
  args.push('-i', videoPath)
  // Limit to first 60 seconds if longer
  if (isTruncated) {
    args.push('-t', String(PREVIEW_MAX_SECONDS))
  }
  // Video filter: scale to max 1280 px wide, keeping aspect ratio (height divisible by 2)
  args.push('-vf', "scale='min(1280,iw)':-2")
  // Fast H.264 encoding options
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '26',
    '-pix_fmt',
    'yuv420p',
    '-an',
    '-movflags',
    '+faststart',
    partPath
  )

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    activeTranscodes.set(videoPath, proc)

    let stderr = ''
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      if (stderr.length > 4000) {
        stderr = stderr.slice(-2000)
      }
    })

    proc.on('close', (code) => {
      activeTranscodes.delete(videoPath)
      if (code === 0 && fs.existsSync(partPath)) {
        try {
          fs.renameSync(partPath, proxyPath)
          resolve({ proxyPath, truncated: isTruncated })
        } catch (err) {
          reject(new Error(`Failed to save preview proxy: ${err}`))
        }
      } else {
        try {
          if (fs.existsSync(partPath)) fs.unlinkSync(partPath)
        } catch {
          // Ignore
        }
        reject(new Error(`FFmpeg proxy transcode exited with code ${code}: ${stderr}`))
      }
    })

    proc.on('error', (err) => {
      activeTranscodes.delete(videoPath)
      try {
        if (fs.existsSync(partPath)) fs.unlinkSync(partPath)
      } catch {
        // Ignore
      }
      reject(err)
    })
  })
}

/**
 * Extracts a single JPEG frame at timestamp t via ffmpeg.
 */
export function extractFrame(videoPath: string, timestamp: number): Promise<string> {
  const framePath = getFrameCachePath(videoPath, timestamp)
  if (hasCachedFrame(videoPath, timestamp)) {
    return Promise.resolve(framePath)
  }

  const partPath = `${framePath}.part.jpg`
  const clampedT = Math.max(0, timestamp)

  // -ss before -i enables fast seeking
  const args = [
    '-y',
    '-ss',
    clampedT.toFixed(3),
    '-i',
    videoPath,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    partPath
  ]

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(partPath)) {
        try {
          fs.renameSync(partPath, framePath)
          resolve(framePath)
        } catch (err) {
          reject(err)
        }
      } else {
        try {
          if (fs.existsSync(partPath)) fs.unlinkSync(partPath)
        } catch {
          // Ignore
        }
        reject(new Error(`Frame extraction exited with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      try {
        if (fs.existsSync(partPath)) fs.unlinkSync(partPath)
      } catch {
        // Ignore
      }
      reject(err)
    })
  })
}
