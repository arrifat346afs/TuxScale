import React, { useState } from 'react'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Badge } from '../ui/badge'
import { EngineStatus } from './EngineStatus'
import type { BackendPreference, AllEnginesStatus } from '../../../../../common/types/types'

type BackendSettingsProps = {
  backend: BackendPreference
  onBackendChange: (backend: BackendPreference) => void
  customPythonPath: string
  onCustomPythonPathChange: (path: string) => void
  engineStatus: AllEnginesStatus | null
  isCheckingStatus: boolean
  onRefreshStatus: () => void
}

export const BackendSettings: React.FC<BackendSettingsProps> = ({
  backend,
  onBackendChange,
  customPythonPath,
  onCustomPythonPathChange,
  engineStatus,
  isCheckingStatus,
  onRefreshStatus
}) => {
  const [tempPythonPath, setTempPythonPath] = useState(customPythonPath)
  const isDirty = tempPythonPath !== customPythonPath

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

      <EngineStatus
        status={engineStatus}
        isLoading={isCheckingStatus}
        onRefresh={onRefreshStatus}
      />
    </div>
  )
}
