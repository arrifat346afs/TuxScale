type BatchInfo = {
  currentVideo: number
  totalVideos: number
  videoName: string
}

type BatchProgressHeaderProps = {
  batchInfo: BatchInfo
}

export function BatchProgressHeader({ batchInfo }: BatchProgressHeaderProps): React.ReactElement {
  return (
    <div className="text-center space-y-1">
      <p className="text-sm font-medium text-violet-500">
        {batchInfo.currentVideo}/{batchInfo.totalVideos} done
      </p>
      <p className="text-xs text-muted-foreground">{batchInfo.videoName}</p>
    </div>
  )
}
