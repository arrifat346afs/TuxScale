import type { BackendId, BackendPreference, Engine, AllEnginesStatus } from './types'
import { NcnnEngine } from './ncnn'
import { PyTorchEngine } from './pytorch/runner'

const engines: Record<BackendId, Engine> = {
  ncnn: new NcnnEngine(),
  pytorch: new PyTorchEngine()
}

export function getEngine(backend: BackendId): Engine {
  const engine = engines[backend]
  if (!engine) {
    throw new Error(`Unknown backend engine: ${backend}`)
  }
  return engine
}

export async function resolveBackend(
  preference: BackendPreference = 'auto',
  customPythonPath?: string
): Promise<{ backend: BackendId; reason: string }> {
  if (preference === 'pytorch') {
    const pytorch = engines.pytorch
    const available = await pytorch.isAvailable(customPythonPath)
    if (!available) {
      throw new Error(
        'PyTorch backend is explicitly selected but not available on this system. Check Engine Status in Settings.'
      )
    }
    return { backend: 'pytorch', reason: 'PyTorch (NVIDIA CUDA) selected by user' }
  }

  if (preference === 'ncnn') {
    return { backend: 'ncnn', reason: 'NCNN (Vulkan) selected by user' }
  }

  // Auto backend resolution:
  // Try PyTorch first if NVIDIA + CUDA are available
  const pytorch = engines.pytorch
  const pytorchAvailable = await pytorch.isAvailable(customPythonPath)
  if (pytorchAvailable) {
    return {
      backend: 'pytorch',
      reason: 'Auto-detected NVIDIA GPU with PyTorch + CUDA streaming acceleration'
    }
  }

  return {
    backend: 'ncnn',
    reason: 'Auto-selected NCNN (Vulkan) as fallback / default backend'
  }
}

export async function getAllEnginesStatus(
  preference: BackendPreference = 'auto',
  customPythonPath?: string
): Promise<AllEnginesStatus> {
  const [ncnnStatus, pytorchStatus] = await Promise.all([
    engines.ncnn.getStatus(customPythonPath),
    engines.pytorch.getStatus(customPythonPath)
  ])

  let activeBackend: BackendId = 'ncnn'
  let resolvedReason = ''

  if (preference === 'pytorch') {
    activeBackend = 'pytorch'
    resolvedReason = pytorchStatus.available
      ? 'PyTorch selected'
      : 'PyTorch selected but unavailable'
  } else if (preference === 'ncnn') {
    activeBackend = 'ncnn'
    resolvedReason = 'NCNN selected'
  } else {
    // Auto
    if (pytorchStatus.available) {
      activeBackend = 'pytorch'
      resolvedReason = 'Auto: NVIDIA GPU + PyTorch with CUDA detected'
    } else {
      activeBackend = 'ncnn'
      resolvedReason = 'Auto: NCNN (Vulkan) fallback'
    }
  }

  return {
    activeBackend,
    preference,
    resolvedReason,
    engines: {
      ncnn: ncnnStatus,
      pytorch: pytorchStatus
    }
  }
}

export function stopAllEngines(): void {
  engines.ncnn.stop()
  engines.pytorch.stop()
}

export * from './types'
