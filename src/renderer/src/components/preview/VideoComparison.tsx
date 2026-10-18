import React, { useEffect, useState, useRef } from 'react'
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider'
import { ExternalLink, SkipBack, SkipForward, Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Slider } from '../ui/slider'
import { Badge } from '../ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'

export interface VideoComparisonProps {
  originalPath: string
  upscaledPath: string
  duration?: number
  videoName?: string | null
  onOpenInSystemPlayer?: () => void
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

export function VideoComparison({
  originalPath,
  upscaledPath,
  duration = 0,
  onOpenInSystemPlayer
}: VideoComparisonProps): React.ReactElement {
  const [sliderTime, setSliderTime] = useState(0)
  const [debouncedTime, setDebouncedTime] = useState(0)
  const [originalFrameUrl, setOriginalFrameUrl] = useState<string | null>(null)
  const [upscaledFrameUrl, setUpscaledFrameUrl] = useState<string | null>(null)

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const effectiveDuration = duration > 0 ? duration : 60
  const currentKey = `${originalPath}:${upscaledPath}:${debouncedTime}`
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const isLoading = loadedKey !== currentKey

  // Debounce scrubbing to avoid spamming ffmpeg frame extraction
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedTime(sliderTime)
    }, 150)

    return (): void => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [sliderTime])

  // Fetch frame URLs for the debounced timestamp
  useEffect(() => {
    let cancelled = false

    Promise.all([
      window.api.getFrameUrl(originalPath, debouncedTime),
      window.api.getFrameUrl(upscaledPath, debouncedTime)
    ])
      .then(([origUrl, upscaledUrl]) => {
        if (!cancelled) {
          setOriginalFrameUrl(origUrl)
          setUpscaledFrameUrl(upscaledUrl)
          setLoadedKey(currentKey)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to get comparison frame URLs:', err)
          setLoadedKey(currentKey)
        }
      })

    return (): void => {
      cancelled = true
    }
  }, [originalPath, upscaledPath, debouncedTime, currentKey])

  const stepTime = (delta: number): void => {
    setSliderTime((prev) =>
      Math.min(effectiveDuration, Math.max(0, parseFloat((prev + delta).toFixed(2))))
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative flex flex-col items-center justify-center w-full max-h-[75vh] p-4 select-none">
        {/* Frame Comparison Slider Box */}
        <div className="relative flex items-center justify-center max-h-[60vh] max-w-full overflow-hidden rounded-xl border border-border/50 bg-black/60 shadow-md">
          {/* Top badges: Original vs Upscaled */}
          <div className="absolute top-3 inset-x-3 z-30 flex items-center justify-between pointer-events-none">
            <Badge
              variant="secondary"
              className="px-2.5 py-1 text-xs font-semibold bg-background/80 text-foreground backdrop-blur-md shadow-sm border-border/40"
            >
              Original
            </Badge>

            <div className="flex items-center gap-2">
              {isLoading && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/80 text-xs font-medium text-muted-foreground backdrop-blur-md shadow-sm">
                  <Loader2 className="size-3 animate-spin text-primary" />
                  <span>Extracting frames...</span>
                </div>
              )}
              <Badge
                variant="default"
                className="px-2.5 py-1 text-xs font-semibold bg-primary text-primary-foreground backdrop-blur-md shadow-sm"
              >
                Upscaled
              </Badge>
            </div>
          </div>

          {/* Slider */}
          {originalFrameUrl && upscaledFrameUrl ? (
            <ReactCompareSlider
              itemOne={
                <ReactCompareSliderImage
                  src={originalFrameUrl}
                  alt="Original frame"
                  className="rounded-xl object-contain select-none max-h-[60vh] max-w-full"
                  draggable={false}
                />
              }
              itemTwo={
                <ReactCompareSliderImage
                  src={upscaledFrameUrl}
                  alt="Upscaled frame"
                  className="rounded-xl object-contain select-none max-h-[60vh] max-w-full"
                  draggable={false}
                />
              }
              className="max-h-[60vh] max-w-full rounded-xl"
            />
          ) : (
            <div className="flex h-[400px] w-[600px] max-w-full items-center justify-center bg-card/60">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="size-6 animate-spin text-primary" />
                <span className="text-xs">Loading comparison frames...</span>
              </div>
            </div>
          )}
        </div>

        {/* Scrubber and Actions Toolbar */}
        <div className="mt-3 flex w-full max-w-3xl flex-col gap-2 rounded-xl border border-border/40 bg-card/80 p-3 shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 cursor-pointer rounded-lg hover:bg-muted text-foreground"
                  onClick={() => stepTime(-1)}
                >
                  <SkipBack className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Step back 1 second</TooltipContent>
            </Tooltip>

            {/* Scrubber slider */}
            <Slider
              value={[sliderTime]}
              min={0}
              max={effectiveDuration}
              step={0.1}
              onValueChange={(val) => setSliderTime(val[0])}
              className="grow cursor-pointer"
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 cursor-pointer rounded-lg hover:bg-muted text-foreground"
                  onClick={() => stepTime(1)}
                >
                  <SkipForward className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Step forward 1 second</TooltipContent>
            </Tooltip>

            {/* Time label */}
            <div className="w-24 text-right font-mono text-xs text-muted-foreground shrink-0">
              <span className="text-foreground">{formatTime(sliderTime)}</span>
              <span className="mx-1">/</span>
              <span>{formatTime(effectiveDuration)}</span>
            </div>
          </div>

          {/* Footer toolbar: Hint and System Player button */}
          <div className="flex items-center justify-between pt-1 border-t border-border/30 text-xs text-muted-foreground">
            <span>Drag the divider to compare details before and after upscaling</span>

            {onOpenInSystemPlayer && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs font-medium cursor-pointer rounded-lg"
                onClick={onOpenInSystemPlayer}
              >
                <ExternalLink className="size-3.5" />
                <span>Open in system player</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
