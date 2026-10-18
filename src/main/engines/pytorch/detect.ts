import { execFile } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import type { StatusCheckItem } from '../types'

export type PyTorchDetection = {
  available: boolean
  gpuName?: string
  pythonInfo: {
    command: string
    version?: string
    source: 'custom' | 'auto-venv' | 'system' | 'bundled'
  }
  details: {
    nvidia: StatusCheckItem
    python: StatusCheckItem
    torch: StatusCheckItem
    cuda: StatusCheckItem
    realesrgan: StatusCheckItem
    spandrel: StatusCheckItem
    script: StatusCheckItem
  }
}

export function getScriptPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'python', 'tuxscale_upscale.py')
    : path.join(process.cwd(), 'resources', 'python', 'tuxscale_upscale.py')
}

export function getImageScriptPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'python', 'tuxscale_upscale_images.py')
    : path.join(process.cwd(), 'resources', 'python', 'tuxscale_upscale_images.py')
}

export function findBundledPython(): string | null {
  const isWin = process.platform === 'win32'
  const pyNames = isWin ? ['python.exe'] : ['python3', 'python']
  const candidates: string[] = []

  // 1. In packaged app, resourcesPath contains python-env
  if (app.isPackaged) {
    for (const name of pyNames) {
      candidates.push(
        path.join(process.resourcesPath, 'python-env', isWin ? 'Scripts' : 'bin', name)
      )
      candidates.push(path.join(process.resourcesPath, 'python-env', name))
    }
  }

  // 2. In Flatpak, check /app/tuxscale/resources/python-env
  for (const name of pyNames) {
    candidates.push(
      path.join('/app', 'tuxscale', 'resources', 'python-env', isWin ? 'Scripts' : 'bin', name)
    )
  }

  // 3. In dev / project directory
  for (const name of pyNames) {
    candidates.push(
      path.join(process.cwd(), 'resources', 'python-env', isWin ? 'Scripts' : 'bin', name)
    )
    candidates.push(path.join(process.cwd(), 'resources', 'python-env', name))
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    } catch {
      // Ignore
    }
  }

  return null
}

export function findAutoVenvPython(): string | null {
  const isWin = process.platform === 'win32'
  const pyNames = isWin ? ['Scripts/python.exe'] : ['bin/python3', 'bin/python']

  const candidateDirs: string[] = []

  // 1. Electron userData directory (e.g. ~/.config/tuxscale/pytorch-env)
  try {
    candidateDirs.push(path.join(app.getPath('userData'), 'pytorch-env'))
  } catch {
    // app.getPath might fail if called before app is ready
  }

  // 2. Standard ~/.config/tuxscale/pytorch-env
  candidateDirs.push(path.join(os.homedir(), '.config', 'tuxscale', 'pytorch-env'))

  // 3. System venv at ~/.venvs/tuxscale
  candidateDirs.push(path.join(os.homedir(), '.venvs', 'tuxscale'))

  for (const dir of candidateDirs) {
    for (const rel of pyNames) {
      const candidate = path.join(dir, rel)
      try {
        if (fs.existsSync(candidate)) {
          return candidate
        }
      } catch {
        // Ignore
      }
    }
  }

  return null
}

export function resolvePythonCommand(customPath?: string): {
  command: string
  source: 'custom' | 'bundled' | 'auto-venv' | 'system'
} {
  // A user-set custom Python path in Settings always wins
  if (customPath && customPath.trim().length > 0) {
    return { command: customPath.trim(), source: 'custom' }
  }
  if (process.env.TUXSCALE_PYTHON_PATH && process.env.TUXSCALE_PYTHON_PATH.trim().length > 0) {
    return { command: process.env.TUXSCALE_PYTHON_PATH.trim(), source: 'custom' }
  }

  // 1. Prioritize bundled standalone Python runtime
  const bundled = findBundledPython()
  if (bundled) {
    return { command: bundled, source: 'bundled' }
  }

  // 2. Auto-detect a venv before falling back to system python3
  const autoVenv = findAutoVenvPython()
  if (autoVenv) {
    return { command: autoVenv, source: 'auto-venv' }
  }

  return { command: 'python3', source: 'system' }
}

function runCmd(cmd: string, args: string[], timeout = 6000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout.trim())
    })
  })
}

let cachedDetection: { result: PyTorchDetection; timestamp: number; key: string } | null = null

export function clearPyTorchDetectionCache(): void {
  cachedDetection = null
}

export async function detectPyTorch(
  customPythonPath?: string,
  force = false
): Promise<PyTorchDetection> {
  const cacheKey = customPythonPath || '__auto__'
  const now = Date.now()
  if (
    !force &&
    cachedDetection &&
    cachedDetection.key === cacheKey &&
    now - cachedDetection.timestamp < 10000
  ) {
    return cachedDetection.result
  }

  const pythonResolution = resolvePythonCommand(customPythonPath)
  const pythonCmd = pythonResolution.command

  const details: PyTorchDetection['details'] = {
    nvidia: { ok: false, message: 'Checking NVIDIA GPU...' },
    python: { ok: false, message: 'Checking Python...' },
    torch: { ok: false, message: 'Checking PyTorch...' },
    cuda: { ok: false, message: 'Checking CUDA...' },
    realesrgan: { ok: false, message: 'Checking Real-ESRGAN and basicsr...' },
    spandrel: { ok: false, message: 'Checking spandrel...' },
    script: { ok: false, message: 'Checking worker script...' }
  }

  let gpuName: string | undefined
  let detectedVersion: string | undefined

  // 1. Check Script Path synchronously
  const scriptPath = getScriptPath()
  const imageScriptPath = getImageScriptPath()
  if (fs.existsSync(scriptPath) && fs.existsSync(imageScriptPath)) {
    details.script = {
      ok: true,
      message: 'Worker scripts located'
    }
  } else {
    const missing = !fs.existsSync(scriptPath) ? scriptPath : imageScriptPath
    details.script = {
      ok: false,
      message: `Worker script not found at ${missing}`,
      fixHint: 'Verify the application installation integrity.'
    }
  }

  const unifiedScript = `
import sys

py_ver = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"

# Test guarded shim for torchvision functional_tensor
try:
    import torchvision.transforms.functional_tensor
except ImportError:
    try:
        import types
        import torchvision.transforms
        import torchvision.transforms.functional as _F
        _mod = types.ModuleType('torchvision.transforms.functional_tensor')
        for _attr in dir(_F):
            if not _attr.startswith('__'):
                setattr(_mod, _attr, getattr(_F, _attr))
        sys.modules['torchvision.transforms.functional_tensor'] = _mod
        setattr(torchvision.transforms, 'functional_tensor', _mod)
    except Exception:
        pass

torch_ver = "none"
cuda_avail = False
cuda_ver = "none"
torch_err = ""
try:
    import torch
    torch_ver = torch.__version__
    cuda_avail = torch.cuda.is_available()
    cuda_ver = torch.version.cuda if cuda_avail else "none"
except Exception as e:
    torch_err = str(e)

realesrgan_ok = False
realesrgan_err = ""
try:
    import basicsr
    import realesrgan
    from realesrgan.archs.srvgg_arch import SRVGGNetCompact
    realesrgan_ok = True
except Exception as e:
    realesrgan_err = str(e)

spandrel_ok = False
spandrel_err = ""
try:
    import spandrel
    from spandrel import ModelLoader
    spandrel_ok = True
except Exception as e:
    spandrel_err = str(e)

print(f"{py_ver}:::{torch_ver}:::{cuda_avail}:::{cuda_ver}:::{realesrgan_ok}:::{spandrel_ok}:::{torch_err}:::{realesrgan_err}:::{spandrel_err}")
`

  // Execute NVIDIA GPU check and Python probe concurrently
  const checkNvidia = async (): Promise<void> => {
    try {
      const nvOut = await runCmd('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], 3000)
      if (nvOut) {
        gpuName = nvOut.split('\n')[0].trim()
        details.nvidia = {
          ok: true,
          message: `NVIDIA GPU: ${gpuName}`
        }
      } else {
        details.nvidia = {
          ok: false,
          message: 'No NVIDIA GPU detected via nvidia-smi',
          fixHint: 'Verify NVIDIA GPU connection and proprietary drivers are installed.'
        }
      }
    } catch {
      details.nvidia = {
        ok: false,
        message: 'nvidia-smi not found or no NVIDIA driver installed',
        fixHint: 'Install NVIDIA GPU proprietary display drivers.'
      }
    }
  }

  const checkPython = async (): Promise<void> => {
    try {
      const pyCheck = await runCmd(pythonCmd, ['-c', unifiedScript], 8000)
      const parts = pyCheck.split(':::')
      if (parts.length < 9) {
        throw new Error(`Invalid output from Python environment check: ${pyCheck}`)
      }

      const [
        pyVer,
        torchVer,
        cudaAvail,
        cudaVer,
        realesrganOk,
        spandrelOk,
        torchErr,
        realesrganErr,
        spandrelErr
      ] = parts

      detectedVersion = pyVer
      const vParts = pyVer.split('.').map((p) => parseInt(p, 10))
      const major = vParts[0] || 3
      const minor = vParts[1] || 0

      const sourceTag =
        pythonResolution.source === 'bundled'
          ? ' (bundled)'
          : pythonResolution.source === 'auto-venv'
            ? ' (auto-detected venv)'
            : pythonResolution.source === 'custom'
              ? ' (custom)'
              : ''

      details.python = {
        ok: true,
        message: `Python ${pyVer}${sourceTag} at ${pythonCmd}`
      }

      if (major === 3 && minor > 12) {
        details.python.warning = true
        details.python.warningMessage = `Python ${major}.${minor} may not be supported by PyTorch / Real-ESRGAN packages. Use a Python 3.11 or 3.12 virtualenv.`
      }

      if (torchVer === 'none' || torchErr) {
        details.torch = {
          ok: false,
          message: 'PyTorch is not installed in this environment',
          details: torchErr || undefined,
          fixHint:
            'pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124'
        }
        details.cuda = {
          ok: false,
          message: 'PyTorch required to check CUDA availability'
        }
      } else {
        details.torch = {
          ok: true,
          message: `PyTorch ${torchVer}`
        }

        if (cudaAvail === 'True') {
          details.cuda = {
            ok: true,
            message: `CUDA ${cudaVer} available`
          }
        } else {
          details.cuda = {
            ok: false,
            message: 'CUDA is not available in PyTorch (CPU-only build)',
            fixHint:
              'Reinstall PyTorch with CUDA support: pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124'
          }
        }
      }

      if (realesrganOk === 'True') {
        details.realesrgan = {
          ok: true,
          message: 'Real-ESRGAN and basicsr packages ready'
        }
      } else {
        details.realesrgan = {
          ok: false,
          message: 'Real-ESRGAN or basicsr is not installed or failed to import',
          details: realesrganErr || undefined,
          fixHint: 'pip install basicsr realesrgan'
        }
      }

      if (spandrelOk === 'True') {
        details.spandrel = {
          ok: true,
          message: 'spandrel model loader package ready'
        }
      } else {
        details.spandrel = {
          ok: false,
          message: 'spandrel is not installed or failed to import',
          details: spandrelErr || undefined,
          fixHint: 'pip install spandrel'
        }
      }
    } catch {
      details.python = {
        ok: false,
        message: `Python not executable at "${pythonCmd}". Set a valid virtualenv path in Settings.`,
        fixHint: 'Create a Python 3.11 or 3.12 virtualenv or specify custom path.'
      }
      details.torch = {
        ok: false,
        message: 'Python not found',
        fixHint: 'Configure a valid Python environment first.'
      }
      details.cuda = { ok: false, message: 'Python not found' }
      details.realesrgan = { ok: false, message: 'Python not found' }
      details.spandrel = { ok: false, message: 'Python not found' }
    }
  }

  await Promise.all([checkNvidia(), checkPython()])

  const isAvailable =
    details.nvidia.ok &&
    details.python.ok &&
    details.torch.ok &&
    details.cuda.ok &&
    details.realesrgan.ok &&
    details.spandrel.ok &&
    details.script.ok

  const result: PyTorchDetection = {
    available: isAvailable,
    gpuName,
    pythonInfo: {
      command: pythonCmd,
      version: detectedVersion,
      source: pythonResolution.source
    },
    details
  }

  cachedDetection = {
    result,
    timestamp: Date.now(),
    key: cacheKey
  }

  return result
}
