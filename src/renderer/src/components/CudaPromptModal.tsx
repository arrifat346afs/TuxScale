import React, { useState, useEffect } from 'react'
import {
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Terminal,
  ChevronDown,
  Loader2,
  HardDrive
} from 'lucide-react'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { Badge } from './ui/badge'
import { cn } from '@/lib/utils'

type CudaPromptModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  gpuName?: string
}

export const CudaPromptModal: React.FC<CudaPromptModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  gpuName
}) => {
  const [step, setStep] = useState<'prompt' | 'installing' | 'success' | 'error'>('prompt')
  const [percent, setPercent] = useState(0)
  const [statusMessage, setStatusMessage] = useState('Initializing installation...')
  const [logs, setLogs] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [showLogs, setShowLogs] = useState(false)
  const [dontAskAgain, setDontAskAgain] = useState(false)

  const handleCloseModal = (): void => {
    setStep('prompt')
    setPercent(0)
    setLogs([])
    onClose()
  }

  useEffect(() => {
    const unsub = window.api.onPyTorchInstallProgress((data) => {
      setPercent(data.percent)
      setStatusMessage(data.message)
      if (data.log) {
        setLogs((prev) => [...prev.slice(-150), data.log!])
      }
    })
    return () => unsub()
  }, [])

  if (!isOpen) return null

  const handleDismiss = (): void => {
    if (dontAskAgain) {
      localStorage.setItem('cudaPromptDismissed', 'true')
    }
    onClose()
  }

  const handleStartInstall = async (): Promise<void> => {
    setStep('installing')
    setPercent(2)
    setStatusMessage('Starting PyTorch CUDA installer...')
    setLogs(['[TuxScale] Starting setup into ~/.config/tuxscale/pytorch-env...'])

    try {
      const result = await window.api.installPyTorchEnv()
      if (result.success) {
        setStep('success')
        onSuccess()
      } else {
        setStep('error')
        setErrorMessage(result.error || 'Setup failed. Please check the terminal logs.')
      }
    } catch (err) {
      setStep('error')
      setErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }

  const handleCancel = (): void => {
    window.api.cancelPyTorchInstall()
    setStep('prompt')
    setStatusMessage('Cancelled')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in-50 duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
        {/* =====================================================================
            STATE 1: PROMPT
        ===================================================================== */}
        {step === 'prompt' && (
          <>
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <Zap className="size-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">NVIDIA GPU Detected</h3>
                  <Badge
                    variant="outline"
                    className="text-[10px] text-emerald-400 border-emerald-500/40"
                  >
                    CUDA Ready
                  </Badge>
                </div>
                {gpuName && (
                  <p className="text-xs font-mono text-muted-foreground truncate">{gpuName}</p>
                )}
                <p className="text-xs text-muted-foreground pt-1 leading-relaxed">
                  Would you like to install the optional PyTorch CUDA acceleration backend?
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-xl bg-muted/40 p-3.5 border border-border/70 text-xs">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <HardDrive className="size-4 text-primary" />
                <span>Installation Details</span>
              </div>
              <ul className="space-y-1.5 text-muted-foreground pl-6 list-disc text-[11px] leading-relaxed">
                <li>
                  Installs isolated into{' '}
                  <code className="text-foreground bg-background px-1 py-0.5 rounded font-mono text-[10px]">
                    ~/.config/tuxscale/pytorch-env
                  </code>{' '}
                  (~2.5 GB).
                </li>
                <li>Does not touch system packages, global Python, or sudo.</li>
                <li>Unlocks maximum Tensor Core GPU acceleration and custom PyTorch models.</li>
                <li>Built-in NCNN (Vulkan) engine remains ready anytime with zero extra setup.</li>
              </ul>
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-border bg-background text-primary focus:ring-primary size-3.5 cursor-pointer"
                  checked={dontAskAgain}
                  onChange={(e) => setDontAskAgain(e.target.checked)}
                />
                <span>Don&apos;t ask again</span>
              </label>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs rounded-xl h-9 px-3"
                  onClick={handleDismiss}
                >
                  Use Default (Vulkan)
                </Button>
                <Button
                  size="sm"
                  className="text-xs rounded-xl h-9 px-4 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm cursor-pointer"
                  onClick={handleStartInstall}
                >
                  <Sparkles className="size-3.5" />
                  <span>Install PyTorch CUDA</span>
                </Button>
              </div>
            </div>
          </>
        )}

        {/* =====================================================================
            STATE 2: INSTALLING PROGRESS
        ===================================================================== */}
        {step === 'installing' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="size-5 animate-spin text-emerald-400" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Installing PyTorch CUDA Backend
                </h3>
                <p className="text-xs text-muted-foreground">
                  Target: ~/.config/tuxscale/pytorch-env
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate max-w-[340px]">
                  {statusMessage}
                </span>
                <span className="font-mono font-medium text-foreground">{percent}%</span>
              </div>
              <Progress value={percent} className="h-2 rounded-full" />
            </div>

            {/* Collapsible log output */}
            <div className="rounded-xl border border-border/80 bg-background/80 overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between p-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setShowLogs(!showLogs)}
              >
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <Terminal className="size-3.5" />
                  <span>Terminal Output ({logs.length} lines)</span>
                </div>
                <ChevronDown
                  className={cn(
                    'size-3.5 transition-transform duration-200',
                    showLogs && 'rotate-180'
                  )}
                />
              </button>
              {showLogs && (
                <div className="p-3 border-t border-border/50 max-h-48 overflow-y-auto font-mono text-[10px] text-muted-foreground leading-relaxed space-y-0.5 bg-black/40">
                  {logs.map((line, idx) => (
                    <div key={idx} className="whitespace-pre-wrap break-all">
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                className="text-xs rounded-xl h-8"
                onClick={handleCancel}
              >
                Cancel Setup
              </Button>
            </div>
          </div>
        )}

        {/* =====================================================================
            STATE 3: SUCCESS
        ===================================================================== */}
        {step === 'success' && (
          <div className="space-y-4 text-center py-2">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <CheckCircle2 className="size-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">
                PyTorch CUDA Backend Ready!
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                PyTorch with CUDA 12.4, Real-ESRGAN, BasicSR, and Spandrel are configured in
                ~/.config/tuxscale/pytorch-env.
              </p>
            </div>
            <Button
              className="rounded-xl h-9 px-6 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium cursor-pointer"
              onClick={handleCloseModal}
            >
              Get Started
            </Button>
          </div>
        )}

        {/* =====================================================================
            STATE 4: ERROR
        ===================================================================== */}
        {step === 'error' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 text-destructive">
              <AlertCircle className="size-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Installation Error</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{errorMessage}</p>
              </div>
            </div>

            {logs.length > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 max-h-40 overflow-y-auto font-mono text-[10px] text-muted-foreground leading-relaxed">
                {logs.slice(-25).map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs rounded-xl h-8"
                onClick={handleCloseModal}
              >
                Close
              </Button>
              <Button size="sm" className="text-xs rounded-xl h-8" onClick={handleStartInstall}>
                Retry
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
