import React, { useState } from 'react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Switch } from '../ui/switch'
import { Badge } from '../ui/badge'
import { EngineStatus } from './EngineStatus'
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
}

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
  onPytorchSkipDuplicatesChange
}) => {
  const [tempPythonPath, setTempPythonPath] = useState(customPythonPath)
  const isDirty = tempPythonPath !== customPythonPath
  const showPyTorchOptions = backend === 'pytorch' || engineStatus?.activeBackend === 'pytorch'

  const handleApplyPythonPath = (): void => {
    onCustomPythonPathChange(tempPythonPath.trim())
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          AI Engine Backend
        </h3>

        <div className="space-y-2">
          <Label className="text-xs">Backend Engine</Label>
          <Select
            value={backend}
            onValueChange={(val) => onBackendChange(val as BackendPreference)}
          >
            <SelectTrigger className="w-full rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (recommended)</SelectItem>
              <SelectItem value="pytorch">PyTorch (NVIDIA CUDA)</SelectItem>
              <SelectItem value="ncnn">NCNN (Vulkan)</SelectItem>
            </SelectContent>
          </Select>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {backend === 'auto' &&
              'Automatically uses PyTorch if an NVIDIA GPU with CUDA is detected, otherwise falls back to NCNN.'}
            {backend === 'pytorch' &&
              'Streams frames via PyTorch + Real-ESRGAN on CUDA. Flat RAM usage and high efficiency.'}
            {backend === 'ncnn' &&
              'Uses bundled upscayl-bin with Vulkan. Compatible with NVIDIA, AMD, and Intel GPUs.'}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Custom Python Executable Path (Optional)</Label>
        <div className="flex items-center gap-2">
          <Input
            value={tempPythonPath}
            onChange={(e) => setTempPythonPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApplyPythonPath()
            }}
            placeholder="e.g. ~/.venvs/tuxscale/bin/python"
            className="text-xs rounded-full h-9 bg-background/80"
          />
          {isDirty && (
            <Button
              size="sm"
              variant="secondary"
              className="rounded-full h-9 px-3 text-xs"
              onClick={handleApplyPythonPath}
            >
              Save
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Leave blank to auto-detect{' '}
          <code className="text-[10px] bg-muted px-1 py-0.5 rounded">~/.venvs/tuxscale</code> or
          system <code className="text-[10px] bg-muted px-1 py-0.5 rounded">python3</code>.
        </p>
        {engineStatus?.detectedPython && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-0.5">
            <span className="font-medium text-foreground">Active:</span>
            <span className="truncate font-mono text-[10px]">
              {engineStatus.detectedPython.command}
            </span>
            {engineStatus.detectedPython.source === 'auto-venv' && (
              <Badge
                variant="outline"
                className="text-[9px] py-0 px-1.5 text-emerald-500 border-emerald-500/30"
              >
                Auto-Venv
              </Badge>
            )}
            {engineStatus.detectedPython.source === 'custom' && (
              <Badge
                variant="outline"
                className="text-[9px] py-0 px-1.5 text-primary border-primary/30"
              >
                Custom
              </Badge>
            )}
          </div>
        )}
      </div>

      {showPyTorchOptions && (
        <div className="space-y-4 rounded-xl border border-border/60 bg-popover/50 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold tracking-wide text-foreground uppercase">
              PyTorch Acceleration
            </h4>
            <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
              CUDA
            </Badge>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Video Encoder</Label>
            <Select
              value={pytorchEncoder}
              onValueChange={(val) => onPytorchEncoderChange?.(val as PyTorchEncoderMode)}
            >
              <SelectTrigger className="w-full rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (NVENC with CPU fallback)</SelectItem>
                <SelectItem value="nvenc">NVENC (Hardware Acceleration)</SelectItem>
                <SelectItem value="cpu">CPU (Software libx264)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              NVENC offloads video encoding to NVIDIA NVENC hardware (H.264 up to 4K, HEVC up to
              8K).
            </p>
          </div>

          <div className="flex items-start justify-between gap-3 pt-1">
            <div className="space-y-0.5">
              <Label htmlFor="pytorch-low-vram" className="text-xs cursor-pointer">
                Low VRAM Mode (Tiling)
              </Label>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Uses 512px tiling to reduce memory on GPUs under 4 GB. On OOM, TuxScale
                automatically falls back to tiling.
              </p>
            </div>
            <Switch
              id="pytorch-low-vram"
              checked={pytorchLowVram}
              onCheckedChange={(checked) => onPytorchLowVramChange?.(checked)}
            />
          </div>

          <div className="flex items-start justify-between gap-3 pt-1">
            <div className="space-y-0.5">
              <Label htmlFor="pytorch-dedupe" className="text-xs cursor-pointer">
                Skip Duplicate Frames
              </Label>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Reuses previous upscaled frame for duplicate consecutive frames, saving GPU cycles
                while preserving timing.
              </p>
            </div>
            <Switch
              id="pytorch-dedupe"
              checked={pytorchSkipDuplicates}
              onCheckedChange={(checked) => onPytorchSkipDuplicatesChange?.(checked)}
            />
          </div>
        </div>
      )}

      <EngineStatus
        status={engineStatus}
        isLoading={isCheckingStatus}
        onRefresh={onRefreshStatus}
      />
    </div>
  )
}
