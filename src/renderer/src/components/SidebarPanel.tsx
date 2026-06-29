import { Button } from './ui/button'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Slider } from './ui/slider'
import { Separator } from './ui/separator'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from './ui/select'
import {
  Folder,
  HelpCircle,
  Rocket,
  Layers,
  FolderOpen,
  Monitor,
  Cpu,
  HardDrive,
  CheckCircle2,
  XCircle,
  FileVideo
} from 'lucide-react'
import type { SystemInfo } from '../../../../common/types/types'
import tuxscaleLogo from '../assets/tuxscale-logo.png'

type SidebarPanelProps = {
  activeTab: string
  onActiveTabChange: (tab: string) => void
  batchMode: boolean
  onBatchModeChange: (batch: boolean) => void
  doubleUpscale: boolean
  onDoubleUpscaleChange: (double: boolean) => void
  model: string
  onModelChange: (model: string) => void
  models: string[]
  scale: number[]
  onScaleChange: (scale: number[]) => void
  ttaMode: boolean
  onTtaModeChange: (tta: boolean) => void
  tileSize: string
  onTileSizeChange: (tileSize: string) => void
  outputFormat: string
  onOutputFormatChange: (format: string) => void
  videoPath: string | null
  folderPath: string | null
  outputPath: string | null
  videoName: string | null
  systemInfo: SystemInfo | null
  onSelectVideo: () => void
  onSelectFolder: () => void
  onSelectOutputFolder: () => void
  onUpscale: () => void
  isProcessing: boolean
}

export const SidebarPanel = ({
  activeTab,
  onActiveTabChange,
  batchMode,
  onBatchModeChange,
  doubleUpscale,
  onDoubleUpscaleChange,
  model,
  onModelChange,
  models,
  scale,
  onScaleChange,
  // ttaMode,
  // onTtaModeChange,
  tileSize,
  onTileSizeChange,
  outputFormat,
  onOutputFormatChange,
  videoPath,
  folderPath,
  outputPath,
  videoName,
  systemInfo,
  onSelectVideo,
  onSelectFolder,
  onSelectOutputFolder,
  onUpscale,
  isProcessing
}: SidebarPanelProps): React.ReactElement => {
  return (
    <div className="flex h-screen w-88 flex-col border-r border-border bg-card text-card-foreground shadow-[2px_0_25px_-18px_rgba(0,0,0,0.55)]">
      <div className="sticky top-0 z-30 border-b border-border/70 bg-card/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background shadow-sm shadow-black/10">
            <img src={tuxscaleLogo} alt="TuxScale" className="h-10 w-10 rounded-xl" />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold leading-none">TuxScale</span>
            <span className="text-sm text-muted-foreground">AI Video Upscaler</span>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={onActiveTabChange} className="w-full px-5 pb-4">
          <TabsList className="mx-auto grid w-fit grid-cols-2 rounded-full p-1">
            <TabsTrigger value="upscale" className="rounded-full">
              Upscale
            </TabsTrigger>
            <TabsTrigger value="settings" className="rounded-full">
              Settings
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {activeTab === 'upscale' ? (
          <>
            <div className="flex items-center gap-2">
              <Switch id="batch-mode" checked={batchMode} onCheckedChange={onBatchModeChange} />
              <Label htmlFor="batch-mode" className="cursor-pointer">
                Batch Upscale
              </Label>
            </div>

            <div className="space-y-2 rounded-[1.5rem] border border-border/60 bg-popover/80 p-4 shadow-sm shadow-black/5">
              <div className="inline-flex items-center gap-2 rounded-full bg-muted/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Step 1
              </div>
              {batchMode ? (
                <Button
                  variant="secondary"
                  className="w-full rounded-full"
                  onClick={onSelectFolder}
                  disabled={isProcessing}
                >
                  <FolderOpen />
                  Select Folder
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  className="w-full rounded-full"
                  onClick={onSelectVideo}
                  disabled={isProcessing}
                >
                  <FileVideo />
                  Select Video
                </Button>
              )}

              {!batchMode && videoName && (
                <p className="truncate text-xs text-muted-foreground">{videoName}</p>
              )}
              {batchMode && folderPath && (
                <p className="truncate text-xs text-muted-foreground">{folderPath}</p>
              )}
            </div>

            <div className="space-y-4 rounded-[1.5rem] border border-border/60 bg-popover/80 p-4 shadow-sm shadow-black/5">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-full bg-muted/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Step 2
                </div>
                <p className="text-xs text-muted-foreground">Select AI Model</p>
              </div>

              <Select value={model} onValueChange={onModelChange} disabled={isProcessing}>
                <SelectTrigger className="w-full rounded-full">
                  <Layers className="size-4" />
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((modelName) => (
                    <SelectItem key={modelName} value={modelName}>
                      {modelName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Switch
                  id="double-upscale"
                  checked={doubleUpscale}
                  onCheckedChange={onDoubleUpscaleChange}
                  disabled={isProcessing}
                />
                <Label htmlFor="double-upscale" className="cursor-pointer">
                  Double Upscale
                </Label>
                <HelpCircle className="size-4 text-muted-foreground" />
              </div>

              {/* <div className="flex items-center gap-2">
                <Switch
                  id="tta-mode"
                  checked={ttaMode}
                  onCheckedChange={onTtaModeChange}
                  disabled={isProcessing}
                />

                <HelpCircle className="size-4 text-muted-foreground" />
              </div> */}

              <div className="flex items-center gap-2">
                <input
                  id="tile-size"
                  type="number"
                  min={0}
                  step={32}
                  value={tileSize}
                  onChange={(e) => onTileSizeChange(e.target.value)}
                  disabled={isProcessing}
                  className="w-20 h-8 rounded-md border border-input bg-background px-2 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <HelpCircle className="size-4 text-muted-foreground shrink-0" />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Video Scale ({scale[0]}x)</Label>
                <Slider
                  value={scale}
                  onValueChange={onScaleChange}
                  min={1}
                  max={4}
                  step={1}
                  disabled={isProcessing}
                />
              </div>
            </div>

            <div className="space-y-2 rounded-[1.5rem] border border-border/60 bg-popover/80 p-4 shadow-sm shadow-black/5">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-full bg-muted/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Step 3
                </div>
                <p className="text-xs text-muted-foreground">Defaults to Video&apos;s path</p>
              </div>
              <Button
                variant="secondary"
                className="w-full rounded-full"
                onClick={onSelectOutputFolder}
                disabled={isProcessing}
              >
                <Folder />
                Set Output Folder
              </Button>
              {outputPath && <p className="truncate text-xs text-muted-foreground">{outputPath}</p>}
            </div>

            <div className="space-y-2 rounded-[1.5rem] border border-border/60 bg-popover/80 p-4 shadow-sm shadow-black/5">
              <div className="inline-flex items-center gap-2 rounded-full bg-muted/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Step 4
              </div>
              <Button
                className="w-full rounded-full bg-violet-600 hover:bg-violet-700"
                onClick={onUpscale}
                disabled={
                  isProcessing || (!batchMode && !videoPath) || (batchMode && !folderPath) || !model
                }
              >
                <Rocket />
                Upscale
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col gap-5 overflow-auto">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                Export Settings
              </h3>
              <div className="space-y-2">
                <Label className="text-xs">Export Format</Label>
                <Select value={outputFormat} onValueChange={onOutputFormatChange}>
                  <SelectTrigger className="w-full rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Video Formats</SelectLabel>
                      <SelectItem value="mp4">MP4 (H.264)</SelectItem>
                      <SelectItem value="webm">WebM (VP9)</SelectItem>
                      <SelectItem value="mkv">MKV (H.264)</SelectItem>
                      <SelectItem value="avi">AVI</SelectItem>
                      <SelectItem value="mov">MOV (H.264)</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Audio Formats</SelectLabel>
                      <SelectItem value="mp3">MP3</SelectItem>
                      <SelectItem value="wav">WAV</SelectItem>
                      <SelectItem value="aac">AAC</SelectItem>
                      <SelectItem value="flac">FLAC</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {outputFormat === 'mp4' ||
                  outputFormat === 'webm' ||
                  outputFormat === 'mkv' ||
                  outputFormat === 'avi' ||
                  outputFormat === 'mov'
                    ? 'Upscaled video will use this container and codec.'
                    : 'Audio will be extracted from the source video.'}
                </p>
              </div>
            </div>

            <div className="flex-1" />

            <div className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                System Information
              </h3>

              {systemInfo ? (
                <div className="space-y-2 rounded-xl border bg-card p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Monitor className="size-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">OS</span>
                    <span className="ml-auto font-medium">
                      {systemInfo.os.platform} {systemInfo.os.arch}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center gap-2">
                    <Cpu className="size-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">CPU</span>
                    <span className="ml-auto font-medium truncate max-w-45">
                      {systemInfo.cpu.model} ({systemInfo.cpu.cores})
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center gap-2">
                    <HardDrive className="size-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">RAM</span>
                    <span className="ml-auto font-medium">
                      {systemInfo.ram.total} / {systemInfo.ram.free} free
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-2">
                    {systemInfo.gpu.available ? (
                      <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-muted-foreground">GPU</span>
                        <span className="font-medium text-right">
                          {systemInfo.gpu.available ? 'Available' : 'Not Detected'}
                        </span>
                      </div>
                      {systemInfo.gpu.name && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {systemInfo.gpu.name}
                        </p>
                      )}
                      {systemInfo.gpu.available && (
                        <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                          {systemInfo.gpu.vram && <p>VRAM: {systemInfo.gpu.vram}</p>}
                          {systemInfo.gpu.driverVersion && (
                            <p>Driver: {systemInfo.gpu.driverVersion}</p>
                          )}
                          {systemInfo.gpu.cudaCores && (
                            <p>CUDA Cores: {systemInfo.gpu.cudaCores}</p>
                          )}
                        </div>
                      )}
                      {systemInfo.gpu.available && (
                        <p className="mt-1.5 text-xs font-medium text-emerald-500">
                          GPU acceleration available
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border bg-card p-4 text-center text-xs text-muted-foreground">
                  Loading system information...
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-t px-5 py-3 text-center text-[10px] text-muted-foreground">
        Drop videos on the right or use the buttons above
      </div>
    </div>
  )
}
