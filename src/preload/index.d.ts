import { ElectronAPI } from '@electron-toolkit/preload'
import type { SystemInfo } from '../../common/types/types'

interface Api {
  getModelsList: () => Promise<string[]>
  selectVideo: () => Promise<string | null>
  selectFolder: () => Promise<string | null>
  getFolderVideos: (folderPath: string) => Promise<string[]>
  upscaleVideo: (payload: {
    videoPath: string
    outputPath?: string
    model: string
    scale: string
    ttaMode?: boolean
    tileSize?: number
    outputFormat?: string
  }) => Promise<void>
  upscaleFolder: (payload: {
    folderPath: string
    outputPath?: string
    model: string
    scale: string
    ttaMode?: boolean
    tileSize?: number
    outputFormat?: string
  }) => Promise<void>
  stopUpscaling: () => void
  onProgress: (
    callback: (data: { current: number; total: number; stage: string; message?: string }) => void
  ) => () => void
  onUpscaleDone: (callback: (data: { outputPath: string }) => void) => () => void
  onError: (callback: (data: { message: string }) => void) => () => void
  onLog: (callback: (message: string) => void) => () => void
  getSystemInfo: () => Promise<SystemInfo>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
