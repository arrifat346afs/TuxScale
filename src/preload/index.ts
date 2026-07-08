import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { ELECTRON_COMMANDS } from '../../common/electron-commands'

const api = {
  getModelsList: () => ipcRenderer.invoke(ELECTRON_COMMANDS.GET_MODELS_LIST),

  selectVideo: () => ipcRenderer.invoke(ELECTRON_COMMANDS.SELECT_FILE),

  selectFolder: () => ipcRenderer.invoke(ELECTRON_COMMANDS.SELECT_FOLDER),

  getFolderVideos: (folderPath: string) =>
    ipcRenderer.invoke(ELECTRON_COMMANDS.GET_FOLDER_VIDEOS, folderPath),

  getVideoUrl: (videoPath: string) =>
    ipcRenderer.invoke(ELECTRON_COMMANDS.GET_VIDEO_URL, videoPath),

  upscaleVideo: (payload: {
    videoPath: string
    outputPath?: string
    model: string
    scale: string
    ttaMode?: boolean
    tileSize?: number
    batchSize?: number
    outputFormat?: string
  }) => ipcRenderer.invoke(ELECTRON_COMMANDS.UPSCAYL_VIDEO, payload),

  upscaleFolder: (payload: {
    folderPath: string
    outputPath?: string
    model: string
    scale: string
    ttaMode?: boolean
    tileSize?: number
    batchSize?: number
    outputFormat?: string
  }) => ipcRenderer.invoke(ELECTRON_COMMANDS.FOLDER_UPSCAYL, payload),

  stopUpscaling: () => ipcRenderer.send(ELECTRON_COMMANDS.STOP),

  onProgress: (
    callback: (data: { current: number; total: number; stage: string; message?: string }) => void
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => {
      callback(data as { current: number; total: number; stage: string; message?: string })
    }
    ipcRenderer.on(ELECTRON_COMMANDS.UPSCAYL_VIDEO_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(ELECTRON_COMMANDS.UPSCAYL_VIDEO_PROGRESS, handler)
    }
  },

  onUpscaleDone: (callback: (data: { outputPath: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => {
      callback(data as { outputPath: string })
    }
    ipcRenderer.on(ELECTRON_COMMANDS.UPSCAYL_VIDEO_DONE, handler)
    return () => {
      ipcRenderer.removeListener(ELECTRON_COMMANDS.UPSCAYL_VIDEO_DONE, handler)
    }
  },

  onError: (callback: (data: { message: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => {
      callback(data as { message: string })
    }
    ipcRenderer.on(ELECTRON_COMMANDS.UPSCAYL_ERROR, handler)
    return () => {
      ipcRenderer.removeListener(ELECTRON_COMMANDS.UPSCAYL_ERROR, handler)
    }
  },

  onLog: (callback: (message: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => {
      callback(data as string)
    }
    ipcRenderer.on(ELECTRON_COMMANDS.LOG, handler)
    return () => {
      ipcRenderer.removeListener(ELECTRON_COMMANDS.LOG, handler)
    }
  },

  getSystemInfo: () => ipcRenderer.invoke(ELECTRON_COMMANDS.GET_SYSTEM_INFO),

  checkForUpdates: () => ipcRenderer.invoke(ELECTRON_COMMANDS.CHECK_FOR_UPDATES),

  installUpdate: () => ipcRenderer.invoke(ELECTRON_COMMANDS.INSTALL_UPDATE),

  onUpdateChecking: (callback: () => void) => {
    const handler = (): void => callback()
    ipcRenderer.on(ELECTRON_COMMANDS.UPDATE_CHECKING, handler)
    return () => {
      ipcRenderer.removeListener(ELECTRON_COMMANDS.UPDATE_CHECKING, handler)
    }
  },

  onUpdateAvailable: (
    callback: (data: { version: string; releaseDate?: string; releaseName?: string }) => void
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { version: string; releaseDate?: string; releaseName?: string }
    ): void => {
      callback(data)
    }
    ipcRenderer.on(ELECTRON_COMMANDS.UPDATE_AVAILABLE, handler)
    return () => {
      ipcRenderer.removeListener(ELECTRON_COMMANDS.UPDATE_AVAILABLE, handler)
    }
  },

  onUpdateNotAvailable: (callback: () => void) => {
    const handler = (): void => callback()
    ipcRenderer.on(ELECTRON_COMMANDS.UPDATE_NOT_AVAILABLE, handler)
    return () => {
      ipcRenderer.removeListener(ELECTRON_COMMANDS.UPDATE_NOT_AVAILABLE, handler)
    }
  },

  onUpdateError: (callback: (data: { message: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { message: string }): void => {
      callback(data)
    }
    ipcRenderer.on(ELECTRON_COMMANDS.UPDATE_ERROR, handler)
    return () => {
      ipcRenderer.removeListener(ELECTRON_COMMANDS.UPDATE_ERROR, handler)
    }
  },

  onUpdateDownloadProgress: (
    callback: (data: {
      percent: number
      bytesPerSecond: number
      transferred: number
      total: number
    }) => void
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { percent: number; bytesPerSecond: number; transferred: number; total: number }
    ): void => {
      callback(data)
    }
    ipcRenderer.on(ELECTRON_COMMANDS.UPDATE_DOWNLOAD_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(ELECTRON_COMMANDS.UPDATE_DOWNLOAD_PROGRESS, handler)
    }
  },

  onUpdateDownloaded: (
    callback: (data: { version: string; releaseDate?: string; releaseName?: string }) => void
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { version: string; releaseDate?: string; releaseName?: string }
    ): void => {
      callback(data)
    }
    ipcRenderer.on(ELECTRON_COMMANDS.UPDATE_DOWNLOADED, handler)
    return () => {
      ipcRenderer.removeListener(ELECTRON_COMMANDS.UPDATE_DOWNLOADED, handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
