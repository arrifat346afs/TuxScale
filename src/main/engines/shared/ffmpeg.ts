import { execFile } from 'child_process'

export function getVideoFps(videoPath: string): Promise<number> {
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

export function getVideoDuration(videoPath: string): Promise<number> {
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

export async function getFrameCountFallback(videoPath: string): Promise<number> {
  const [fps, duration] = await Promise.all([getVideoFps(videoPath), getVideoDuration(videoPath)])
  return Math.round(fps * duration)
}

export function getFrameCount(videoPath: string): Promise<number> {
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

export function getVideoResolution(videoPath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=s=x:p=0',
        videoPath
      ],
      (error, stdout) => {
        if (error) return reject(error)
        const [w, h] = stdout.trim().split('x').map(Number)
        resolve({ width: w, height: h })
      }
    )
  })
}
