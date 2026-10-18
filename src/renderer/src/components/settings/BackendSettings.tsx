import React, { useState } from 'react'
import { Sliders, HelpCircle, Code2, ChevronDown, Terminal, Copy, Check } from 'lucide-react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Switch } from '../ui/switch'
import { Badge } from '../ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { EngineStatus } from './EngineStatus'
import { cn } from '@/lib/utils'
import type {
  BackendPreference,
  AllEnginesStatus,
  PyTorchEncoderMode
} from '../../../../../common/types/types'

type BackendSettingsProps = {
  backend: BackendPreference
  onBackendChange: (backend: BackendPreference) => void
  customPythonPath: string
  onCustomPythonPathChange: (path: string) => void
  engineStatus: AllEnginesStatus | null
  isCheckingStatus: boolean
  onRefreshStatus: () => void
  pytorchLowVram?: boolean
  onPytorchLowVramChange?: (lowVram: boolean) => void
  pytorchEncoder?: PyTorchEncoderMode
  onPytorchEncoderChange?: (encoder: PyTorchEncoderMode) => void
  pytorchSkipDuplicates?: boolean
  onPytorchSkipDuplicatesChange?: (skipDuplicates: boolean) => void
  isImageMode?: boolean
}

const SETUP_COMMANDS = `python3.12 -m venv ~/.venvs/tuxscale
source ~/.venvs/tuxscale/bin/activate
pip install --upgrade pip setuptools wheel
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
pip install basicsr realesrgan --no-build-isolation`

export const BackendSettings: React.FC<BackendSettingsProps> = ({
  backend,
  onBackendChange,
  customPythonPath,
  onCustomPythonPathChange,
  engineStatus,
  isCheckingStatus,
  onRefreshStatus,
  pytorchLowVram = false,
  onPytorchLowVramChange,
  pytorchEncoder = 'auto',
  onPytorchEncoderChange,
  pytorchSkipDuplicates = true,
  onPytorchSkipDuplicatesChange,
  isImageMode = false
}) => {
  const [tempPythonPath, setTempPythonPath] = useState(customPythonPath)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const isDirty = tempPythonPath !== customPythonPath
  const showPyTorchOptions = backend === 'pytorch' || engineStatus?.activeBackend === 'pytorch'

  const handleApplyPythonPath = (): void => {
    onCustomPythonPathChange(tempPythonPath.trim())
  }

  const handleCopyCommands = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(SETUP_COMMANDS)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (err) {
      console.error('Failed to copy setup commands to clipboard', err)
    }
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {/* =========================================================================
            CARD 1: System Status (Compact Banner at Top)
        ========================================================================= */}
        <EngineStatus
          status={engineStatus}
          isLoading={isCheckingStatus}
          onRefresh={onRefreshStatus}
          onOpenAdvanced={() => setAdvancedOpen(true)}
        />

        {/* =========================================================================
            CARD 2: Processing & Performance Card
        ========================================================================= */}
        <div className="rounded-xl border border-border/70 bg-card p-4 space-y-4 shadow-xs">
          <div className="flex items-center gap-2">
            <Sliders className="size-4 text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Processing & Performance
            </h3>
          </div>

          {/* 1. Backend Engine */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs font-medium">Backend Engine</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="size-3 text-muted-foreground/70 hover:text-foreground cursor-pointer transition-colors" />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="max-w-xs">
                    Auto automatically uses PyTorch on NVIDIA CUDA GPUs for max speed, falling back
                    to NCNN Vulkan on other GPUs.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>

            <Select
              value={backend}
              onValueChange={(val) => onBackendChange(val as BackendPreference)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (Recommended)</SelectItem>
                <SelectItem value="pytorch">PyTorch (NVIDIA CUDA)</SelectItem>
                <SelectItem value="ncnn">NCNN (Vulkan)</SelectItem>
              </SelectContent>
            </Select>

            <p className="text-[11px] text-muted-foreground truncate">
              {backend === 'auto' && 'Prefers PyTorch CUDA on NVIDIA GPUs with NCNN fallback.'}
              {backend === 'pytorch' &&
                'Direct CUDA streaming pipeline with flat RAM and high speed.'}
              {backend === 'ncnn' && 'Vulkan acceleration compatible with NVIDIA, AMD & Intel.'}
            </p>
          </div>

          {/* 2. Video Encoder (shown when PyTorch is active/selected and not in image mode) */}
          {showPyTorchOptions && !isImageMode && (
            <div className="space-y-1.5 pt-1 border-t border-border/50">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs font-medium">Video Encoder</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="size-3 text-muted-foreground/70 hover:text-foreground cursor-pointer transition-colors" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="max-w-xs">
                      NVENC offloads video encoding to NVIDIA NVENC hardware (H.264 up to 4K, HEVC
                      up to 8K) to eliminate CPU bottlenecks.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <Select
                value={pytorchEncoder}
                onValueChange={(val) => onPytorchEncoderChange?.(val as PyTorchEncoderMode)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (NVENC with CPU fallback)</SelectItem>
                  <SelectItem value="nvenc">NVENC (NVIDIA Hardware Acceleration)</SelectItem>
                  <SelectItem value="cpu">CPU (Software libx264)</SelectItem>
                </SelectContent>
              </Select>

              <p className="text-[11px] text-muted-foreground truncate">
                {pytorchEncoder === 'auto' && 'Auto: Hardware NVENC with CPU fallback.'}
                {pytorchEncoder === 'nvenc' && 'NVENC: Fast NVIDIA dedicated hardware encoder.'}
                {pytorchEncoder === 'cpu' && 'CPU: Software libx264 encoding.'}
              </p>
            </div>
          )}

          {/* 3. Low VRAM Mode (Tiling) */}
          {showPyTorchOptions && (
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/50">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="pytorch-low-vram" className="text-xs font-medium cursor-pointer">
                    Low VRAM Mode (Tiling)
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="size-3 text-muted-foreground/70 hover:text-foreground cursor-pointer transition-colors" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="max-w-xs">
                        Splits frames into 512px tiles. TuxScale also retries with tiling
                        automatically if an unexpected CUDA Out of Memory error occurs.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  Uses 512px tiling to reduce memory on GPUs under 4 GB.
                </p>
              </div>
              <Switch
                id="pytorch-low-vram"
                checked={pytorchLowVram}
                onCheckedChange={(checked) => onPytorchLowVramChange?.(checked)}
              />
            </div>
          )}

          {/* 4. Skip Duplicate Frames (video-only) */}
          {showPyTorchOptions && !isImageMode && (
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/50">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="pytorch-dedupe" className="text-xs font-medium cursor-pointer">
                    Skip Duplicate Frames
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="size-3 text-muted-foreground/70 hover:text-foreground cursor-pointer transition-colors" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="max-w-xs">
                        Compares consecutive frames and reuses the previous upscaled frame for
                        duplicates, accelerating static scenes while preserving exact timing.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  Reuses previous upscaled frame for static scenes to boost speed.
                </p>
              </div>
              <Switch
                id="pytorch-dedupe"
                checked={pytorchSkipDuplicates}
                onCheckedChange={(checked) => onPytorchSkipDuplicatesChange?.(checked)}
              />
            </div>
          )}
        </div>

        {/* =========================================================================
            CARD 3: Advanced / Developer Settings Card (Collapsed by Default)
        ========================================================================= */}
        <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3 shadow-xs">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left cursor-pointer outline-none group"
            onClick={() => setAdvancedOpen(!advancedOpen)}
          >
            <div className="flex items-center gap-2">
              <Code2 className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                Advanced / Developer Settings
              </span>
            </div>
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground transition-transform duration-200 group-hover:text-foreground',
                advancedOpen && 'rotate-180'
              )}
            />
          </button>

          {advancedOpen && (
            <div className="pt-2 border-t border-border/50 space-y-4 animate-in fade-in-50 duration-150">
              {/* Custom Python Executable Path */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">
                  Custom Python Executable Path (Optional)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={tempPythonPath}
                    onChange={(e) => setTempPythonPath(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleApplyPythonPath()
                    }}
                    placeholder="e.g. ~/.venvs/tuxscale/bin/python"
                    className="text-xs rounded-xl h-9 bg-background/80"
                  />
                  {isDirty && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-xl h-9 px-3 text-xs"
                      onClick={handleApplyPythonPath}
                    >
                      Save
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Leave blank to auto-detect{' '}
                  <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
                    ~/.venvs/tuxscale
                  </code>{' '}
                  or system{' '}
                  <code className="text-[10px] bg-muted px-1 py-0.5 rounded">python3</code>.
                </p>

                {engineStatus?.detectedPython && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-0.5 overflow-hidden">
                    <span className="font-medium text-foreground shrink-0">Active:</span>
                    <span
                      className="truncate font-mono text-[10px] text-foreground/80"
                      title={engineStatus.detectedPython.command}
                    >
                      {engineStatus.detectedPython.command}
                    </span>
                    {engineStatus.detectedPython.source === 'bundled' && (
                      <Badge
                        variant="outline"
                        className="text-[9px] py-0 px-1.5 text-purple-400 border-purple-500/30 shrink-0"
                      >
                        Bundled
                      </Badge>
                    )}
                    {engineStatus.detectedPython.source === 'auto-venv' && (
                      <Badge
                        variant="outline"
                        className="text-[9px] py-0 px-1.5 text-emerald-500 border-emerald-500/30 shrink-0"
                      >
                        Auto-Venv
                      </Badge>
                    )}
                    {engineStatus.detectedPython.source === 'custom' && (
                      <Badge
                        variant="outline"
                        className="text-[9px] py-0 px-1.5 text-primary border-primary/30 shrink-0"
                      >
                        Custom
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Internal Worker Script & Diagnostic Details */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Diagnostic Details
                </span>
                <div className="space-y-2 rounded-lg bg-muted/30 p-2.5 font-mono text-[10px] text-muted-foreground">
                  {engineStatus?.engines?.pytorch?.details?.script && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="shrink-0 font-sans">Worker Script:</span>
                      <span
                        className={cn(
                          'truncate',
                          engineStatus.engines.pytorch.details.script.ok
                            ? 'text-emerald-500'
                            : 'text-destructive'
                        )}
                      >
                        {engineStatus.engines.pytorch.details.script.message}
                      </span>
                    </div>
                  )}
                  {engineStatus?.engines?.pytorch?.details?.torch && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="shrink-0 font-sans">PyTorch Version:</span>
                      <span className="truncate text-foreground">
                        {engineStatus.engines.pytorch.details.torch.message}
                      </span>
                    </div>
                  )}
                  {engineStatus?.engines?.pytorch?.details?.cuda && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="shrink-0 font-sans">CUDA Compute:</span>
                      <span className="truncate text-foreground">
                        {engineStatus.engines.pytorch.details.cuda.message}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Setup Guide / Terminal Commands */}
              <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Terminal className="size-3.5 text-primary" />
                    <span>Setup Environment Commands</span>
                  </div>
                  <Button
                    size="sm"
                    variant={copied ? 'default' : 'secondary'}
                    className="h-7 rounded-lg px-2.5 text-xs gap-1 transition-all"
                    onClick={handleCopyCommands}
                  >
                    {copied ? (
                      <>
                        <Check className="size-3 text-primary-foreground" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </Button>
                </div>
                <pre className="rounded bg-muted/60 p-2.5 text-[10px] font-mono leading-relaxed text-muted-foreground overflow-x-auto select-all">
                  {SETUP_COMMANDS}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
