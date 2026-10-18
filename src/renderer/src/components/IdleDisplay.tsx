import { ArrowDownToLine, FolderOpen, MousePointer2, Video, Image as ImageIcon } from 'lucide-react'

type IdleDisplayProps = {
  videoName?: string | null
  folderPath?: string | null
  folderVideoCount?: number
  batchMode: boolean
  mode?: 'video' | 'image'
}

export function IdleDisplay({ batchMode, mode = 'video' }: IdleDisplayProps): React.ReactElement {
  const isImage = mode === 'image'

  return (
    <div className="z-10 max-w-sm text-center">
      <div className="mb-6 flex items-center justify-center">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          {batchMode ? (
            <FolderOpen className="size-10 text-muted-foreground" />
          ) : isImage ? (
            <ImageIcon className="size-10 text-muted-foreground" />
          ) : (
            <Video className="size-10 text-muted-foreground" />
          )}
        </div>
      </div>

      <h2 className="mb-2 text-2xl font-bold">
        {batchMode
          ? isImage
            ? 'Batch Image Upscale'
            : 'Batch Upscale'
          : isImage
            ? 'Image Upscale'
            : 'Video Upscale'}
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        {batchMode
          ? isImage
            ? 'Select a folder containing images to upscale them all at once.'
            : 'Select a folder containing videos to upscale them all at once.'
          : isImage
            ? 'Select an image or drag and drop it here to start upscaling.'
            : 'Select a video or drag and drop it here to start upscaling.'}
      </p>

      <div className="space-y-3 rounded-2xl border bg-card p-4 text-left shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
            1
          </div>
          <div>
            <p className="text-sm font-medium">
              {batchMode ? 'Select a folder' : isImage ? 'Select an image' : 'Select a video'}
            </p>
            <p className="text-xs text-muted-foreground">
              {batchMode
                ? isImage
                  ? 'Pick the folder that contains your images.'
                  : 'Pick the folder that contains your videos.'
                : 'Click the button or double-click this area.'}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
            2
          </div>
          <div>
            <p className="text-sm font-medium">Configure the AI model</p>
            <p className="text-xs text-muted-foreground">
              Choose a model, scale, and any extra options.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
            3
          </div>
          <div>
            <p className="text-sm font-medium">Upscale</p>
            <p className="text-xs text-muted-foreground">
              Hit the Upscale button and wait for the magic.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <MousePointer2 className="size-3" /> Double-click to select
        </span>
        <span className="flex items-center gap-1">
          <ArrowDownToLine className="size-3" /> Drag & drop supported
        </span>
      </div>
    </div>
  )
}
