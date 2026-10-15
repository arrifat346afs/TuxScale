import React, { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Cpu,
  AlertTriangle,
  Copy,
  Check,
  Terminal,
  ExternalLink
} from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import type { AllEnginesStatus } from '../../../../../common/types/types'

type EngineStatusProps = {
  status: AllEnginesStatus | null
  isLoading: boolean
  onRefresh: () => void
}

const SETUP_COMMANDS = `python3.12 -m venv ~/.venvs/tuxscale
source ~/.venvs/tuxscale/bin/activate
pip install --upgrade pip setuptools wheel
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
pip install basicsr realesrgan`

export const EngineStatus: React.FC<EngineStatusProps> = ({ status, isLoading, onRefresh }) => {
  const [copied, setCopied] = useState(false)

  if (!status) {
    return (
      <div className="rounded-xl border bg-card p-4 text-center text-xs text-muted-foreground">
        Loading engine status...
      </div>
    )
  }

  const { activeBackend, preference, resolvedReason, engines, detectedPython } = status
  const pytorch = engines.pytorch
  const ncnn = engines.ncnn

  const isPyTorchSelected = preference === 'pytorch'
  const isPyTorchUnavailable = isPyTorchSelected && !pytorch.available

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
              fail until resolved. Follow the setup instructions below to configure an environment.
            </p>
          </div>
        )}
      </div>

      {/* PyTorch Details */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">PyTorch (NVIDIA CUDA)</span>
            {detectedPython?.version && (
              <span className="text-[10px] text-muted-foreground">
                (Python {detectedPython.version})
              </span>
            )}
          </div>
          <Badge variant={pytorch.available ? 'outline' : 'destructive'} className="text-[10px]">
            {pytorch.available ? 'Ready' : 'Unavailable'}
          </Badge>
        </div>

        <div className="space-y-2.5 rounded-xl border bg-card p-3 text-xs">
          {Object.entries(pytorch.details).map(([key, item]) => {
            const hasWarning = item.warning && item.ok
            return (
              <div key={key} className="flex items-start gap-2">
                {hasWarning ? (
                  <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
                ) : item.ok ? (
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p
                    className={`text-[11px] leading-tight ${
                      hasWarning
                        ? 'text-foreground'
                        : item.ok
                          ? 'text-foreground'
                          : 'text-destructive font-medium'
                    }`}
                  >
                    {item.message}
                  </p>
                  {item.warningMessage && (
                    <p className="text-[10px] text-amber-500 dark:text-amber-400 font-medium">
                      {item.warningMessage}
                    </p>
                  )}
                  {item.details && (
                    <p className="text-[10px] text-muted-foreground break-all">{item.details}</p>
                  )}
                  {!item.ok && item.fixHint && (
                    <p className="text-[10px] text-muted-foreground">
                      <span className="font-semibold text-foreground">Fix:</span> {item.fixHint}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* PyTorch Setup Action Guide */}
      {!pytorch.available && (
        <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Terminal className="size-3.5 text-primary" />
              <span>PyTorch Setup Commands</span>
            </div>
            <Button
              size="sm"
              variant={copied ? 'default' : 'secondary'}
              className="h-7 rounded-full px-2.5 text-xs gap-1 transition-all"
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
                  <span>Copy setup commands</span>
                </>
              )}
            </Button>
          </div>

          <pre className="rounded-lg bg-muted/60 p-2.5 text-[10px] font-mono leading-relaxed text-muted-foreground overflow-x-auto select-all">
            {SETUP_COMMANDS}
          </pre>

          <div className="space-y-1.5 text-[11px] text-muted-foreground">
            <p>
              • Pick the CUDA build matching your driver at{' '}
              <a
                href="https://pytorch.org/get-started/locally"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5 font-medium"
              >
                pytorch.org
                <ExternalLink className="size-2.5" />
              </a>
            </p>
            <p>
              • Virtualenvs at{' '}
              <code className="bg-muted px-1 rounded text-[10px]">~/.venvs/tuxscale</code> are
              automatically detected. Or paste{' '}
              <code className="bg-muted px-1 rounded text-[10px]">
                ~/.venvs/tuxscale/bin/python
              </code>{' '}
              into Custom Python Executable Path above.
            </p>
          </div>
        </div>
      )}

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
