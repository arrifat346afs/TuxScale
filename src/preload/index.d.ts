import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  SystemInfo,
  AllEnginesStatus,
  VideoUpscaylPayload,
  FolderUpscaylPayload
} from '../../common/types/types'

interface Api {
  getModelsList: (backend?: string) => Promise<string[]>
  getEngineStatus: (payload?: {
    preference?: string
    customPythonPath?: string
  }) => Promise<AllEnginesStatus>
  selectVideo: () => Promise<string | null>
  selectFolder: () => Promise<string | null>
  getFolderVideos: (folderPath: string) => Promise<string[]>
  getVideoUrl: (videoPath: string) => Promise<string>
  upscaleVideo: (payload: VideoUpscaylPayload) => Promise<void>
  upscaleFolder: (payload: FolderUpscaylPayload) => Promise<void>
  stopUpscaling: () => void
  onProgress: (
    callback: (data: { current: number; total: number; stage: string; message?: string }) => void
  ) => () => void
  onUpscaleDone: (callback: (data: { outputPath: string }) => void) => () => void
  onError: (callback: (data: { message: string }) => void) => () => void
  onLog: (callback: (message: string) => void) => () => void
  getSystemInfo: () => Promise<SystemInfo>

  checkForUpdates: () => Promise<{ updateAvailable?: boolean; error?: string }>

  installUpdate: () => void

  onUpdateChecking: (callback: () => void) => () => void

  onUpdateAvailable: (
    callback: (data: { version: string; releaseDate?: string; releaseName?: string }) => void
  ) => () => void

  onUpdateNotAvailable: (callback: () => void) => () => void

  onUpdateError: (callback: (data: { message: string }) => void) => () => void

  onUpdateDownloadProgress: (
    callback: (data: {
      percent: number
      bytesPerSecond: number
      transferred: number
      total: number
    }) => void
  ) => () => void

  onUpdateDownloaded: (
    callback: (data: { version: string; releaseDate?: string; releaseName?: string }) => void
  ) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
