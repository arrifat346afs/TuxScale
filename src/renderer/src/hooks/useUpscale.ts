import { useEffect, useState, useCallback, useRef } from 'react'
import type { ProgressData } from '../types'
import type { SystemInfo } from '../../../../common/types/types'

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

type UpdateInfo = {
  version?: string
  percent?: number
  bytesPerSecond?: number
  error?: string
}

const VIDEO_OUTPUT_EXTENSIONS = ['mp4', 'webm', 'mkv', 'avi', 'mov']

function isVideoOutputPath(path: string): boolean {
  const extension = path.split('.').pop()?.toLowerCase()
  return extension ? VIDEO_OUTPUT_EXTENSIONS.includes(extension) : false
}

type UseUpscaleReturn = {
  activeTab: string
  setActiveTab: (tab: string) => void
  batchMode: boolean
  setBatchMode: (batch: boolean) => void
  doubleUpscale: boolean
  setDoubleUpscale: (double: boolean) => void
  model: string
  setModel: (model: string) => void
  models: string[]
  scale: number[]
  setScale: (scale: number[]) => void
  ttaMode: boolean
  setTtaMode: (tta: boolean) => void
  tileSize: string
  setTileSize: (tileSize: string) => void
  batchSize: number
  setBatchSize: (size: number) => void
  outputFormat: string
  setOutputFormat: (format: string) => void
  videoPath: string | null
  folderPath: string | null
  folderVideoCount: number
  outputPath: string | null
  upscaledVideoPath: string | null
  isProcessing: boolean
  progress: ProgressData | null
  logs: string[]
  videoName: string | null
  systemInfo: SystemInfo | null
  handleVideoSelected: (path: string) => void
  handleSelectVideo: () => Promise<void>
  handleSelectFolder: () => Promise<void>
  handleSelectOutputFolder: () => Promise<void>
  handleUpscale: () => Promise<void>
  handleCancel: () => void
  updateState: UpdateState
  updateInfo: UpdateInfo
  handleCheckForUpdates: () => Promise<void>
  handleInstallUpdate: () => void
}

export function useUpscale(): UseUpscaleReturn {
  const [activeTab, setActiveTab] = useState('upscale')
  const [batchMode, setBatchMode] = useState(false)
  const [doubleUpscale, setDoubleUpscale] = useState(false)
  const [model, setModel] = useState(() => localStorage.getItem('selectedModel') || '')
  const [models, setModels] = useState<string[]>([])
  const [scale, setScale] = useState(() => {
    const saved = localStorage.getItem('videoScale')
    return saved ? [Number(saved)] : [4]
  })
  const [ttaMode, setTtaMode] = useState(false)
  const [tileSize, setTileSize] = useState('256')
  const [batchSize, setBatchSize] = useState(10)

  const [outputFormat, setOutputFormat] = useState(
    () => localStorage.getItem('outputFormat') || 'mp4'
  )
  const [videoPath, setVideoPath] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [folderVideoCount, setFolderVideoCount] = useState(0)
  const [outputPath, setOutputPath] = useState<string | null>(null)
  const [upscaledVideoPath, setUpscaledVideoPath] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState>('idle')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({})
  const batchModeRef = useRef(batchMode)

  const handleBatchModeChange = useCallback((batch: boolean) => {
    batchModeRef.current = batch
    setBatchMode(batch)
    setUpscaledVideoPath(null)
  }, [])

  useEffect(() => {
    localStorage.setItem('outputFormat', outputFormat)
  }, [outputFormat])

  useEffect(() => {
    localStorage.setItem('videoScale', String(scale[0]))
  }, [scale])

  useEffect(() => {
    window.api.getModelsList().then((list) => {
      setModels(list)
      if (list.length > 0) {
        const savedModel = localStorage.getItem('selectedModel')
        if (!savedModel || !list.includes(savedModel)) {
          setModel(list[0])
        }
      }
    })
    window.api
      .getSystemInfo()
      .then(setSystemInfo)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (model) localStorage.setItem('selectedModel', model)
  }, [model])

  useEffect(() => {
    const cleanupFns: (() => void)[] = []

    cleanupFns.push(
      window.api.onProgress((data) => {
        setProgress(data as ProgressData)
      })
    )

    cleanupFns.push(
      window.api.onUpscaleDone((data) => {
        if (!batchModeRef.current && isVideoOutputPath(data.outputPath)) {
          setUpscaledVideoPath(data.outputPath)
        }
        setIsProcessing(false)
      })
    )

    cleanupFns.push(
      window.api.onError((data) => {
        setLogs((prev) => [...prev, `Error: ${data.message}`])
        setIsProcessing(false)
      })
    )

    cleanupFns.push(
      window.api.onLog((message) => {
        setLogs((prev) => [...prev, message])
      })
    )

    cleanupFns.push(
      window.api.onUpdateChecking(() => {
        setUpdateState('checking')
        setUpdateInfo({})
      })
    )

    cleanupFns.push(
      window.api.onUpdateAvailable((data) => {
        setUpdateState('available')
        setUpdateInfo({ version: data.version })
      })
    )

    cleanupFns.push(
      window.api.onUpdateNotAvailable(() => {
        setUpdateState('idle')
        setUpdateInfo({})
      })
    )

    cleanupFns.push(
      window.api.onUpdateError((data) => {
        setUpdateState('error')
        setUpdateInfo({ error: data.message })
      })
    )

    cleanupFns.push(
      window.api.onUpdateDownloadProgress((data) => {
        setUpdateState('downloading')
        setUpdateInfo({ percent: data.percent, bytesPerSecond: data.bytesPerSecond })
      })
    )

    cleanupFns.push(
      window.api.onUpdateDownloaded((data) => {
        setUpdateState('downloaded')
        setUpdateInfo({ version: data.version })
      })
    )

    return () => {
      cleanupFns.forEach((fn) => fn())
    }
  }, [])

  const handleVideoSelected = useCallback((path: string) => {
    setVideoPath(path)
    setUpscaledVideoPath(null)
    setLogs([])
    setProgress(null)
  }, [])

  const handleSelectVideo = useCallback(async () => {
    const path = await window.api.selectVideo()
    if (path) {
      handleVideoSelected(path)
    }
  }, [handleVideoSelected])

  const handleSelectFolder = useCallback(async () => {
    const path = await window.api.selectFolder()
    if (path) {
      setFolderPath(path)
      setUpscaledVideoPath(null)
      setLogs([])
      setProgress(null)
      try {
        const videos = await window.api.getFolderVideos(path)
        setFolderVideoCount(videos.length)
      } catch {
        setFolderVideoCount(0)
      }
    }
  }, [])

  const handleSelectOutputFolder = useCallback(async () => {
    const path = await window.api.selectFolder()
    if (path) {
      setOutputPath(path)
    }
  }, [])

  const handleUpscale = useCallback(async () => {
    if (batchMode) {
      if (!folderPath) return
    } else {
      if (!videoPath) return
    }
    if (!model) return

    setIsProcessing(true)
    setUpscaledVideoPath(null)
    setLogs([])
    setProgress(null)

    if (batchMode && folderPath) {
      await window.api.upscaleFolder({
        folderPath,
        outputPath: outputPath || undefined,
        model,
        scale: String(scale[0]),
        ttaMode,
        tileSize: parseInt(tileSize) || 0,
        batchSize,
        outputFormat
      })
      return
    }

    await window.api.upscaleVideo({
      videoPath: videoPath!,
      outputPath: outputPath || undefined,
      model,
      scale: String(scale[0]),
      ttaMode,
      tileSize: parseInt(tileSize) || 0,
      batchSize,
      outputFormat
    })
  }, [
    batchMode,
    folderPath,
    videoPath,
    model,
    scale,
    outputPath,
    ttaMode,
    tileSize,
    batchSize,
    outputFormat
  ])

  const handleCancel = useCallback(() => {
    window.api.stopUpscaling()
    setIsProcessing(false)
  }, [])

  const handleCheckForUpdates = useCallback(async () => {
    setUpdateState('checking')
    setUpdateInfo({})
    await window.api.checkForUpdates()
  }, [])

  const handleInstallUpdate = useCallback(() => {
    window.api.installUpdate()
  }, [])

  const videoName = videoPath ? (videoPath.split(/[/\\]/).pop() ?? null) : null

  return {
    activeTab,
    setActiveTab,
    batchMode,
    setBatchMode: handleBatchModeChange,
    doubleUpscale,
    setDoubleUpscale,
    model,
    setModel,
    models,
    scale,
    setScale,
    ttaMode,
    setTtaMode,
    tileSize,
    setTileSize,
    batchSize,
    setBatchSize,
    outputFormat,
    setOutputFormat,
    videoPath,
    folderPath,
    folderVideoCount,
    outputPath,
    upscaledVideoPath,
    isProcessing,
    progress,
    logs,
    videoName,
    systemInfo,
    handleVideoSelected,
    handleSelectVideo,
    handleSelectFolder,
    handleSelectOutputFolder,
    handleUpscale,
    handleCancel,
    updateState,
    updateInfo,
    handleCheckForUpdates,
    handleInstallUpdate
  }
}
