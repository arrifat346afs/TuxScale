/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FileVideo,
  Film,
  FolderOpen,
  FileImage,
  ImageIcon,
  AlertCircle,
  X,
  Loader2,
  ExternalLink
} from 'lucide-react'
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider'
import { Button } from './ui/button'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { ProgressDisplay } from './ProgressDisplay'
import { IdleDisplay } from './IdleDisplay'
import { VideoPlayer } from './preview/VideoPlayer'
import { VideoComparison } from './preview/VideoComparison'
import type { ProgressData } from '../types'
import type { PreviewResult, VideoProbeInfo } from '../../../../common/types/types'

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
  onBatchModeChange?: (batch: boolean) => void
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
  onFileDropped?: (path: string, type: 'video' | 'image') => void
  onFolderDropped?: (path: string, type: 'video' | 'image') => void
  onVideoDropped?: (path: string) => void
  onCancel: () => void
}

export function MainContent({
  upscaleMode,
  onUpscaleModeChange,
  batchMode,
  onBatchModeChange,
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
  onFileDropped,
  onFolderDropped,
  onVideoDropped,
  onCancel
}: MainContentProps): React.ReactElement {
  const dragCounter = useRef(0)
  const [isDragging, setIsDragging] = useState(false)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [upscaledMediaUrl, setUpscaledMediaUrl] = useState<string | null>(null)
  const [dropError, setDropError] = useState<string | null>(null)

  // Video preview probing and proxy state
  const [videoPreview, setVideoPreview] = useState<PreviewResult | null>(null)
  const [isPreparingPreview, setIsPreparingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<{
    message: string
    info?: VideoProbeInfo
  } | null>(null)
  const [upscaledVideoPreview, setUpscaledVideoPreview] = useState<PreviewResult | null>(null)

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

  // Load video preview with probe / proxy fallback
  const loadVideoPreview = useCallback(async (path: string, forceProxy = false): Promise<void> => {
    setIsPreparingPreview(true)
    setPreviewError(null)
    try {
      const result = await window.api.getPreviewUrl({ videoPath: path, forceProxy })
      setVideoPreview(result)
      setIsPreparingPreview(false)
    } catch (err) {
      console.error('Failed to get video preview:', err)
      setIsPreparingPreview(false)
      setPreviewError({
        message: err instanceof Error ? err.message : 'Failed to prepare video preview'
      })
    }
  }, [])

  const handleCancelPreview = async (): Promise<void> => {
    if (videoPath) {
      await window.api.cancelPreview(videoPath)
    }
    setIsPreparingPreview(false)
  }

  // Handle active input path change
  useEffect(() => {
    if (!videoPath) {
      setMediaUrl(null)
      setVideoPreview(null)
      setPreviewError(null)
      setIsPreparingPreview(false)
      return
    }

    if (upscaleMode === 'image') {
      if (
        videoPath.startsWith('http://') ||
        videoPath.startsWith('https://') ||
        videoPath.startsWith('local-file://')
      ) {
        setMediaUrl(videoPath)
        return
      }
      window.api
        .getImageUrl(videoPath)
        .then(setMediaUrl)
        .catch(() => setMediaUrl(null))
    } else {
      void loadVideoPreview(videoPath)
    }
  }, [videoPath, upscaleMode, loadVideoPreview])

  // Handle upscaled output path change
  useEffect(() => {
    if (!upscaledVideoPath) {
      setUpscaledMediaUrl(null)
      setUpscaledVideoPreview(null)
      return
    }

    if (upscaleMode === 'image') {
      if (
        upscaledVideoPath.startsWith('http://') ||
        upscaledVideoPath.startsWith('https://') ||
        upscaledVideoPath.startsWith('local-file://')
      ) {
        setUpscaledMediaUrl(upscaledVideoPath)
        return
      }
      window.api
        .getImageUrl(upscaledVideoPath)
        .then(setUpscaledMediaUrl)
        .catch(() => setUpscaledMediaUrl(null))
    } else {
      window.api
        .getPreviewUrl({ videoPath: upscaledVideoPath })
        .then(setUpscaledVideoPreview)
        .catch(console.error)
    }
  }, [upscaledVideoPath, upscaleMode])

  const handleDragEnter = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current += 1
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const handleDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setIsDragging(false)
    setDropError(null)

    let resolvedPath = ''

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      try {
        resolvedPath = window.api.getPathForFile(file)
      } catch (err) {
        console.warn('getPathForFile failed, trying fallback:', err)
      }
      if (!resolvedPath) {
        resolvedPath = (file as unknown as { path?: string })?.path || ''
      }
    }

    if (!resolvedPath && e.dataTransfer) {
      const uriList = e.dataTransfer.getData('text/uri-list')
      if (uriList) {
        const firstUri = uriList.split(/[\r\n]+/).find((u) => u.trim().startsWith('file://'))
        if (firstUri) {
          try {
            resolvedPath = decodeURIComponent(new URL(firstUri.trim()).pathname)
          } catch (err) {
            console.warn('Failed to parse URI from uri-list:', err)
          }
        }
      }
    }

    if (!resolvedPath && e.dataTransfer) {
      const text = e.dataTransfer.getData('text/plain')?.trim()
      if (text && (text.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(text))) {
        resolvedPath = text
      }
    }

    if (!resolvedPath) {
      setDropError('Unable to resolve path for the dropped item.')
      return
    }

    try {
      const info = await window.api.inspectPath(resolvedPath)
      if (!info.exists) {
        setDropError(`Path does not exist: ${resolvedPath}`)
        return
      }

      if (info.isDirectory) {
        const [videos, images] = await Promise.all([
          window.api.getFolderVideos(resolvedPath).catch(() => []),
          window.api.getFolderImages(resolvedPath).catch(() => [])
        ])

        if (videos.length === 0 && images.length === 0) {
          setDropError(`No supported video or image files found in folder: ${info.name}`)
          return
        }

        let targetMode: 'video' | 'image' = upscaleMode
        if (upscaleMode === 'image') {
          if (images.length > 0) {
            targetMode = 'image'
          } else if (videos.length > 0) {
            targetMode = 'video'
          }
        } else {
          if (videos.length > 0) {
            targetMode = 'video'
          } else if (images.length > 0) {
            targetMode = 'image'
          }
        }

        if (onUpscaleModeChange && targetMode !== upscaleMode) {
          onUpscaleModeChange(targetMode)
        }
        if (onBatchModeChange) {
          onBatchModeChange(true)
        }
        if (onFolderDropped) {
          await onFolderDropped(resolvedPath, targetMode)
        } else {
          onVideoDropped?.(resolvedPath)
        }
        return
      }

      if (info.isFile) {
        const ext = info.ext.toLowerCase()
        const isVideo = VALID_VIDEO_EXTENSIONS.includes(ext)
        const isImage = VALID_IMAGE_EXTENSIONS.includes(ext)

        if (!isVideo && !isImage) {
          setDropError(
            `Unsupported file format: .${ext || 'unknown'}. Supported: Video (MP4, MKV, AVI, etc.) or Image (PNG, JPG, WEBP, etc.)`
          )
          return
        }

        const targetMode: 'video' | 'image' = isImage ? 'image' : 'video'

        if (onUpscaleModeChange && targetMode !== upscaleMode) {
          onUpscaleModeChange(targetMode)
        }
        if (onBatchModeChange && batchMode) {
          onBatchModeChange(false)
        }
        if (onFileDropped) {
          onFileDropped(resolvedPath, targetMode)
        } else {
          onVideoDropped?.(resolvedPath)
        }
        return
      }

      setDropError('Dropped item is neither a regular file nor a directory.')
    } catch (err) {
      console.error('Error handling dropped item:', err)
      setDropError('Failed to process dropped item.')
    }
  }

  const handleDoubleClick = (): void => {
    if (batchMode) {
      void onSelectFolder()
    } else {
      void onSelectVideo()
    }
  }

  const showComparison =
    !batchMode &&
    Boolean(upscaleMode === 'image' ? mediaUrl && upscaledMediaUrl : videoPath && upscaledVideoPath)

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
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-primary/10 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-card/95 p-8 text-center shadow-lg backdrop-blur-md">
            {upscaleMode === 'image' ? (
              <FileImage className="mx-auto mb-3 size-10 text-primary" />
            ) : (
              <FileVideo className="mx-auto mb-3 size-10 text-primary" />
            )}
            <p className="text-lg font-medium">
              {batchMode
                ? upscaleMode === 'image'
                  ? 'Drop image folder or image here'
                  : 'Drop video folder or video here'
                : upscaleMode === 'image'
                  ? 'Drop image or folder here'
                  : 'Drop video or folder here'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Images, videos, or folders supported
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
      {!batchMode && !showComparison && (
        <div className="relative z-10 flex h-full w-full items-center justify-center p-8">
          {upscaleMode === 'image' && mediaUrl ? (
            <img
              key={`original-img-${mediaUrl}`}
              src={mediaUrl}
              alt={videoName || 'Original Image'}
              loading="lazy"
              decoding="async"
              className="max-h-[70vh] max-w-full rounded-xl border object-contain shadow-sm"
            />
          ) : upscaleMode === 'video' && videoPath ? (
            isPreparingPreview ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/40 bg-card/90 p-8 shadow-md backdrop-blur-md">
                <Loader2 className="size-8 animate-spin text-primary" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">Preparing preview...</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Generating an H.264 proxy for smooth playback...
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelPreview}
                  className="mt-1 cursor-pointer"
                >
                  Cancel
                </Button>
              </div>
            ) : previewError ? (
              <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center shadow-lg backdrop-blur-md">
                <AlertCircle className="size-10 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive">
                    Unable to preview video in app
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {previewError.message ||
                      'This video codec or format cannot be decoded by the internal player.'}
                  </p>
                </div>
                {previewError.info && (
                  <div className="w-full rounded-xl bg-background/50 border border-border/40 p-3 text-left text-xs font-mono space-y-1">
                    <div>
                      <span className="text-muted-foreground">Codec:</span>{' '}
                      {previewError.info.codec_name}
                      {previewError.info.profile ? ` (${previewError.info.profile})` : ''}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Pixel Format:</span>{' '}
                      {previewError.info.pix_fmt}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Resolution:</span>{' '}
                      {previewError.info.width}x{previewError.info.height}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Frame Rate:</span>{' '}
                      {previewError.info.fps.toFixed(2)} fps
                    </div>
                  </div>
                )}
                <Button
                  variant="default"
                  size="sm"
                  className="gap-1.5 cursor-pointer"
                  onClick={() => window.api.openPath(videoPath)}
                >
                  <ExternalLink className="size-3.5" />
                  Open in system player
                </Button>
              </div>
            ) : videoPreview ? (
              <VideoPlayer
                src={videoPreview.url}
                videoName={videoName}
                info={videoPreview.info}
                kind={videoPreview.kind}
                truncated={videoPreview.truncated}
                onError={() => {
                  if (videoPreview.kind === 'native') {
                    // Fall back to generating proxy
                    void loadVideoPreview(videoPath, true)
                  } else {
                    setPreviewError({
                      message: 'Internal player failed to decode proxy stream.',
                      info: videoPreview.info
                    })
                  }
                }}
                onOpenInSystemPlayer={() => window.api.openPath(videoPath)}
              />
            ) : null
          ) : null}
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
            <VideoComparison
              originalPath={videoPath!}
              upscaledPath={upscaledVideoPath!}
              duration={videoPreview?.info.duration || upscaledVideoPreview?.info.duration}
              videoName={videoName}
              onOpenInSystemPlayer={() => window.api.openPath(upscaledVideoPath!)}
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
