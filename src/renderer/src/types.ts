export type ProgressData = {
  current: number
  total: number
  stage: 'extracting' | 'upscaling' | 'reassembling' | 'done'
  message?: string
  overall?: number
  batchInfo?: {
    currentVideo: number
    totalVideos: number
    videoName: string
  }
}
