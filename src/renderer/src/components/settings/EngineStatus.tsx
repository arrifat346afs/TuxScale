import React from 'react'
import { CheckCircle2, XCircle, RefreshCw, Cpu, AlertTriangle } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import type { AllEnginesStatus } from '../../../../../common/types/types'

type EngineStatusProps = {
  status: AllEnginesStatus | null
  isLoading: boolean
  onRefresh: () => void
}

export const EngineStatus: React.FC<EngineStatusProps> = ({ status, isLoading, onRefresh }) => {
  if (!status) {
    return (
      <div className="rounded-xl border bg-card p-4 text-center text-xs text-muted-foreground">
        Loading engine status...
      </div>
    )
  }

  const { activeBackend, preference, resolvedReason, engines } = status
  const pytorch = engines.pytorch
  const ncnn = engines.ncnn

  const isPyTorchSelected = preference === 'pytorch'
  const isPyTorchUnavailable = isPyTorchSelected && !pytorch.available

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Engine Status
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`mr-1 size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Check
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-3.5 text-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Active Engine:</span>
          <Badge variant={activeBackend === 'pytorch' ? 'default' : 'secondary'}>
            {activeBackend === 'pytorch' ? 'PyTorch (CUDA)' : 'NCNN (Vulkan)'}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{resolvedReason}</p>

        {isPyTorchUnavailable && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-destructive font-medium">
              <AlertTriangle className="size-4 shrink-0" />
              <span>PyTorch backend is unavailable</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              PyTorch is explicitly selected, but required dependencies are missing. Upscaling will
              fail until resolved.
            </p>
          </div>
        )}
      </div>

      {/* PyTorch Details */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-medium">PyTorch (NVIDIA CUDA)</span>
          <Badge variant={pytorch.available ? 'outline' : 'destructive'} className="text-[10px]">
            {pytorch.available ? 'Ready' : 'Unavailable'}
          </Badge>
        </div>

        <div className="space-y-2 rounded-xl border bg-card p-3 text-xs">
          {Object.entries(pytorch.details).map(([key, item]) => (
            <div key={key} className="flex items-start gap-2">
              {item.ok ? (
                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-[11px] leading-tight ${item.ok ? 'text-foreground' : 'text-destructive font-medium'}`}
                >
                  {item.message}
                </p>
                {item.details && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.details}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* NCNN Details */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-medium">NCNN (Vulkan)</span>
          <Badge variant={ncnn.available ? 'outline' : 'destructive'} className="text-[10px]">
            {ncnn.available ? 'Ready' : 'Missing Binary'}
          </Badge>
        </div>

        <div className="space-y-2 rounded-xl border bg-card p-3 text-xs">
          {Object.entries(ncnn.details).map(([key, item]) => (
            <div key={key} className="flex items-start gap-2">
              {item.ok ? (
                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] leading-tight text-foreground">{item.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
