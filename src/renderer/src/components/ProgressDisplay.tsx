import { useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { ScrollArea } from './ui/scroll-area'
import { X } from 'lucide-react'
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
  batchMode,
  videoName,
  folderPath,
  folderVideoCount
}: ProgressDisplayProps): React.ReactElement => {
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-slot="scroll-area-viewport"]')
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [logs])

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

  const percent =
    progress && progress.overall !== undefined
      ? Math.min(Math.round(progress.overall * 100), 100)
      : progress && progress.total > 0
        ? Math.min(Math.round((progress.current / progress.total) * 100), 100)
        : 0

  return (
    <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-lg">
      <div className="mb-5 text-center space-y-1">
        {progress?.batchInfo ? (
          <BatchProgressHeader batchInfo={progress.batchInfo} />
        ) : (
          videoName && <p className="text-sm text-muted-foreground">{videoName}</p>
        )}
        <h2 className="text-xl font-bold">Video Upscaling</h2>
      </div>

      {progress && (
        <div className="mb-5 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{stageLabels[progress.stage]}</span>
              <span className="text-muted-foreground">{percent}%</span>
            </div>

            <Progress
              value={percent}
              className="h-3 bg-secondary [&>[data-slot=progress-indicator]]:bg-violet-600"
            />

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
        <div className="mb-5 min-w-0 space-y-2">
          <h3 className="text-sm font-semibold">Logs</h3>
          <ScrollArea ref={scrollAreaRef} className="h-40 rounded-lg border bg-muted/50">
            <div className="p-3">
              {logs.map((log, i) => (
                <p
                  key={i}
                  className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                >
                  {log}
                </p>
              ))}
            </div>
          </ScrollArea>
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
