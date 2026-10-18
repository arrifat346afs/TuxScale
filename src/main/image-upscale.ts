import { getEngine, resolveBackend } from './engines'
import type { BackendPreference } from './engines/types'
import { getImageFiles } from './engines/shared/image-output'
import type { ProgressData } from '../renderer/src/types'

export type UpscaleImageOptions = {
  imagePath: string
  outputPath?: string
  model: string
  scale: string
  backend?: BackendPreference
  customPythonPath?: string
  ttaMode?: boolean
  tileSize?: number
  outputFormat?: string
  outputQuality?: number
  pytorchLowVram?: boolean
  onProgress: (data: ProgressData) => void
  sendLog: (message: string) => void
}

export type UpscaleImageFolderOptions = {
  folderPath: string
  outputPath?: string
  model: string
  scale: string
  backend?: BackendPreference
  customPythonPath?: string
  ttaMode?: boolean
  tileSize?: number
  outputFormat?: string
  outputQuality?: number
  pytorchLowVram?: boolean
  onProgress: (data: ProgressData) => void
  sendLog: (message: string) => void
}

export async function upscaleSingleImage(options: UpscaleImageOptions): Promise<string> {
  const backendPref = options.backend ?? 'auto'
  const { backend, reason } = await resolveBackend(backendPref, options.customPythonPath)
  options.sendLog(`Selected engine: ${backend} (${reason})`)

  const engine = getEngine(backend)
  const results = await engine.upscaleImages({
    inputPaths: [options.imagePath],
    outputPath: options.outputPath,
    model: options.model,
    scale: options.scale,
    backend: options.backend,
    customPythonPath: options.customPythonPath,
    ttaMode: options.ttaMode,
    tileSize: options.tileSize,
    outputFormat: options.outputFormat,
    outputQuality: options.outputQuality,
    pytorchLowVram: options.pytorchLowVram,
    onProgress: options.onProgress,
    sendLog: options.sendLog
  })

  if (results.length === 0) {
    throw new Error('Image upscaling completed without output.')
  }
  return results[0]
}

export async function upscaleImageFolder(options: UpscaleImageFolderOptions): Promise<string[]> {
  const images = getImageFiles(options.folderPath)
  if (images.length === 0) {
    throw new Error(`No supported image files found in ${options.folderPath}`)
  }

  options.sendLog(`Found ${images.length} image(s) in ${options.folderPath}`)
  const backendPref = options.backend ?? 'auto'
  const { backend, reason } = await resolveBackend(backendPref, options.customPythonPath)
  options.sendLog(`Selected engine: ${backend} (${reason})`)

  const engine = getEngine(backend)
  return engine.upscaleImages({
    inputPaths: images,
    outputPath: options.outputPath || options.folderPath,
    model: options.model,
    scale: options.scale,
    backend: options.backend,
    customPythonPath: options.customPythonPath,
    ttaMode: options.ttaMode,
    tileSize: options.tileSize,
    outputFormat: options.outputFormat,
    outputQuality: options.outputQuality,
    pytorchLowVram: options.pytorchLowVram,
    onProgress: options.onProgress,
    sendLog: options.sendLog
  })
}
