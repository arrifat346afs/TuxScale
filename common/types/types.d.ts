type ImageFormat = 'png' | 'jpg' | 'jpeg' | 'webp'

export type VideoUpscaylPayload = {
  videoPath: string
  outputPath?: string
  model: string
  scale: string
  ttaMode?: boolean
  tileSize?: number
  outputFormat?: string
}

export type SystemInfo = {
  os: {
    platform: string
    release: string
    arch: string
  }
  cpu: {
    model: string
    cores: number
  }
  ram: {
    total: string
    free: string
  }
  gpu: {
    name: string
    vendor: string
    vram: string
    driverVersion: string
    cudaCores: string
    available: boolean
  }
}

export type ImageUpscaylPayload = {
  imagePath: string
  outputPath: string
  scale: string
  model: string
  gpuId: string
  saveImageAs: ImageFormat
  overwrite: boolean
  compression: string
  noImageProcessing: boolean
  customWidth: string
  useCustomWidth: boolean
  tileSize: number
  ttaMode: boolean
  copyMetadata: boolean
}

export type DoubleUpscaylPayload = {
  model: string
  /**
   * The path to the image to upscale.
   */
  imagePath: string
  outputPath: string
  scale: string
  gpuId: string
  saveImageAs: ImageFormat
  compression: string
  noImageProcessing: boolean
  customWidth: string
  useCustomWidth: boolean
  tileSize: number
  ttaMode: boolean
  copyMetadata: boolean
}

export type BatchUpscaylPayload = {
  batchFolderPath: string
  outputPath: string
  model: string
  gpuId: string
  saveImageAs: ImageFormat
  scale: string
  compression: string
  noImageProcessing: boolean
  customWidth: string
  useCustomWidth: boolean
  tileSize: number
  ttaMode: boolean
  copyMetadata: boolean
}
