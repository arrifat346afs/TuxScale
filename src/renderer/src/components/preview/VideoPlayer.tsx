import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Repeat,
  ExternalLink,
  Clock
} from 'lucide-react'
import { Button } from '../ui/button'
import { Slider } from '../ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Badge } from '../ui/badge'
import { cn } from '@/lib/utils'
import type { VideoProbeInfo } from '../../../../../common/types/types'

export interface VideoPlayerProps {
  src: string
  videoName?: string | null
  info?: VideoProbeInfo
  kind?: 'native' | 'proxy'
  truncated?: boolean
  onError?: (event: React.SyntheticEvent<HTMLVideoElement, Event>) => void
  onOpenInSystemPlayer?: () => void
  className?: string
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function VideoPlayer({
  src,
  videoName,
  info,
  kind,
  truncated,
  onError,
  onOpenInSystemPlayer,
  className
}: VideoPlayerProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedPercent, setBufferedPercent] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isLooping, setIsLooping] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState('1')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [isSeeking, setIsSeeking] = useState(false)

  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const fps = info?.fps && info.fps > 0 ? info.fps : 30
  const effectiveDuration = duration > 0 ? duration : (info?.duration ?? 0)

  // Update buffered progress
  const updateBuffered = useCallback(() => {
    const video = videoRef.current
    if (!video || video.duration <= 0) return
    const buffered = video.buffered
    if (buffered.length > 0) {
      for (let i = buffered.length - 1; i >= 0; i--) {
        if (buffered.start(i) <= video.currentTime) {
          const percent = (buffered.end(i) / video.duration) * 100
          setBufferedPercent(Math.min(100, Math.max(0, percent)))
          break
        }
      }
    }
  }, [])

  const [prevSrc, setPrevSrc] = useState(src)
  if (prevSrc !== src) {
    setPrevSrc(src)
    setCurrentTime(0)
    setIsPlaying(false)
    setBufferedPercent(0)
  }

  // Auto-hide controls timer
  const resetHideTimer = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setControlsVisible(true)
    if (isPlaying && !isSeeking) {
      hideTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false)
      }, 2500)
    }
  }, [isPlaying, isSeeking])

  const handleMouseMove = useCallback(() => {
    resetHideTimer()
  }, [resetHideTimer])

  useEffect(() => {
    if (isPlaying && !isSeeking) {
      hideTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false)
      }, 2500)
    } else {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
        hideTimeoutRef.current = null
      }
    }
    return (): void => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
        hideTimeoutRef.current = null
      }
    }
  }, [isPlaying, isSeeking])

  // Play / Pause toggle
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play()
    } else {
      video.pause()
    }
  }, [])

  // Seeking
  const handleSeek = useCallback(
    (time: number): void => {
      const video = videoRef.current
      if (!video) return
      video.currentTime = Math.min(effectiveDuration, Math.max(0, time))
      setCurrentTime(video.currentTime)
    },
    [effectiveDuration]
  )

  // Frame stepping
  const stepBackward = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    setIsPlaying(false)
    const stepTime = 1 / fps
    video.currentTime = Math.max(0, video.currentTime - stepTime)
    setCurrentTime(video.currentTime)
  }, [fps])

  const stepForward = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    setIsPlaying(false)
    const stepTime = 1 / fps
    video.currentTime = Math.min(effectiveDuration, video.currentTime + stepTime)
    setCurrentTime(video.currentTime)
  }, [fps, effectiveDuration])

  // Volume & Mute
  const toggleMute = (): void => {
    const video = videoRef.current
    if (!video) return
    if (isMuted) {
      video.muted = false
      setIsMuted(false)
      video.volume = volume > 0 ? volume : 1
    } else {
      video.muted = true
      setIsMuted(true)
    }
  }

  const handleVolumeChange = (newVol: number): void => {
    const video = videoRef.current
    if (!video) return
    video.volume = newVol
    setVolume(newVol)
    if (newVol === 0) {
      video.muted = true
      setIsMuted(true)
    } else if (isMuted) {
      video.muted = false
      setIsMuted(false)
    }
  }

  // Loop
  const toggleLoop = (): void => {
    const video = videoRef.current
    if (!video) return
    video.loop = !isLooping
    setIsLooping(!isLooping)
  }

  // Playback speed
  const handleSpeedChange = (speedStr: string): void => {
    const video = videoRef.current
    if (!video) return
    const speed = parseFloat(speedStr)
    if (!isNaN(speed) && speed > 0) {
      video.playbackRate = speed
      setPlaybackSpeed(speedStr)
    }
  }

  // Fullscreen
  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current
    if (!container) return
    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (err) {
      console.warn('Fullscreen error:', err)
    }
  }, [])

  useEffect(() => {
    const handleFullscreenChange = (): void => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return (): void => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Ignore if user is typing in an input or textarea
      const target = e.target as HTMLElement | null
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return
      }

      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        handleSeek(currentTime - 5)
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        handleSeek(currentTime + 5)
      } else if (e.code === 'KeyF') {
        e.preventDefault()
        void toggleFullscreen()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [togglePlay, currentTime, toggleFullscreen, handleSeek])

  const showControls = controlsVisible || !isPlaying || isSeeking

  return (
    <TooltipProvider delayDuration={200}>
      <div
        ref={containerRef}
        className={cn(
          'group relative flex items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-black/80 shadow-md transition-all duration-200 select-none outline-none',
          isFullscreen ? 'h-screen w-screen rounded-none border-none' : 'max-h-[70vh] max-w-full',
          className
        )}
        onMouseMove={handleMouseMove}
        onMouseEnter={resetHideTimer}
        onMouseLeave={() => {
          if (isPlaying) setControlsVisible(false)
        }}
      >
        {/* Native video element */}
        <video
          ref={videoRef}
          key={`player-${src}`}
          src={src}
          playsInline
          preload="auto"
          className="max-h-[70vh] max-w-full object-contain cursor-pointer"
          onClick={togglePlay}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={() => {
            const video = videoRef.current
            if (video) {
              setCurrentTime(video.currentTime)
              updateBuffered()
            }
          }}
          onLoadedMetadata={() => {
            const video = videoRef.current
            if (video) {
              video.playbackRate = parseFloat(playbackSpeed) || 1
              setDuration(video.duration)
              updateBuffered()
            }
          }}
          onProgress={updateBuffered}
          onEnded={() => setIsPlaying(false)}
          onError={onError}
        />

        {/* Top Badges and Action buttons */}
        <div className="absolute top-3 inset-x-3 z-20 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            {videoName && (
              <span className="text-xs font-medium text-foreground/80 max-w-[200px] truncate bg-background/60 backdrop-blur-md px-2 py-0.5 rounded border border-border/30">
                {videoName}
              </span>
            )}
            {truncated && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-amber-500/20 text-amber-300 border-amber-500/40 backdrop-blur-md shadow-sm"
              >
                <Clock className="size-3 shrink-0" />
                <span>Preview truncated to first 60s</span>
              </Badge>
            )}
            {kind === 'proxy' && (
              <Badge
                variant="outline"
                className="px-2.5 py-1 text-xs font-medium bg-muted/60 text-muted-foreground backdrop-blur-md"
              >
                Proxy (H.264)
              </Badge>
            )}
          </div>

          {onOpenInSystemPlayer && (
            <div className="pointer-events-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 bg-background/60 hover:bg-background/90 text-foreground backdrop-blur-md shadow-sm rounded-lg text-xs"
                    onClick={onOpenInSystemPlayer}
                  >
                    <ExternalLink className="size-3.5" />
                    <span>Open in system player</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Play the original file in your system media player
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Center Play Button on hover or paused */}
        {!isPlaying && (
          <button
            type="button"
            className="absolute z-20 flex size-14 items-center justify-center rounded-full bg-background/80 text-foreground shadow-lg backdrop-blur-md transition-transform duration-200 hover:scale-110 active:scale-95 cursor-pointer border border-border/40"
            onClick={togglePlay}
            aria-label="Play video"
          >
            <Play className="ml-1 size-7 fill-current" />
          </button>
        )}

        {/* Bottom Controls Bar */}
        <div
          className={cn(
            'absolute bottom-0 inset-x-0 z-30 flex flex-col gap-2 p-3 bg-gradient-to-t from-background/95 via-background/75 to-transparent backdrop-blur-xs transition-opacity duration-300',
            showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Seek Bar with Buffered Progress */}
          <div className="relative flex items-center w-full group/seek py-1">
            {/* Buffered progress track */}
            <div className="absolute inset-x-0 h-2 rounded-full overflow-hidden bg-muted/30">
              <div
                className="h-full bg-muted-foreground/25 rounded-full transition-all duration-300"
                style={{ width: `${bufferedPercent}%` }}
              />
            </div>

            {/* Scrubber slider */}
            <Slider
              value={[currentTime]}
              min={0}
              max={effectiveDuration || 100}
              step={0.05}
              onValueChange={(val) => {
                setIsSeeking(true)
                handleSeek(val[0])
              }}
              onValueCommit={() => {
                setIsSeeking(false)
              }}
              className="relative z-10 cursor-pointer"
            />
          </div>

          {/* Controls toolbar */}
          <div className="flex items-center justify-between text-xs font-medium">
            {/* Left Controls: Play, Step, Volume, Time */}
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 cursor-pointer rounded-lg hover:bg-muted/60 text-foreground"
                    onClick={togglePlay}
                  >
                    {isPlaying ? (
                      <Pause className="size-4 fill-current" />
                    ) : (
                      <Play className="size-4 fill-current ml-0.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 cursor-pointer rounded-lg hover:bg-muted/60 text-foreground"
                    onClick={stepBackward}
                  >
                    <SkipBack className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Previous Frame (-1/{fps}s)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 cursor-pointer rounded-lg hover:bg-muted/60 text-foreground"
                    onClick={stepForward}
                  >
                    <SkipForward className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Next Frame (+1/{fps}s)</TooltipContent>
              </Tooltip>

              {/* Volume */}
              <div className="flex items-center gap-1 ml-1 group/vol">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 cursor-pointer rounded-lg hover:bg-muted/60 text-foreground"
                      onClick={toggleMute}
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="size-4 text-muted-foreground" />
                      ) : (
                        <Volume2 className="size-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{isMuted ? 'Unmute' : 'Mute'}</TooltipContent>
                </Tooltip>

                <div className="w-0 overflow-hidden group-hover/vol:w-16 transition-all duration-200">
                  <Slider
                    value={[isMuted ? 0 : volume]}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={(val) => handleVolumeChange(val[0])}
                    className="w-16 cursor-pointer"
                  />
                </div>
              </div>

              {/* Time display */}
              <div className="ml-2 text-xs text-muted-foreground font-mono">
                <span className="text-foreground">{formatTime(currentTime)}</span>
                <span className="mx-1">/</span>
                <span>{formatTime(effectiveDuration)}</span>
              </div>
            </div>

            {/* Right Controls: Loop, Speed, Fullscreen */}
            <div className="flex items-center gap-1.5">
              {/* Loop toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'size-8 cursor-pointer rounded-lg hover:bg-muted/60',
                      isLooping ? 'text-primary' : 'text-muted-foreground'
                    )}
                    onClick={toggleLoop}
                  >
                    <Repeat className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {isLooping ? 'Looping enabled' : 'Loop disabled'}
                </TooltipContent>
              </Tooltip>

              {/* Playback speed selector */}
              <Select value={playbackSpeed} onValueChange={handleSpeedChange}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SelectTrigger className="h-7 w-[68px] px-2 text-xs bg-muted/40 border-border/40 cursor-pointer rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top">Playback speed</TooltipContent>
                </Tooltip>
                <SelectContent side="top" className="bg-popover/95 backdrop-blur-md">
                  <SelectItem value="0.5">0.5x</SelectItem>
                  <SelectItem value="1">1.0x</SelectItem>
                  <SelectItem value="1.5">1.5x</SelectItem>
                  <SelectItem value="2">2.0x</SelectItem>
                </SelectContent>
              </Select>

              {/* Fullscreen toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 cursor-pointer rounded-lg hover:bg-muted/60 text-foreground"
                    onClick={toggleFullscreen}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="size-4" />
                    ) : (
                      <Maximize2 className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
