import fs from 'fs'
import path from 'path'

export const FORMAT_CONFIG: Record<
  string,
  { codec: string; pixFmt: string; ext: string; audioCodec?: string }
> = {
  mp4: { codec: 'libx264', pixFmt: 'yuv420p', ext: '.mp4' },
  webm: { codec: 'libvpx-vp9', pixFmt: 'yuva420p', ext: '.webm' },
  mkv: { codec: 'libx264', pixFmt: 'yuv420p', ext: '.mkv' },
  avi: { codec: 'mpeg4', pixFmt: 'yuv420p', ext: '.avi' },
  mov: { codec: 'libx264', pixFmt: 'yuv420p', ext: '.mov' },
  mp3: { codec: 'libmp3lame', pixFmt: '', ext: '.mp3', audioCodec: 'libmp3lame' },
  wav: { codec: 'pcm_s16le', pixFmt: '', ext: '.wav', audioCodec: 'pcm_s16le' },
  aac: { codec: 'aac', pixFmt: '', ext: '.aac', audioCodec: 'aac' },
  flac: { codec: 'flac', pixFmt: '', ext: '.flac', audioCodec: 'flac' }
}

export const AUDIO_FORMATS = new Set(['mp3', 'wav', 'aac', 'flac'])

export function resolveOutputPath(
  videoPath: string,
  outputPath?: string,
  outputFormat: string = 'mp4',
  suffix: string = '_upscaled'
): string {
  const cfg = FORMAT_CONFIG[outputFormat] ?? FORMAT_CONFIG['mp4']
  const videoName = path.basename(videoPath, path.extname(videoPath))
  const isAudio = AUDIO_FORMATS.has(outputFormat)
  const effectiveSuffix = isAudio ? '_audio' : suffix

  if (!outputPath) {
    const dir = path.dirname(videoPath)
    return path.join(dir, `${videoName}${effectiveSuffix}${cfg.ext}`)
  } else if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
    return path.join(outputPath, `${videoName}${effectiveSuffix}${cfg.ext}`)
  } else if (!outputPath.endsWith(cfg.ext)) {
    return `${outputPath}${cfg.ext}`
  }
  return outputPath
}
