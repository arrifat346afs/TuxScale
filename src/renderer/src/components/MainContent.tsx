/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react'
import { FileVideo, Film, FolderOpen } from 'lucide-react'
import { ReactCompareSlider } from 'react-compare-slider'
import { Button } from './ui/button'
import { ProgressDisplay } from './ProgressDisplay'
import { IdleDisplay } from './IdleDisplay'
import type { ProgressData } from '../types'

const VALID_VIDEO_EXTENSIONS = [
  'mp4',
  'webm',
  'mkv',
  'avi',
  'mov',
  'flv',
  'wmv',
  'ts',
  'm4v',
  'mpeg',
  'mpg'
]

type MainContentProps = {
  batchMode: boolean
  videoPath: string | null
  folderPath: string | null
  folderVideoCount: number
  outputPath: string | null
  upscaledVideoPath: string | null
  isProcessing: boolean
  progress: ProgressData | null
  logs: string[]
  videoName: string | null
  onSelectVideo: () => Promise<void>
  onSelectFolder: () => Promise<void>
  onVideoDropped: (path: string) => void
  onCancel: () => void
}

export function MainContent({
  batchMode,
  videoPath,
  folderPath,
  folderVideoCount,
  outputPath,
  upscaledVideoPath,
  isProcessing,
  progress,
  logs,
  videoName,
  onSelectVideo,
  onSelectFolder,
  onVideoDropped,
  onCancel
}: MainContentProps): React.ReactElement {
  const [isDragging, setIsDragging] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [upscaledVideoUrl, setUpscaledVideoUrl] = useState<string | null>(null)

  const showIdle = useMemo(() => {
    if (batchMode) return folderPath === null
    return videoPath === null
  }, [batchMode, videoPath, folderPath])

  useEffect(() => {
    if (!videoPath) {
      setVideoUrl(null)
      return
    }
    if (
      videoPath.startsWith('http://') ||
      videoPath.startsWith('https://') ||
      videoPath.startsWith('local-file://')
    ) {
      setVideoUrl(videoPath)
      return
    }
    window.api
      .getVideoUrl(videoPath)
      .then(setVideoUrl)
      .catch(() => setVideoUrl(null))
  }, [videoPath])

  useEffect(() => {
    if (!upscaledVideoPath) {
      setUpscaledVideoUrl(null)
      return
    }
    window.api
      .getVideoUrl(upscaledVideoPath)
      .then(setUpscaledVideoUrl)
      .catch(() => setUpscaledVideoUrl(null))
  }, [upscaledVideoPath])

  const handleDragEnter = (e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragging(false)

    if (e.dataTransfer.files.length === 0) return
    const file = e.dataTransfer.files[0]
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''

    if (!VALID_VIDEO_EXTENSIONS.includes(extension)) return

    if (batchMode) {
      void onSelectFolder()
    } else if ('path' in file && typeof file.path === 'string') {
      onVideoDropped(file.path)
    }
  }

  const handleDoubleClick = (): void => {
    if (batchMode) {
      void onSelectFolder()
    } else {
      void onSelectVideo()
    }
  }

  const showComparison = !batchMode && Boolean(videoUrl && upscaledVideoUrl)

  return (
    <div
      className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDoubleClick={handleDoubleClick}
    >
      {isDragging && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-card p-8 text-center shadow-lg">
            <FileVideo className="mx-auto mb-3 size-10 text-primary" />
            <p className="text-lg font-medium">Drop video here</p>
          </div>
        </div>
      )}

      {showIdle && (
        <IdleDisplay
          videoName={videoName}
          folderPath={folderPath}
          folderVideoCount={folderVideoCount}
          batchMode={batchMode}
        />
      )}

      {!batchMode && videoUrl && !showComparison && (
        <div className="relative z-10 flex h-full w-full items-center justify-center p-8">
          <video
            key={`original-${videoUrl}`}
            src={videoUrl}
            controls
            className="max-h-[70vh] max-w-full rounded-xl border shadow-sm"
          />
        </div>
      )}

      {showComparison && (
        <div className="relative z-10 flex h-full w-full items-center justify-center p-8">
          <ReactCompareSlider
            itemOne={
              <video src={videoUrl ?? undefined} controls className="h-full w-full rounded-xl" />
            }
            itemTwo={
              <video
                src={upscaledVideoUrl ?? undefined}
                controls
                className="h-full w-full rounded-xl"
              />
            }
            className="max-h-[70vh] max-w-full rounded-xl shadow-sm"
          />
        </div>
      )}

      {batchMode && folderPath && (
        <div className="z-10 flex flex-col items-center gap-4 text-center">
          <div className="rounded-2xl border bg-card p-8 shadow-sm">
            <FolderOpen className="mx-auto mb-3 size-12 text-muted-foreground" />
            <p className="max-w-md truncate text-lg font-medium">{folderPath}</p>
            {folderVideoCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {folderVideoCount} video{folderVideoCount === 1 ? '' : 's'} found
              </p>
            )}
          </div>
          {outputPath && <p className="text-sm text-muted-foreground">Output: {outputPath}</p>}
        </div>
      )}

      {isProcessing && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
          <ProgressDisplay
            progress={progress}
            logs={logs}
            onCancel={onCancel}
            isProcessing={isProcessing}
            batchMode={batchMode}
            videoName={videoName}
            folderPath={folderPath}
            folderVideoCount={folderVideoCount}
          />
        </div>
      )}

      {!isProcessing && !showIdle && (
        <Button
          variant="outline"
          size="sm"
          className="absolute bottom-6 right-6 z-20 rounded-full"
          onClick={batchMode ? onSelectFolder : onSelectVideo}
        >
          {batchMode ? <FolderOpen className="mr-2 size-4" /> : <Film className="mr-2 size-4" />}
          Change {batchMode ? 'Folder' : 'Video'}
        </Button>
      )}
    </div>
  )
}
