import { execFile } from 'child_process'

export interface VideoProbeInfo {
  codec_name: string
  profile?: string
  pix_fmt: string
  width: number
  height: number
  fps: number
  duration: number
}

/**
 * Probes video stream metadata using ffprobe.
 */
export function probeVideo(videoPath: string): Promise<VideoProbeInfo> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,duration',
        '-show_entries',
        'format=duration',
        '-of',
        'json',
        videoPath
      ],
      (error, stdout) => {
        if (error) {
          return reject(new Error(`Failed to probe video: ${error.message}`))
        }
        try {
          const data = JSON.parse(stdout)
          const stream = data.streams?.[0]
          if (!stream) {
            return reject(new Error('No video stream found in file'))
          }

          let fps = 30
          if (stream.r_frame_rate && typeof stream.r_frame_rate === 'string') {
            if (stream.r_frame_rate.includes('/')) {
              const [num, den] = stream.r_frame_rate.split('/').map(Number)
              if (den > 0 && !isNaN(num) && !isNaN(den)) {
                fps = num / den
              }
            } else {
              const parsed = Number(stream.r_frame_rate)
              if (!isNaN(parsed) && parsed > 0) fps = parsed
            }
          }

          let duration = 0
          if (stream.duration) {
            const d = parseFloat(stream.duration)
            if (!isNaN(d) && d > 0) duration = d
          }
          if (duration === 0 && data.format?.duration) {
            const d = parseFloat(data.format.duration)
            if (!isNaN(d) && d > 0) duration = d
          }

          resolve({
            codec_name: (stream.codec_name || '').toLowerCase(),
            profile: stream.profile || undefined,
            pix_fmt: (stream.pix_fmt || '').toLowerCase(),
            width: Number(stream.width) || 0,
            height: Number(stream.height) || 0,
            fps,
            duration
          })
        } catch (parseError) {
          reject(new Error(`Failed to parse ffprobe output: ${parseError}`))
        }
      }
    )
  })
}

/**
 * Checks whether a video is safe to play natively in Chromium on Linux.
 * Safe cases:
 * - H.264 8-bit (yuv420p / yuvj420p) with dimensions <= 4096 in webm/mkv/mp4
 * - VP8 / VP9 / AV1 with dimensions <= 4096 in webm/mkv/mp4
 * Everything else (HEVC, ProRes, DNxHD, 10-bit H.264, >4K resolution, .mov, etc.) requires proxy.
 */
export function isSafeNative(info: VideoProbeInfo, containerExt = ''): boolean {
  const ext = containerExt.toLowerCase().replace(/^\./, '')

  // 1. Resolution limit: Chromium decoders on Linux fail or lag severely on >4K (e.g. 8K)
  if (info.width > 4096 || info.height > 4096) {
    return false
  }

  // 2. Safe containers as specified in requirements: webm, mkv, mp4, m4v
  // Note: .mov from Adobe (ProRes/DNxHD/etc.) is NOT in safe container list
  const safeContainers = ['mp4', 'm4v', 'webm', 'mkv']
  if (!safeContainers.includes(ext)) {
    return false
  }

  // 3. H.264 8-bit yuv420p / yuvj420p in mp4/m4v/mkv
  const isH264 = info.codec_name === 'h264' || info.codec_name === 'avc1'
  if (isH264) {
    const is8BitPixFmt = info.pix_fmt === 'yuv420p' || info.pix_fmt === 'yuvj420p'
    const profile = (info.profile || '').toLowerCase()
    const is10BitProfile = profile.includes('10') || profile.includes('high 10')
    if (is8BitPixFmt && !is10BitProfile) {
      return true
    }
    return false
  }

  // 4. VP8 / VP9 / AV1 in webm / mkv / mp4
  const isVpOrAv1 = ['vp8', 'vp9', 'av1'].includes(info.codec_name)
  if (isVpOrAv1) {
    return true
  }

  return false
}
