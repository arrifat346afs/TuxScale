import { useEffect, useRef, useState } from 'react'
import { Terminal, Copy, Check } from 'lucide-react'
import { cn } from '../lib/utils'
import tuxscaleLogo from '../assets/tuxscale-logo.png'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import type { ProgressData } from '../types'
import { IdleDisplay } from './IdleDisplay'
import { BatchProgressHeader } from './BatchProgressHeader'

type ProgressDisplayProps = {
  progress: ProgressData | null
  logs: string[]
  onCancel: () => void
  isProcessing: boolean
  batchMode: boolean
  videoName: string | null
  folderPath: string | null
  folderVideoCount: number
  mode?: 'video' | 'image'
}

function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export const ProgressDisplay = ({
  progress,
  logs = [],
  onCancel,
  isProcessing,
  batchMode,
  videoName,
  folderPath,
  folderVideoCount,
  mode = 'video'
}: ProgressDisplayProps): React.ReactElement => {
  const [showLogs, setShowLogs] = useState(false)
  const [copied, setCopied] = useState(false)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const startTimeRef = useRef<number | null>(null)

  const isDone = progress?.stage === 'done'

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        setShowLogs((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return (): void => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (showLogs && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs, showLogs])

  const handleCopyLogs = (): void => {
    if (logs.length === 0) return
    navigator.clipboard.writeText(logs.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    if (!isProcessing || isDone) return

    startTimeRef.current = Date.now()
    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }
    }, 1000)

    return (): void => {
      clearInterval(interval)
      setElapsedSeconds(0)
    }
  }, [isProcessing, isDone])

  if (!progress && !isProcessing) {
    return (
      <IdleDisplay
        videoName={videoName}
        folderPath={folderPath}
        folderVideoCount={folderVideoCount}
        batchMode={batchMode}
        mode={mode}
      />
    )
  }

  // Fraction of the current video completed (0.0 to 1.0)
  const currentVideoFraction =
    progress && progress.overall !== undefined
      ? Math.max(0, Math.min(1, progress.overall))
      : progress && progress.total > 0
        ? Math.max(0, Math.min(1, progress.current / progress.total))
        : 0

  // Overall batch progress from video 1 to the last video
  let overallFraction = currentVideoFraction
  if (progress?.batchInfo && progress.batchInfo.totalVideos > 0) {
    const { currentVideo, totalVideos } = progress.batchInfo
    overallFraction = Math.max(
      0,
      Math.min(1, (currentVideo - 1 + currentVideoFraction) / totalVideos)
    )
  }

  const percent = isDone ? 100 : Math.min(Math.round(overallFraction * 100), 100)

  const remainingSeconds =
    overallFraction > 0.01 && elapsedSeconds >= 3
      ? Math.max(0, Math.round(elapsedSeconds / overallFraction - elapsedSeconds))
      : null

  const rawVideoName =
    progress?.batchInfo?.videoName || videoName || (mode === 'image' ? 'Image file' : 'Video file')
  const displayName = rawVideoName.split(/[/\\]/).pop() || rawVideoName

  const countDisplay = progress?.batchInfo
    ? `${progress.batchInfo.currentVideo}/${progress.batchInfo.totalVideos} done`
    : batchMode && folderVideoCount > 0
      ? `1/${folderVideoCount} done`
      : `${percent}%`

  return (
    <div
      className={cn(
        'w-full rounded-3xl border border-border bg-card p-8 shadow-xl text-center flex flex-col items-center transition-all duration-200',
        showLogs ? 'max-w-xl' : 'max-w-md'
      )}
    >
      {/* Title & Video Subtitle */}
      <div className="space-y-1 w-full text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          {isDone ? 'Complete' : 'Upscaling'}
        </h2>
        {progress?.batchInfo ? (
          <BatchProgressHeader batchInfo={progress.batchInfo} />
        ) : (
          <p className="text-sm text-muted-foreground truncate max-w-xs mx-auto">
            {isDone ? 'Upscaling completed successfully!' : displayName}
          </p>
        )}
      </div>

      {/* Either Rotating Logo OR Logs */}
      {!showLogs ? (
        <div className="my-8 flex flex-col items-center justify-center [perspective:1000px]">
          <img
            src={tuxscaleLogo}
            alt="TuxScale"
            onClick={() => setShowLogs(true)}
            title="Click or press Ctrl+L to show logs"
            className={cn(
              'size-36 select-none object-contain rounded-3xl drop-shadow-md cursor-pointer transition-transform duration-200 hover:scale-105',
              isProcessing && !isDone && 'animate-spin-horizontal'
            )}
          />
          <button
            type="button"
            onClick={() => setShowLogs(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <Terminal className="size-3" />
            <span>Show logs</span>
            <kbd className="rounded border border-border bg-background px-1 py-0.2 font-mono text-[9px] font-semibold">
              Ctrl+L
            </kbd>
          </button>
        </div>
      ) : (
        <div className="my-6 w-full flex flex-col rounded-2xl border border-border/80 bg-zinc-950/95 text-left shadow-inner overflow-hidden">
          {/* Log Window Header */}
          <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/80 px-3.5 py-2">
            <div className="flex items-center gap-2">
              <Terminal className="size-3.5 text-primary" />
              <span className="font-mono text-xs font-semibold text-zinc-300">Process Logs</span>
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                {logs.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {logs.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 font-sans text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Copy logs to clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="size-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowLogs(false)}
                className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-800/60 px-2 py-0.5 font-sans text-[10px] text-zinc-300 hover:text-white hover:bg-zinc-700/60 transition-colors cursor-pointer"
                title="Switch back to logo (Ctrl+L)"
              >
                <span>Logo</span>
                <kbd className="font-mono text-[9px] text-zinc-400">Ctrl+L</kbd>
              </button>
            </div>
          </div>

          {/* Log Window Content */}
          <div
            ref={logContainerRef}
            className="h-48 overflow-y-auto overflow-x-auto p-3 font-mono text-xs text-zinc-300 space-y-1 select-text"
          >
            {logs.length === 0 ? (
              <p className="text-zinc-500 italic">No logs recorded yet. Waiting for output...</p>
            ) : (
              logs.map((log, i) => {
                const isError =
                  log.toLowerCase().includes('error') || log.toLowerCase().includes('failed')
                const isSuccess =
                  log.toLowerCase().includes('complete') || log.toLowerCase().includes('done')
                return (
                  <p
                    key={i}
                    className={cn(
                      'leading-relaxed break-all whitespace-pre-wrap',
                      isError && 'text-rose-400 font-medium',
                      isSuccess && 'text-emerald-400 font-medium',
                      !isError && !isSuccess && 'text-zinc-300'
                    )}
                  >
                    {log}
                  </p>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Progress Counter, Progress Bar & Timer */}
      <div className="w-full space-y-3 mb-8">
        <p className="text-base font-semibold text-primary text-center tracking-wide">
          {countDisplay}
        </p>
        <Progress value={percent} className="h-3 w-full bg-secondary" />

        <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
          <span>
            {isDone ? 'Total Time: ' : 'Elapsed: '}
            <span className="font-mono font-medium text-foreground">
              {formatDuration(elapsedSeconds)}
            </span>
          </span>
          <span className="font-medium text-foreground">{percent}%</span>
          {!isDone && remainingSeconds !== null ? (
            <span>
              Remaining:{' '}
              <span className="font-mono font-medium text-foreground">
                ~{formatDuration(remainingSeconds)}
              </span>
            </span>
          ) : (
            <span>{isDone ? 'Finished' : ''}</span>
          )}
        </div>
      </div>

      {/* Cancel Button */}
      {isProcessing && (
        <Button
          variant="destructive"
          className="w-full h-11 rounded-full text-base font-medium cursor-pointer transition-colors"
          onClick={onCancel}
        >
          {isDone ? 'Close' : 'Cancel'}
        </Button>
      )}
    </div>
  )
}
