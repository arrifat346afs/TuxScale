import fs from 'fs'
import path from 'path'

export const VALID_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'tif'] as const

export type ValidImageExtension = (typeof VALID_IMAGE_EXTENSIONS)[number]

const VALID_IMAGE_SET = new Set<string>(VALID_IMAGE_EXTENSIONS)

export const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff'
}

export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, '')
  return VALID_IMAGE_SET.has(ext)
}

export function getImageFiles(folderPath: string): string[] {
  if (!fs.existsSync(folderPath)) return []
  const stat = fs.statSync(folderPath)
  if (!stat.isDirectory()) return []

  const entries = fs.readdirSync(folderPath)
  return entries
    .filter((entry) => {
      const fullPath = path.join(folderPath, entry)
      try {
        const fileStat = fs.statSync(fullPath)
        return fileStat.isFile() && isImageFile(entry)
      } catch {
        return false
      }
    })
    .sort()
    .map((entry) => path.join(folderPath, entry))
}

/**
 * Resolves non-overwriting output path for an image.
 * Rule: never overwrite original or existing output.
 * Format: <name>_upscaled.<ext> or <name>_upscaled_<num>.<ext>
 */
export function resolveImageOutputPath(
  inputPath: string,
  outputPath?: string,
  outputFormat: string = 'png'
): string {
  const targetExt = `.${outputFormat.toLowerCase().replace(/^\./, '')}`
  const baseName = path.basename(inputPath, path.extname(inputPath))

  let targetDir: string
  if (outputPath && fs.existsSync(outputPath)) {
    const stat = fs.statSync(outputPath)
    targetDir = stat.isDirectory() ? outputPath : path.dirname(outputPath)
  } else if (outputPath) {
    targetDir = outputPath
  } else {
    targetDir = path.dirname(inputPath)
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true })
  } catch {
    // Ignore
  }

  // 1. Try <baseName>_upscaled.<ext>
  let candidate = path.join(targetDir, `${baseName}_upscaled${targetExt}`)
  if (!fs.existsSync(candidate) && path.resolve(candidate) !== path.resolve(inputPath)) {
    return candidate
  }

  // 2. Add numeric suffix until not existing and not colliding with input
  let counter = 1
  while (true) {
    candidate = path.join(targetDir, `${baseName}_upscaled_${counter}${targetExt}`)
    if (!fs.existsSync(candidate) && path.resolve(candidate) !== path.resolve(inputPath)) {
      return candidate
    }
    counter++
  }
}
