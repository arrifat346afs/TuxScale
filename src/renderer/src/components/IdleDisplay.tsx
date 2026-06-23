type IdleDisplayProps = {
  videoName: string | null
  folderPath: string | null
  folderVideoCount: number
}

export function IdleDisplay({
  videoName,
  folderPath,
  folderVideoCount
}: IdleDisplayProps): React.ReactElement {
  const hasSelection = videoName || folderPath

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center space-y-2">
        {videoName && <p className="text-lg font-medium">{videoName}</p>}

        {folderPath && (
          <div className="space-y-1">
            <p className="text-lg font-medium">{folderPath}</p>
            {folderVideoCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {folderVideoCount} video{folderVideoCount === 1 ? '' : 's'} found
              </p>
            )}
          </div>
        )}

        <p className="text-lg font-medium text-muted-foreground">
          {hasSelection ? 'Ready to upscale' : 'Select a video and configure settings to begin'}
        </p>
      </div>
    </div>
  )
}
