import React, { useState } from 'react'
import { CheckCircle2, RefreshCw, AlertTriangle, ChevronDown, Layers, Cpu } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { cn } from '@/lib/utils'
import type { AllEnginesStatus } from '../../../../../common/types/types'

type EngineStatusProps = {
  status: AllEnginesStatus | null
  isLoading: boolean
  onRefresh: () => void
  onOpenAdvanced?: () => void
}

export const EngineStatus: React.FC<EngineStatusProps> = ({
  status,
  isLoading,
  onRefresh,
  onOpenAdvanced
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false)

  if (!status) {
    return (
      <div className="rounded-xl border border-border/70 bg-card p-3 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="size-3.5 animate-spin text-primary" />
            <span>Detecting hardware acceleration...</span>
          </div>
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" disabled>
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>
    )
  }

  const { activeBackend, resolvedReason, engines } = status
  const pytorch = engines.pytorch
  const ncnn = engines.ncnn

  const isPyTorch = activeBackend === 'pytorch'
  const isReady = isPyTorch ? pytorch.available : ncnn.available
  const isPyTorchUnavailable = status.preference === 'pytorch' && !pytorch.available

  // Resolved clean GPU name
  const detectedGpuName =
    pytorch.gpuName || (isPyTorch ? 'NVIDIA CUDA GPU' : 'Vulkan GPU Acceleration')

  return (
    <div className="rounded-xl border border-border/70 bg-card p-3 shadow-xs space-y-3 transition-all duration-200">
      {/* 1. Compact Single-Line Summary Banner */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              'size-2 rounded-full shrink-0 transition-colors',
              isReady
                ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50'
                : 'bg-amber-500 shadow-xs shadow-amber-500/50'
            )}
          />
          <span
            className="text-xs font-semibold text-foreground truncate max-w-[170px]"
            title={detectedGpuName}
          >
            {detectedGpuName}
          </span>
          <span className="text-muted-foreground text-xs shrink-0">•</span>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] px-1.5 py-0 h-4.5 font-medium shrink-0',
              isReady
                ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10'
                : 'border-amber-500/30 text-amber-500 bg-amber-500/10'
            )}
          >
            {isReady ? 'Ready' : 'Setup Needed'}
          </Badge>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={onRefresh}
            disabled={isLoading}
            title="Re-check hardware status"
          >
            <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground gap-1 font-medium"
            onClick={() => setDetailsOpen(!detailsOpen)}
          >
            <span>{detailsOpen ? 'Hide' : 'Details'}</span>
            <ChevronDown
              className={cn(
                'size-3.5 transition-transform duration-200',
                detailsOpen && 'rotate-180'
              )}
            />
          </Button>
        </div>
      </div>

      {/* 2. Collapsible Details Accordion */}
      {detailsOpen && (
        <div className="pt-2.5 border-t border-border/50 space-y-3 text-xs animate-in fade-in-50 duration-150">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Active Backend:</span>
            <span className="font-medium text-foreground">
              {activeBackend === 'pytorch' ? 'PyTorch (CUDA Stream)' : 'NCNN (Vulkan)'}
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">{resolvedReason}</p>

          {/* Simplified Hardware Readiness Checklist (no internal file paths) */}
          <div className="space-y-2 rounded-lg bg-muted/30 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Cpu className="size-3 text-muted-foreground/70" />
                Detected Hardware:
              </span>
              <span className="text-[11px] font-medium text-foreground truncate max-w-[170px]">
                {detectedGpuName}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Layers className="size-3 text-muted-foreground/70" />
                PyTorch Acceleration:
              </span>
              <span
                className={cn(
                  'text-[11px] font-medium flex items-center gap-1',
                  pytorch.available ? 'text-emerald-500' : 'text-amber-500'
                )}
              >
                {pytorch.available ? (
                  <>
                    <CheckCircle2 className="size-3" />
                    <span>CUDA Ready</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="size-3" />
                    <span>Unavailable</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Layers className="size-3 text-muted-foreground/70" />
                Vulkan Engine (NCNN):
              </span>
              <span
                className={cn(
                  'text-[11px] font-medium flex items-center gap-1',
                  ncnn.available ? 'text-emerald-500' : 'text-destructive'
                )}
              >
                {ncnn.available ? (
                  <>
                    <CheckCircle2 className="size-3" />
                    <span>Ready</span>
                  </>
                ) : (
                  <span>Missing</span>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="size-3 text-muted-foreground/70" />
                AI Model Support:
              </span>
              <span className="text-[11px] font-medium text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="size-3" />
                <span>Ready</span>
              </span>
            </div>
          </div>

          {/* Action Callout if PyTorch backend is selected but unavailable */}
          {isPyTorchUnavailable && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium text-[11px]">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>PyTorch acceleration requires setup</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                PyTorch dependencies are missing. You can configure custom Python paths or copy
                setup commands in the Advanced / Developer Settings section below.
              </p>
              {onOpenAdvanced && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] rounded-lg px-2 mt-1"
                  onClick={onOpenAdvanced}
                >
                  Configure in Advanced Settings
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
