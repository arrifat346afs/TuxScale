import { useState, useCallback, useEffect, useRef } from 'react'
import type { BackendPreference } from '../../../../common/types/types'
import type { ProgressData } from '../types'

export type ImageOutputFormat = 'png' | 'jpg' | 'webp'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'tif']

function isImageFilePath(pathStr: string): boolean {
  const ext = pathStr.split('.').pop()?.toLowerCase()
  return ext ? IMAGE_EXTENSIONS.includes(ext) : false
}

export type SharedUpscaleConfig = {
  model: string
  scale: number[]
  backend: BackendPreference
  customPythonPath?: string
  ttaMode: boolean
  tileSize: string
  pytorchLowVram: boolean
  activeBackend: string
  setIsProcessing: (processing: boolean) => void
  setLogs: React.Dispatch<React.SetStateAction<string[]>>
  setProgress: (prog: ProgressData | null) => void
}

export type UseImageUpscaleReturn = {
  upscaleMode: 'video' | 'image'
  setUpscaleMode: (mode: 'video' | 'image') => void
  imageBatchMode: boolean
  setImageBatchMode: (batch: boolean) => void
  imagePath: string | null
  imageName: string | null
  imageFolderPath: string | null
  folderImageCount: number
  imageOutputPath: string | null
  upscaledImagePath: string | null
  setUpscaledImagePath: (path: string | null) => void
  imageOutputFormat: ImageOutputFormat
  setImageOutputFormat: (format: ImageOutputFormat) => void
  imageQuality: number
  setImageQuality: (quality: number) => void
  handleImageSelected: (path: string) => void
  handleImageFolderSelected: (path: string) => Promise<void>
  handleSelectImage: () => Promise<void>
  handleSelectImageFolder: () => Promise<void>
  handleSelectImageOutputFolder: () => Promise<void>
  handleUpscaleImage: (config: SharedUpscaleConfig) => Promise<void>
}

export function useImageUpscale(): UseImageUpscaleReturn {
  const [upscaleMode, setUpscaleModeState] = useState<'video' | 'image'>(() => {
    return (localStorage.getItem('tuxscale_upscale_mode') as 'video' | 'image') || 'video'
  })

  const [imageBatchMode, setImageBatchMode] = useState<boolean>(() => {
    return localStorage.getItem('imageBatchMode') === 'true'
  })

  const [imagePath, setImagePath] = useState<string | null>(null)
  const [imageName, setImageName] = useState<string | null>(null)
  const [imageFolderPath, setImageFolderPath] = useState<string | null>(null)
  const [folderImageCount, setFolderImageCount] = useState<number>(0)
  const [imageOutputPath, setImageOutputPath] = useState<string | null>(null)
  const [upscaledImagePath, setUpscaledImagePath] = useState<string | null>(null)

  const [imageOutputFormat, setImageOutputFormat] = useState<ImageOutputFormat>(() => {
    return (localStorage.getItem('imageOutputFormat') as ImageOutputFormat) || 'png'
  })

  const [imageQuality, setImageQuality] = useState<number>(() => {
    const saved = localStorage.getItem('imageQuality')
    return saved ? parseInt(saved, 10) : 95
  })

  const imageBatchModeRef = useRef(imageBatchMode)

  const setUpscaleMode = useCallback((mode: 'video' | 'image') => {
    setUpscaleModeState(mode)
    localStorage.setItem('tuxscale_upscale_mode', mode)
  }, [])

  const handleImageBatchModeChange = useCallback((batch: boolean) => {
    imageBatchModeRef.current = batch
    setImageBatchMode(batch)
    localStorage.setItem('imageBatchMode', String(batch))
    setUpscaledImagePath(null)
  }, [])

  useEffect(() => {
    localStorage.setItem('imageOutputFormat', imageOutputFormat)
  }, [imageOutputFormat])

  useEffect(() => {
    localStorage.setItem('imageQuality', String(imageQuality))
  }, [imageQuality])

  const handleImageSelected = useCallback((path: string) => {
    setImagePath(path)
    setImageName(path.split(/[/\\]/).pop() || path)
    setUpscaledImagePath(null)
  }, [])

  const handleSelectImage = useCallback(async () => {
    try {
      const selected = await window.api.selectImage()
      if (selected) {
        handleImageSelected(selected)
      }
    } catch (err) {
      console.error('Failed to select image:', err)
    }
  }, [handleImageSelected])

  const handleImageFolderSelected = useCallback(async (selected: string) => {
    setImageFolderPath(selected)
    setUpscaledImagePath(null)
    try {
      const files = await window.api.getFolderImages(selected)
      setFolderImageCount(files.length)
    } catch {
      setFolderImageCount(0)
    }
  }, [])

  const handleSelectImageFolder = useCallback(async () => {
    try {
      const selected = await window.api.selectImageFolder()
      if (selected) {
        await handleImageFolderSelected(selected)
      }
    } catch (err) {
      console.error('Failed to select image folder:', err)
    }
  }, [handleImageFolderSelected])

  const handleSelectImageOutputFolder = useCallback(async () => {
    try {
      const selected = await window.api.selectFolder()
      if (selected) {
        setImageOutputPath(selected)
      }
    } catch (err) {
      console.error('Failed to select image output folder:', err)
    }
  }, [])

  const handleUpscaleImage = useCallback(
    async (config: SharedUpscaleConfig) => {
      if (imageBatchMode) {
        if (!imageFolderPath) return
      } else {
        if (!imagePath) return
      }
      if (!config.model) return

      config.setIsProcessing(true)
      setUpscaledImagePath(null)
      config.setLogs([])
      config.setProgress(null)

      const effectiveTileSize =
        config.activeBackend === 'pytorch'
          ? config.pytorchLowVram
            ? 512
            : 0
          : parseInt(config.tileSize, 10) || 0

      try {
        if (imageBatchMode && imageFolderPath) {
          await window.api.upscaleImageFolder({
            folderPath: imageFolderPath,
            outputPath: imageOutputPath || undefined,
            model: config.model,
            scale: String(config.scale[0]),
            backend: config.backend,
            customPythonPath: config.customPythonPath || undefined,
            ttaMode: config.ttaMode,
            tileSize: effectiveTileSize,
            outputFormat: imageOutputFormat,
            outputQuality: imageQuality,
            pytorchLowVram: config.pytorchLowVram
          })
          return
        }

        if (imagePath) {
          await window.api.upscaleImage({
            imagePath,
            outputPath: imageOutputPath || undefined,
            model: config.model,
            scale: String(config.scale[0]),
            backend: config.backend,
            customPythonPath: config.customPythonPath || undefined,
            ttaMode: config.ttaMode,
            tileSize: effectiveTileSize,
            outputFormat: imageOutputFormat,
            outputQuality: imageQuality,
            pytorchLowVram: config.pytorchLowVram
          })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        config.setLogs((prev) => [...prev, `Error: ${msg}`])
        config.setIsProcessing(false)
      }
    },
    [imageBatchMode, imageFolderPath, imagePath, imageOutputPath, imageOutputFormat, imageQuality]
  )

  useEffect(() => {
    const cleanup = window.api.onUpscaleDone((data) => {
      if (!imageBatchModeRef.current && data.outputPath && isImageFilePath(data.outputPath)) {
        setUpscaledImagePath(data.outputPath)
      }
    })
    return cleanup
  }, [])

  return {
    upscaleMode,
    setUpscaleMode,
    imageBatchMode,
    setImageBatchMode: handleImageBatchModeChange,
    imagePath,
    imageName,
    imageFolderPath,
    folderImageCount,
    imageOutputPath,
    upscaledImagePath,
    setUpscaledImagePath,
    imageOutputFormat,
    setImageOutputFormat,
    imageQuality,
    setImageQuality,
    handleImageSelected,
    handleImageFolderSelected,
    handleSelectImage,
    handleSelectImageFolder,
    handleSelectImageOutputFolder,
    handleUpscaleImage
  }
}
