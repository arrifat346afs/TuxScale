import { ThemeProvider } from './components/theme-provider'
import { SidebarPanel } from './components/SidebarPanel'
import { MainContent } from './components/MainContent'
import { useUpscale } from './hooks/useUpscale'

function App(): React.JSX.Element {
  const {
    activeTab,
    setActiveTab,
    batchMode,
    setBatchMode,
    doubleUpscale,
    setDoubleUpscale,
    backend,
    setBackend,
    customPythonPath,
    setCustomPythonPath,
    activeBackend,
    engineStatus,
    isCheckingEngineStatus,
    refreshEngineStatus,
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
    handleInstallUpdate,
    pytorchLowVram,
    setPytorchLowVram,
    pytorchEncoder,
    setPytorchEncoder,
    pytorchSkipDuplicates,
    setPytorchSkipDuplicates
  } = useUpscale()

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="flex h-screen w-screen flex-row overflow-hidden bg-background">
        <SidebarPanel
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          batchMode={batchMode}
          onBatchModeChange={setBatchMode}
          doubleUpscale={doubleUpscale}
          onDoubleUpscaleChange={setDoubleUpscale}
          backend={backend}
          onBackendChange={setBackend}
          customPythonPath={customPythonPath}
          onCustomPythonPathChange={setCustomPythonPath}
          activeBackend={activeBackend}
          engineStatus={engineStatus}
          isCheckingEngineStatus={isCheckingEngineStatus}
          onRefreshEngineStatus={refreshEngineStatus}
          model={model}
          onModelChange={setModel}
          models={models}
          scale={scale}
          onScaleChange={setScale}
          ttaMode={ttaMode}
          onTtaModeChange={setTtaMode}
          tileSize={tileSize}
          onTileSizeChange={setTileSize}
          pytorchLowVram={pytorchLowVram}
          onPytorchLowVramChange={setPytorchLowVram}
          pytorchEncoder={pytorchEncoder}
          onPytorchEncoderChange={setPytorchEncoder}
          pytorchSkipDuplicates={pytorchSkipDuplicates}
          onPytorchSkipDuplicatesChange={setPytorchSkipDuplicates}
          batchSize={batchSize}
          onBatchSizeChange={setBatchSize}
          outputFormat={outputFormat}
          onOutputFormatChange={setOutputFormat}
          videoPath={videoPath}
          folderPath={folderPath}
          outputPath={outputPath}
          videoName={videoName}
          systemInfo={systemInfo}
          onSelectVideo={handleSelectVideo}
          onSelectFolder={handleSelectFolder}
          onSelectOutputFolder={handleSelectOutputFolder}
          onUpscale={handleUpscale}
          isProcessing={isProcessing}
          updateState={updateState}
          updateInfo={updateInfo}
          onCheckForUpdates={handleCheckForUpdates}
          onInstallUpdate={handleInstallUpdate}
        />
        <MainContent
          batchMode={batchMode}
          videoPath={videoPath}
          folderPath={folderPath}
          folderVideoCount={folderVideoCount}
          outputPath={outputPath}
          upscaledVideoPath={upscaledVideoPath}
          isProcessing={isProcessing}
          progress={progress}
          logs={logs}
          videoName={videoName}
          onSelectVideo={handleSelectVideo}
          onSelectFolder={handleSelectFolder}
          onVideoDropped={handleVideoSelected}
          onCancel={handleCancel}
        />
      </div>
    </ThemeProvider>
  )
}

export default App
