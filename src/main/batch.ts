import fs from 'fs'
import path from 'path'
import {
  FORMAT_CONFIG,
  upscaleSingleVideo,
  type ProgressData,
  type UpscaleVideoOptions
} from './upscale'
import { getVideoFiles } from './video-utils'

export type UpscaleFolderOptions = Omit<UpscaleVideoOptions, 'videoPath' | 'onProgress'> & {
  folderPath: string
  onProgress: (data: ProgressData) => void
}

const DEFAULT_OUTPUT_FOLDER_NAME = 'upscaled'

let batchCancelled = false

export function cancelBatch(): void {
  batchCancelled = true
}

export async function upscaleFolder(options: UpscaleFolderOptions): Promise<string[]> {
  batchCancelled = false
  const {
    folderPath,
    outputPath: outputFolder,
    model,
    scale,
    ttaMode,
    tileSize,
    outputFormat,
    onProgress,
    sendLog
  } = options

  const videoFiles = getVideoFiles(folderPath)

  if (videoFiles.length === 0) {
    throw new Error('No supported video files found in the selected folder.')
  }

  sendLog(`Found ${videoFiles.length} video(s) in ${folderPath}`)

  const outputFormatNorm = outputFormat ?? 'mp4'
  const cfg = FORMAT_CONFIG[outputFormatNorm] ?? FORMAT_CONFIG['mp4']

  const effectiveOutputFolder = outputFolder ?? path.join(folderPath, DEFAULT_OUTPUT_FOLDER_NAME)
  if (!fs.existsSync(effectiveOutputFolder)) {
    fs.mkdirSync(effectiveOutputFolder, { recursive: true })
    sendLog(`Created output folder: ${effectiveOutputFolder}`)
  }
  sendLog(`Output folder: ${effectiveOutputFolder}`)

  const results: string[] = []

  for (let i = 0; i < videoFiles.length; i++) {
    if (batchCancelled) {
      sendLog('Batch processing cancelled.')
      break
    }

    const videoPath = videoFiles[i]
    const videoName = path.basename(videoPath, path.extname(videoPath))
    const displayName = path.basename(videoPath)

    const perVideoOutputPath = path.join(effectiveOutputFolder, `${videoName}_upscaled${cfg.ext}`)

    sendLog(`[${i + 1}/${videoFiles.length}] Starting: ${displayName}`)

    try {
      const resultPath = await upscaleSingleVideo({
        videoPath,
        outputPath: perVideoOutputPath,
        model,
        scale,
        ttaMode,
        tileSize,
        outputFormat,
        onProgress: (data) => {
          onProgress({
            ...data,
            batchInfo: {
              currentVideo: i + 1,
              totalVideos: videoFiles.length,
              videoName: displayName
            }
          })
        },
        sendLog
      })

      results.push(resultPath)
      sendLog(`[${i + 1}/${videoFiles.length}] Completed: ${resultPath}`)
    } catch (error) {
      if (batchCancelled) {
        sendLog('Batch processing cancelled.')
        break
      }

      const message = error instanceof Error ? error.message : 'Unknown error'
      sendLog(`[${i + 1}/${videoFiles.length}] Failed: ${displayName} - ${message}`)
    }
  }

  if (batchCancelled) {
    throw new Error('Batch processing was cancelled.')
  }

  if (results.length === 0) {
    throw new Error('No videos were successfully upscaled.')
  }

  sendLog(`Batch complete. ${results.length}/${videoFiles.length} video(s) upscaled.`)
  return results
}
