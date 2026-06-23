import { SidebarProvider, Sidebar, SidebarContent } from './components/ui/sidebar'
import { ThemeProvider } from './components/theme-provider'
import { SidebarPanel } from './components/SidebarPanel'
import { ProgressDisplay } from './components/ProgressDisplay'
import { useUpscale } from './hooks/useUpscale'

function App(): React.JSX.Element {
  const {
    activeTab,
    setActiveTab,
    batchMode,
    setBatchMode,
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
    outputFormat,
    setOutputFormat,
    videoPath,
    folderPath,
    folderVideoCount,
    outputPath,
    isProcessing,
    progress,
    logs,
    videoName,
    systemInfo,
    handleVideoSelected,
    handleSelectFolder,
    handleSelectOutputFolder,
    handleUpscale,
    handleCancel
  } = useUpscale()

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <SidebarProvider>
        <Sidebar collapsible="none">
          <SidebarContent className="flex flex-col gap-5 p-4">
            <SidebarPanel
              activeTab={activeTab}
              onActiveTabChange={setActiveTab}
              batchMode={batchMode}
              onBatchModeChange={setBatchMode}
              doubleUpscale={doubleUpscale}
              onDoubleUpscaleChange={setDoubleUpscale}
              model={model}
              onModelChange={setModel}
              models={models}
              scale={scale}
              onScaleChange={setScale}
              ttaMode={ttaMode}
              onTtaModeChange={setTtaMode}
              tileSize={tileSize}
              onTileSizeChange={setTileSize}
              outputFormat={outputFormat}
              onOutputFormatChange={setOutputFormat}
              videoPath={videoPath}
              folderPath={folderPath}
              outputPath={outputPath}
              videoName={videoName}
              systemInfo={systemInfo}
              onVideoSelected={handleVideoSelected}
              onSelectFolder={handleSelectFolder}
              onSelectOutputFolder={handleSelectOutputFolder}
              onUpscale={handleUpscale}
              isProcessing={isProcessing}
            />
          </SidebarContent>
        </Sidebar>
        <main className="flex flex-1 flex-col p-6">
          <ProgressDisplay
            progress={progress}
            logs={logs}
            onCancel={handleCancel}
            isProcessing={isProcessing}
            videoName={videoName}
            folderPath={folderPath}
            folderVideoCount={folderVideoCount}
          />
        </main>
      </SidebarProvider>
    </ThemeProvider>
  )
}

export default App
