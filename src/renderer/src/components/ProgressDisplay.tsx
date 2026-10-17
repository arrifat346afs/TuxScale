import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'
import tuxscaleLogo from '../assets/tuxscale-logo.png'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import type { ProgressData } from '../types'
import { IdleDisplay } from './IdleDisplay'

type ProgressDisplayProps = {
  progress: ProgressData | null
  logs: string[]
  onCancel: () => void
  isProcessing: boolean
  batchMode: boolean
  videoName: string | null
  folderPath: string | null
  folderVideoCount: number
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
  onCancel,
  isProcessing,
  batchMode,
  videoName,
  folderPath,
  folderVideoCount
}: ProgressDisplayProps): React.ReactElement => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const startTimeRef = useRef<number>(Date.now())

  const isDone = progress?.stage === 'done'

  useEffect(() => {
    if (!isProcessing) {
      setElapsedSeconds(0)
      return
    }

    if (isDone) return

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [isProcessing, isDone])

  if (!progress && !isProcessing) {
    return (
      <IdleDisplay
        videoName={videoName}
        folderPath={folderPath}
        folderVideoCount={folderVideoCount}
        batchMode={batchMode}
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

  const rawVideoName = progress?.batchInfo?.videoName || videoName || 'Video file'
  const displayName = rawVideoName.split(/[/\\]/).pop() || rawVideoName

  const countDisplay = progress?.batchInfo
    ? `${progress.batchInfo.currentVideo}/${progress.batchInfo.totalVideos}`
    : batchMode && folderVideoCount > 0
      ? `1/${folderVideoCount}`
      : `${percent}%`

  return (
    <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl text-center flex flex-col items-center">
      {/* Title & Video Subtitle */}
      <div className="space-y-1 w-full text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          {isDone ? 'Complete' : 'Upscaling'}
        </h2>
        <p className="text-sm text-muted-foreground truncate max-w-xs mx-auto">
          {isDone ? 'Upscaling completed successfully!' : displayName}
        </p>
      </div>

      {/* Rotating Logo during upscaling */}
      <div className="my-8 flex items-center justify-center [perspective:1000px]">
        <img
          src={tuxscaleLogo}
          alt="TuxScale"
          className={cn(
            'size-36 select-none object-contain rounded-3xl drop-shadow-md',
            isProcessing && !isDone && 'animate-spin-horizontal'
          )}
        />
      </div>

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
