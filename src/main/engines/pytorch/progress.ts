import type { ProgressData } from '../../../renderer/src/types'

export function parseProgressLine(line: string): ProgressData | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('PROGRESS')) {
    return null
  }

  const parts = trimmed.split(/\s+/)
  if (parts.length >= 3) {
    const current = parseInt(parts[1], 10)
    const total = parseInt(parts[2], 10)

    if (!isNaN(current) && !isNaN(total)) {
      const overall = total > 0 ? Math.min(1.0, current / total) : 0
      const isDone = current >= total && total > 0
      return {
        current,
        total,
        stage: isDone ? 'done' : 'upscaling',
        message: isDone ? 'Upscaling complete!' : `Upscaling frame ${current}/${total}`,
        overall
      }
    }
  }

  return null
}
