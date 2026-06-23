import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import path, { join } from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
// import icon from '../../resources/icon.png?asset'
import { ELECTRON_COMMANDS } from '../../common/electron-commands'
import { getModel } from './getmodel'
import { upscaleSingleVideo, stopAllProcesses, type UpscaleVideoOptions } from './upscale'
import { upscaleFolder, cancelBatch, type UpscaleFolderOptions } from './batch'
import { getVideoFiles } from './video-utils'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const window = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    // ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow = window

  window.on('ready-to-show', () => {
    window.show()
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(ELECTRON_COMMANDS.SELECT_FILE, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],

      filters: [
        { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'wmv', 'flv'] }
      ]
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle(ELECTRON_COMMANDS.SELECT_FOLDER, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle(ELECTRON_COMMANDS.UPSCAYL_VIDEO, async (event, payload) => {
    const { videoPath, outputPath, model, scale, ttaMode, tileSize, outputFormat } = payload
    const win = BrowserWindow.fromWebContents(event.sender)

    const options: UpscaleVideoOptions = {
      videoPath,
      outputPath,
      model,
      scale: String(scale),
      ttaMode,
      tileSize,
      outputFormat,
      onProgress: (data) => {
        win?.webContents.send(ELECTRON_COMMANDS.UPSCAYL_VIDEO_PROGRESS, data)
      },
      sendLog: (message) => {
        win?.webContents.send(ELECTRON_COMMANDS.LOG, message)
      }
    }

    try {
      const resultPath = await upscaleSingleVideo(options)
      win?.webContents.send(ELECTRON_COMMANDS.UPSCAYL_VIDEO_DONE, { outputPath: resultPath })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error during upscaling'
      win?.webContents.send(ELECTRON_COMMANDS.UPSCAYL_ERROR, { message })
    }
  })

  ipcMain.handle(ELECTRON_COMMANDS.FOLDER_UPSCAYL, async (event, payload) => {
    const { folderPath, outputPath, model, scale, ttaMode, tileSize, outputFormat } = payload
    const win = BrowserWindow.fromWebContents(event.sender)

    const options: UpscaleFolderOptions = {
      folderPath,
      outputPath,
      model,
      scale: String(scale),
      ttaMode,
      tileSize,
      outputFormat,
      onProgress: (data) => {
        win?.webContents.send(ELECTRON_COMMANDS.UPSCAYL_VIDEO_PROGRESS, data)
      },
      sendLog: (message) => {
        win?.webContents.send(ELECTRON_COMMANDS.LOG, message)
      }
    }

    try {
      const resultPaths = await upscaleFolder(options)
      win?.webContents.send(ELECTRON_COMMANDS.UPSCAYL_VIDEO_DONE, {
        outputPath: resultPaths[0] ?? ''
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error during batch upscaling'
      win?.webContents.send(ELECTRON_COMMANDS.UPSCAYL_ERROR, { message })
    }
  })

  ipcMain.on(ELECTRON_COMMANDS.STOP, () => {
    stopAllProcesses()
    cancelBatch()
  })

  ipcMain.handle(ELECTRON_COMMANDS.GET_FOLDER_VIDEOS, async (_, folderPath: string) => {
    try {
      return getVideoFiles(folderPath).map((filePath) => path.basename(filePath))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to read folder videos: ${message}`)
    }
  })

  ipcMain.handle(ELECTRON_COMMANDS.GET_MODELS_LIST, () => getModel())

  ipcMain.handle(ELECTRON_COMMANDS.GET_SYSTEM_INFO, async () => {
    const totalRam = os.totalmem()
    const freeRam = os.freemem()
    const cpu = os.cpus()[0]

    const gpuInfo: {
      name: string
      vendor: string
      vram: string
      driverVersion: string
      cudaCores: string
      available: boolean
    } = {
      name: '',
      vendor: '',
      vram: '',
      driverVersion: '',
      cudaCores: '',
      available: false
    }

    try {
      const info = await app.getGPUInfo('complete')
      const devices = (
        info as Record<string, unknown> & {
          gpuDevice?:
            | { deviceString?: string; vendorString?: string }[]
            | { deviceString?: string; vendorString?: string }
        }
      )?.gpuDevice
      if (devices) {
        const list = Array.isArray(devices) ? devices : [devices]
        if (list.length > 0) {
          const primary = list[0]
          gpuInfo.name = primary?.deviceString ?? ''
          gpuInfo.vendor = primary?.vendorString ?? ''
          gpuInfo.available = true
        }
      }
    } catch {
      // fallback to external commands
    }

    if (!gpuInfo.available) {
      const platform = process.platform
      if (platform === 'win32' || platform === 'linux') {
        try {
          const nvidiaSmi = await new Promise<string>((resolve, reject) => {
            execFile(
              'nvidia-smi',
              ['--query-gpu=name,driver_version,memory.total', '--format=csv,noheader'],
              { timeout: 5000 },
              (error, stdout) => {
                if (error) reject(error)
                else resolve(stdout.trim())
              }
            )
          })
          if (nvidiaSmi) {
            const parts = nvidiaSmi.split(', ').map((s) => s.trim())
            gpuInfo.name = parts[0] ?? ''
            gpuInfo.driverVersion = parts[1] ?? ''
            gpuInfo.vram = parts[2] ?? ''
            gpuInfo.available = true
          }
        } catch {
          // nvidia-smi not available
        }

        if (!gpuInfo.available && platform === 'linux') {
          try {
            const lspci = await new Promise<string>((resolve, reject) => {
              execFile('lspci', ['-vnn'], { timeout: 5000 }, (error, stdout) => {
                if (error) reject(error)
                else resolve(stdout.trim())
              })
            })
            const vgaMatch = lspci.match(/(VGA|3D|Display).*/i)
            if (vgaMatch) {
              gpuInfo.name = vgaMatch[0].trim()
              gpuInfo.available = true
            }
          } catch {
            // lspci not available
          }
        }
      } else if (platform === 'darwin') {
        try {
          const sp = await new Promise<string>((resolve, reject) => {
            execFile(
              'system_profiler',
              ['SPDisplaysDataType'],
              { timeout: 5000 },
              (error, stdout) => {
                if (error) reject(error)
                else resolve(stdout.trim())
              }
            )
          })
          const nameMatch = sp.match(/Chipset Model:\s*(.+)/)
          if (nameMatch) {
            gpuInfo.name = nameMatch[1].trim()
            gpuInfo.available = true
          }
          const vramMatch = sp.match(/VRAM \(Total\):\s*(.+)/)
          if (vramMatch) gpuInfo.vram = vramMatch[1].trim()
        } catch {
          // system_profiler not available
        }
      }
    }

    return {
      os: {
        platform: `${os.type()} ${os.release()}`,
        release: os.release(),
        arch: os.arch()
      },
      cpu: {
        model: cpu?.model ?? 'Unknown',
        cores: os.cpus().length
      },
      ram: {
        total: `${(totalRam / 1024 / 1024 / 1024).toFixed(1)} GB`,
        free: `${(freeRam / 1024 / 1024 / 1024).toFixed(1)} GB`
      },
      gpu: gpuInfo
    }
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
