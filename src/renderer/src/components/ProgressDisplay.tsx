import { Button } from './ui/button'
import { X } from 'lucide-react'
import type { ProgressData } from '../types'
import { IdleDisplay } from './IdleDisplay'
import { BatchProgressHeader } from './BatchProgressHeader'

type ProgressDisplayProps = {
  progress: ProgressData | null
  logs: string[]
  onCancel: () => void
  isProcessing: boolean
  videoName: string | null
  folderPath: string | null
  folderVideoCount: number
}

type ProgressStage = ProgressData['stage']

const stageLabels: Record<ProgressStage, string> = {
  extracting: 'Extracting Frames',
  upscaling: 'Upscaling Frames',
  reassembling: 'Reassembling Video',
  done: 'Complete'
}

export const ProgressDisplay = ({
  progress,
  logs,
  onCancel,
  isProcessing,
  videoName,
  folderPath,
  folderVideoCount
}: ProgressDisplayProps): React.ReactElement => {
  if (!progress && !isProcessing) {
    return (
      <IdleDisplay
        videoName={videoName}
        folderPath={folderPath}
        folderVideoCount={folderVideoCount}
      />
    )
  }

  const percent =
    progress && progress.overall !== undefined
      ? Math.min(Math.round(progress.overall * 100), 100)
      : progress && progress.total > 0
        ? Math.min(Math.round((progress.current / progress.total) * 100), 100)
        : 0

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="text-center space-y-1">
        {progress?.batchInfo ? (
          <BatchProgressHeader batchInfo={progress.batchInfo} />
        ) : (
          videoName && <p className="text-sm text-muted-foreground">{videoName}</p>
        )}
        <h2 className="text-xl font-bold">Video Upscaling</h2>
      </div>

      {progress && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{stageLabels[progress.stage]}</span>
              <span className="text-muted-foreground">{percent}%</span>
            </div>

            <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-violet-600 transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>

            {progress.message && (
              <p className="text-sm text-muted-foreground">{progress.message}</p>
            )}
          </div>

          {progress.stage === 'done' && (
            <p className="text-center text-sm font-medium text-green-600 dark:text-green-400">
              Upscaling completed successfully!
            </p>
          )}
        </div>
      )}

      {logs.length > 0 && (
        <div className="flex-1 space-y-2">
          <h3 className="text-sm font-semibold">Logs</h3>
          <div className="h-48 overflow-y-auto rounded-lg border bg-muted/50 p-3">
            {logs.map((log, i) => (
              <p key={i} className="text-xs leading-relaxed text-muted-foreground">
                {log}
              </p>
            ))}
          </div>
        </div>
      )}

      {isProcessing && (
        <Button variant="destructive" className="w-full rounded-full" onClick={onCancel}>
          <X />
          Cancel
        </Button>
      )}
    </div>
  )
}
