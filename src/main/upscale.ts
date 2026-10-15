import { getEngine, resolveBackend } from './engines'
import type { BackendPreference } from './engines/types'
import { FORMAT_CONFIG } from './engines/shared/output'
import { stopNcnnProcesses } from './engines/ncnn/runner'
import type { ProgressData } from '../renderer/src/types'

export type { ProgressData }
export { FORMAT_CONFIG }

export type UpscaleVideoOptions = {
  videoPath: string
  outputPath?: string
  model: string
  scale: string
  backend?: BackendPreference
  customPythonPath?: string
  ttaMode?: boolean
  tileSize?: number
  batchSize?: number
  outputFormat?: string
  pytorchLowVram?: boolean
  pytorchEncoder?: 'auto' | 'nvenc' | 'cpu'
  pytorchSkipDuplicates?: boolean
  onProgress: (data: ProgressData) => void
  sendLog: (message: string) => void
}

export function stopAllProcesses(): void {
  // Stop ncnn processes
  stopNcnnProcesses()
  // Stop any running engine
  try {
    const ncnn = getEngine('ncnn')
    ncnn.stop()
  } catch {
    // Ignore
  }
  try {
    const pytorch = getEngine('pytorch')
    pytorch.stop()
  } catch {
    // Ignore
  }
}

export async function upscaleSingleVideo(options: UpscaleVideoOptions): Promise<string> {
  const backendPref = options.backend ?? 'auto'
  const { backend, reason } = await resolveBackend(backendPref, options.customPythonPath)
  options.sendLog(`Selected engine: ${backend} (${reason})`)

  const engine = getEngine(backend)
  return engine.upscale(options)
}
