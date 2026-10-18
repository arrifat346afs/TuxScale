/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react'
import { FileVideo, Film, FolderOpen, FileImage, ImageIcon, AlertCircle, X } from 'lucide-react'
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider'
import { Button } from './ui/button'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
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

const VALID_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'tif']

type MainContentProps = {
  upscaleMode: 'video' | 'image'
  onUpscaleModeChange?: (mode: 'video' | 'image') => void
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
  upscaleMode,
  onUpscaleModeChange,
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
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [upscaledMediaUrl, setUpscaledMediaUrl] = useState<string | null>(null)
  const [dropError, setDropError] = useState<string | null>(null)

  const showIdle = useMemo(() => {
    if (batchMode) return folderPath === null
    return videoPath === null
  }, [batchMode, videoPath, folderPath])

  // Clear drop error after 5 seconds
  useEffect(() => {
    if (!dropError) return
    const timer = setTimeout(() => setDropError(null), 5000)
    return (): void => clearTimeout(timer)
  }, [dropError])

  useEffect(() => {
    if (!videoPath) {
      setMediaUrl(null)
      return
    }
    if (
      videoPath.startsWith('http://') ||
      videoPath.startsWith('https://') ||
      videoPath.startsWith('local-file://')
    ) {
      setMediaUrl(videoPath)
      return
    }

    if (upscaleMode === 'image') {
      window.api
        .getImageUrl(videoPath)
        .then(setMediaUrl)
        .catch(() => setMediaUrl(null))
    } else {
      window.api
        .getVideoUrl(videoPath)
        .then(setMediaUrl)
        .catch(() => setMediaUrl(null))
    }
  }, [videoPath, upscaleMode])

  useEffect(() => {
    if (!upscaledVideoPath) {
      setUpscaledMediaUrl(null)
      return
    }
    if (
      upscaledVideoPath.startsWith('http://') ||
      upscaledVideoPath.startsWith('https://') ||
      upscaledVideoPath.startsWith('local-file://')
    ) {
      setUpscaledMediaUrl(upscaledVideoPath)
      return
    }

    if (upscaleMode === 'image') {
      window.api
        .getImageUrl(upscaledVideoPath)
        .then(setUpscaledMediaUrl)
        .catch(() => setUpscaledMediaUrl(null))
    } else {
      window.api
        .getVideoUrl(upscaledVideoPath)
        .then(setUpscaledMediaUrl)
        .catch(() => setUpscaledMediaUrl(null))
    }
  }, [upscaledVideoPath, upscaleMode])

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
    setDropError(null)

    if (e.dataTransfer.files.length === 0) return
    const file = e.dataTransfer.files[0]
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''

    const isImage = upscaleMode === 'image'
    if (isImage) {
      if (VALID_IMAGE_EXTENSIONS.includes(extension)) {
        if (batchMode) {
          void onSelectFolder()
        } else {
          const filePath = window.api.getPathForFile(file)
          if (filePath) {
            onVideoDropped(filePath)
          } else {
            setDropError('Unable to resolve path for the dropped image.')
          }
        }
      } else if (VALID_VIDEO_EXTENSIONS.includes(extension)) {
        setDropError('Selected file is a video. Please switch to Video mode to upscale videos.')
      } else {
        setDropError(
          `Unsupported image format: .${extension}. Supported: PNG, JPG, WEBP, BMP, TIFF.`
        )
      }
    } else {
      if (VALID_VIDEO_EXTENSIONS.includes(extension)) {
        if (batchMode) {
          void onSelectFolder()
        } else {
          const filePath = window.api.getPathForFile(file)
          if (filePath) {
            onVideoDropped(filePath)
          } else {
            setDropError('Unable to resolve path for the dropped video.')
          }
        }
      } else if (VALID_IMAGE_EXTENSIONS.includes(extension)) {
        setDropError('Selected file is an image. Please switch to Image mode to upscale images.')
      } else {
        setDropError(`Unsupported video format: .${extension}.`)
      }
    }
  }

  const handleDoubleClick = (): void => {
    if (batchMode) {
      void onSelectFolder()
    } else {
      void onSelectVideo()
    }
  }

  const showComparison = !batchMode && Boolean(mediaUrl && upscaledMediaUrl)

  return (
    <div
      className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDoubleClick={handleDoubleClick}
    >
      {/* Mode switch: Videos | Images */}
      {!isProcessing && onUpscaleModeChange && (
        <div
          className="absolute top-6 left-1/2 -translate-x-1/2 z-30"
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <Tabs
            value={upscaleMode}
            onValueChange={(val) => onUpscaleModeChange(val as 'video' | 'image')}
          >
            <TabsList className="bg-muted/40 p-1 border border-border/40 shadow-sm backdrop-blur-md">
              <TabsTrigger value="video" className="px-5 py-1.5 text-xs font-medium cursor-pointer">
                <Film className="mr-1.5 size-3.5" />
                Videos
              </TabsTrigger>
              <TabsTrigger value="image" className="px-5 py-1.5 text-xs font-medium cursor-pointer">
                <ImageIcon className="mr-1.5 size-3.5" />
                Images
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* Drop rejection alert */}
      {dropError && (
        <div className="absolute top-20 z-50 flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-2.5 text-xs font-medium text-destructive backdrop-blur-md shadow-lg animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{dropError}</span>
          <button
            type="button"
            onClick={() => setDropError(null)}
            className="ml-2 hover:opacity-80 cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {isDragging && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-card p-8 text-center shadow-lg">
            {upscaleMode === 'image' ? (
              <FileImage className="mx-auto mb-3 size-10 text-primary" />
            ) : (
              <FileVideo className="mx-auto mb-3 size-10 text-primary" />
            )}
            <p className="text-lg font-medium">
              {upscaleMode === 'image' ? 'Drop image here' : 'Drop video here'}
            </p>
          </div>
        </div>
      )}

      {showIdle && (
        <IdleDisplay
          videoName={videoName}
          folderPath={folderPath}
          folderVideoCount={folderVideoCount}
          batchMode={batchMode}
          mode={upscaleMode}
        />
      )}

      {/* Single Media Preview */}
      {!batchMode && mediaUrl && !showComparison && (
        <div className="relative z-10 flex h-full w-full items-center justify-center p-8">
          {upscaleMode === 'image' ? (
            <img
              key={`original-img-${mediaUrl}`}
              src={mediaUrl}
              alt={videoName || 'Original Image'}
              loading="lazy"
              decoding="async"
              className="max-h-[70vh] max-w-full rounded-xl border object-contain shadow-sm"
            />
          ) : (
            <video
              key={`original-vid-${mediaUrl}`}
              src={mediaUrl}
              controls
              className="max-h-[70vh] max-w-full rounded-xl border shadow-sm"
            />
          )}
        </div>
      )}

      {/* Comparison View */}
      {showComparison && (
        <div className="relative z-10 flex h-full w-full items-center justify-center p-8">
          {upscaleMode === 'image' ? (
            <ReactCompareSlider
              itemOne={
                <ReactCompareSliderImage
                  src={mediaUrl!}
                  alt="Original"
                  className="rounded-xl object-contain select-none"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              }
              itemTwo={
                <ReactCompareSliderImage
                  src={upscaledMediaUrl!}
                  alt="Upscaled"
                  className="rounded-xl object-contain select-none"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              }
              className="max-h-[70vh] max-w-full rounded-xl shadow-sm"
            />
          ) : (
            <ReactCompareSlider
              itemOne={
                <video src={mediaUrl ?? undefined} controls className="h-full w-full rounded-xl" />
              }
              itemTwo={
                <video
                  src={upscaledMediaUrl ?? undefined}
                  controls
                  className="h-full w-full rounded-xl"
                />
              }
              className="max-h-[70vh] max-w-full rounded-xl shadow-sm"
            />
          )}
        </div>
      )}

      {batchMode && folderPath && (
        <div className="z-10 flex flex-col items-center gap-4 text-center">
          <div className="rounded-2xl border bg-card p-8 shadow-sm">
            <FolderOpen className="mx-auto mb-3 size-12 text-muted-foreground" />
            <p className="max-w-md truncate text-lg font-medium">{folderPath}</p>
            {folderVideoCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {folderVideoCount} {upscaleMode === 'image' ? 'image' : 'video'}
                {folderVideoCount === 1 ? '' : 's'} found
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
            mode={upscaleMode}
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
          {batchMode ? (
            <FolderOpen className="mr-2 size-4" />
          ) : upscaleMode === 'image' ? (
            <ImageIcon className="mr-2 size-4" />
          ) : (
            <Film className="mr-2 size-4" />
          )}
          Change {batchMode ? 'Folder' : upscaleMode === 'image' ? 'Image' : 'Video'}
        </Button>
      )}
    </div>
  )
}
