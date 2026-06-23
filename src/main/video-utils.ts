import fs from 'fs'
import path from 'path'

export const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'wmv', 'flv'])

export function getVideoFiles(folderPath: string): string[] {
  const entries = fs.readdirSync(folderPath)
  return entries
    .filter((entry) => {
      const ext = path.extname(entry).slice(1).toLowerCase()
      return VIDEO_EXTENSIONS.has(ext)
    })
    .map((entry) => path.join(folderPath, entry))
}

export function getVideoFileNames(folderPath: string): string[] {
  return getVideoFiles(folderPath).map((filePath) => path.basename(filePath))
}
