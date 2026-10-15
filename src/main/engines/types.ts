import type { ProgressData } from '../../renderer/src/types'

export type BackendPreference = 'auto' | 'ncnn' | 'pytorch'
export type BackendId = 'ncnn' | 'pytorch'

export type PyTorchEncoderMode = 'auto' | 'nvenc' | 'cpu'

export type EngineUpscaleOptions = {
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
  onProgress: (data: ProgressData) => void
  sendLog: (message: string) => void
}

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

export interface Engine {
  readonly id: BackendId
  isAvailable(customPythonPath?: string): Promise<boolean>
  getStatus(customPythonPath?: string): Promise<EngineStatus>
  getModels(): string[] | Promise<string[]>
  upscale(options: EngineUpscaleOptions): Promise<string>
  stop(): void
}
