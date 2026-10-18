import { useEffect, useState } from 'react'
import { ThemeProvider } from './components/theme-provider'
import { SidebarPanel } from './components/SidebarPanel'
import { MainContent } from './components/MainContent'
import { CudaPromptModal } from './components/CudaPromptModal'
import { useUpscale } from './hooks/useUpscale'
import { useImageUpscale } from './hooks/useImageUpscale'

function App(): React.JSX.Element {
  const upscale = useUpscale()
  const imageUpscale = useImageUpscale()
  const isImageMode = imageUpscale.upscaleMode === 'image'

  const isNvidiaOk = !!upscale.engineStatus?.engines?.pytorch?.details?.nvidia?.ok
  const isPyTorchAvailable = !!upscale.engineStatus?.engines?.pytorch?.available
  const [modalDismissed, setModalDismissed] = useState(
    () => localStorage.getItem('cudaPromptDismissed') === 'true'
  )
  // CUDA prompt popup is only available in production (when app is packaged)
  const isProduction = !!upscale.engineStatus?.isPackaged || import.meta.env.PROD
  const showCudaModal = isProduction && isNvidiaOk && !isPyTorchAvailable && !modalDismissed

  const activeBatchMode = isImageMode ? imageUpscale.imageBatchMode : upscale.batchMode
  const handleActiveBatchModeChange = isImageMode
    ? imageUpscale.setImageBatchMode
    : upscale.setBatchMode

  const activeInputPath = isImageMode ? imageUpscale.imagePath : upscale.videoPath
  const activeInputName = isImageMode ? imageUpscale.imageName : upscale.videoName
  const activeFolderPath = isImageMode ? imageUpscale.imageFolderPath : upscale.folderPath
  const activeFolderCount = isImageMode ? imageUpscale.folderImageCount : upscale.folderVideoCount
  const activeOutputPath = isImageMode ? imageUpscale.imageOutputPath : upscale.outputPath
  const activeUpscaledPath = isImageMode
    ? imageUpscale.upscaledImagePath
    : upscale.upscaledVideoPath

  const handleSelectActiveInput = isImageMode
    ? imageUpscale.handleSelectImage
    : upscale.handleSelectVideo

  const handleSelectActiveFolder = isImageMode
    ? imageUpscale.handleSelectImageFolder
    : upscale.handleSelectFolder

  const handleSelectActiveOutputFolder = isImageMode
    ? imageUpscale.handleSelectImageOutputFolder
    : upscale.handleSelectOutputFolder

  useEffect(() => {
    const handleDragOver = (e: DragEvent): void => {
      e.preventDefault()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy'
      }
    }
    const handleDrop = (e: DragEvent): void => {
      e.preventDefault()
    }
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])

  const handleActiveInputDropped = isImageMode
    ? imageUpscale.handleImageSelected
    : upscale.handleVideoSelected

  const handleFileDropped = (path: string, type: 'video' | 'image'): void => {
    if (type === 'image') {
      imageUpscale.setUpscaleMode('image')
      imageUpscale.setImageBatchMode(false)
      imageUpscale.handleImageSelected(path)
    } else {
      imageUpscale.setUpscaleMode('video')
      upscale.setBatchMode(false)
      upscale.handleVideoSelected(path)
    }
  }

  const handleFolderDropped = async (path: string, type: 'video' | 'image'): Promise<void> => {
    if (type === 'image') {
      imageUpscale.setUpscaleMode('image')
      imageUpscale.setImageBatchMode(true)
      await imageUpscale.handleImageFolderSelected(path)
    } else {
      imageUpscale.setUpscaleMode('video')
      upscale.setBatchMode(true)
      await upscale.handleFolderSelected(path)
    }
  }

  const handleUpscale = (): void => {
    if (isImageMode) {
      imageUpscale.handleUpscaleImage({
        model: upscale.model,
        scale: upscale.scale,
        backend: upscale.backend,
        customPythonPath: upscale.customPythonPath,
        ttaMode: upscale.ttaMode,
        tileSize: upscale.tileSize,
        pytorchLowVram: !!upscale.pytorchLowVram,
        activeBackend: upscale.activeBackend,
        setIsProcessing: upscale.setIsProcessing,
        setLogs: upscale.setLogs,
        setProgress: upscale.setProgress
      })
    } else {
      upscale.handleUpscale()
    }
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="flex h-screen w-screen flex-row overflow-hidden bg-background">
        <SidebarPanel
          activeTab={upscale.activeTab}
          onActiveTabChange={upscale.setActiveTab}
          batchMode={activeBatchMode}
          onBatchModeChange={handleActiveBatchModeChange}
          doubleUpscale={upscale.doubleUpscale}
          onDoubleUpscaleChange={upscale.setDoubleUpscale}
          backend={upscale.backend}
          onBackendChange={upscale.setBackend}
          customPythonPath={upscale.customPythonPath}
          onCustomPythonPathChange={upscale.setCustomPythonPath}
          activeBackend={upscale.activeBackend}
          engineStatus={upscale.engineStatus}
          isCheckingEngineStatus={upscale.isCheckingEngineStatus}
          onRefreshEngineStatus={upscale.refreshEngineStatus}
          model={upscale.model}
          onModelChange={upscale.setModel}
          models={upscale.models}
          scale={upscale.scale}
          onScaleChange={upscale.setScale}
          ttaMode={upscale.ttaMode}
          onTtaModeChange={upscale.setTtaMode}
          tileSize={upscale.tileSize}
          onTileSizeChange={upscale.setTileSize}
          pytorchLowVram={upscale.pytorchLowVram}
          onPytorchLowVramChange={upscale.setPytorchLowVram}
          pytorchEncoder={upscale.pytorchEncoder}
          onPytorchEncoderChange={upscale.setPytorchEncoder}
          pytorchSkipDuplicates={upscale.pytorchSkipDuplicates}
          onPytorchSkipDuplicatesChange={upscale.setPytorchSkipDuplicates}
          batchSize={upscale.batchSize}
          onBatchSizeChange={upscale.setBatchSize}
          outputFormat={upscale.outputFormat}
          onOutputFormatChange={upscale.setOutputFormat}
          upscaleMode={imageUpscale.upscaleMode}
          imageOutputFormat={imageUpscale.imageOutputFormat}
          onImageOutputFormatChange={imageUpscale.setImageOutputFormat}
          imageQuality={imageUpscale.imageQuality}
          onImageQualityChange={imageUpscale.setImageQuality}
          videoPath={activeInputPath}
          folderPath={activeFolderPath}
          outputPath={activeOutputPath}
          videoName={activeInputName}
          systemInfo={upscale.systemInfo}
          onSelectVideo={handleSelectActiveInput}
          onSelectFolder={handleSelectActiveFolder}
          onSelectOutputFolder={handleSelectActiveOutputFolder}
          onUpscale={handleUpscale}
          isProcessing={upscale.isProcessing}
          updateState={upscale.updateState}
          updateInfo={upscale.updateInfo}
          onCheckForUpdates={upscale.handleCheckForUpdates}
          onInstallUpdate={upscale.handleInstallUpdate}
        />
        <MainContent
          upscaleMode={imageUpscale.upscaleMode}
          onUpscaleModeChange={imageUpscale.setUpscaleMode}
          batchMode={activeBatchMode}
          videoPath={activeInputPath}
          folderPath={activeFolderPath}
          folderVideoCount={activeFolderCount}
          outputPath={activeOutputPath}
          upscaledVideoPath={activeUpscaledPath}
          isProcessing={upscale.isProcessing}
          progress={upscale.progress}
          logs={upscale.logs}
          videoName={activeInputName}
          onBatchModeChange={handleActiveBatchModeChange}
          onSelectVideo={handleSelectActiveInput}
          onSelectFolder={handleSelectActiveFolder}
          onVideoDropped={handleActiveInputDropped}
          onFileDropped={handleFileDropped}
          onFolderDropped={handleFolderDropped}
          onCancel={upscale.handleCancel}
        />
        <CudaPromptModal
          isOpen={showCudaModal}
          onClose={() => setModalDismissed(true)}
          onSuccess={() => {
            setModalDismissed(true)
            upscale.refreshEngineStatus()
            upscale.setBackend('pytorch')
          }}
          gpuName={upscale.engineStatus?.engines?.pytorch?.details?.nvidia?.message}
        />
      </div>
    </ThemeProvider>
  )
}

export default App
