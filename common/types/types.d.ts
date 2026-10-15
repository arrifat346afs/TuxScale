type ImageFormat = 'png' | 'jpg' | 'jpeg' | 'webp'

export type BackendPreference = 'auto' | 'ncnn' | 'pytorch'
export type BackendId = 'ncnn' | 'pytorch'

export type StatusCheckItem = {
  ok: boolean
  message: string
  details?: string
  fixHint?: string
  warning?: boolean
  warningMessage?: string
}

export type EngineStatus = {
  backend: BackendId
  available: boolean
  gpuName?: string
  details: Record<string, StatusCheckItem>
  pythonInfo?: {
    command: string
    version?: string
    source: 'custom' | 'auto-venv' | 'system'
  }
}

export type AllEnginesStatus = {
  activeBackend: BackendId
  preference: BackendPreference
  resolvedReason: string
  detectedPython?: {
    command: string
    version?: string
    source: 'custom' | 'auto-venv' | 'system'
  }
  engines: Record<BackendId, EngineStatus>
}

export type PyTorchEncoderMode = 'auto' | 'nvenc' | 'cpu'

export type VideoUpscaylPayload = {
  videoPath: string
  outputPath?: string
  model: string
  scale: string
  backend?: BackendPreference
  customPythonPath?: string
  ttaMode?: boolean
  tileSize?: number
  batchSize?: number
  outputFormat?: string
  pytorchLowVram?: boolean
  pytorchEncoder?: PyTorchEncoderMode
  pytorchSkipDuplicates?: boolean
}

export type FolderUpscaylPayload = Omit<VideoUpscaylPayload, 'videoPath'> & {
  folderPath: string
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
