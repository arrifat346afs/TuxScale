import { execFile } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import type { StatusCheckItem } from '../types'

export type PyTorchDetection = {
  available: boolean
  gpuName?: string
  details: {
    nvidia: StatusCheckItem
    python: StatusCheckItem
    torch: StatusCheckItem
    cuda: StatusCheckItem
    realesrgan: StatusCheckItem
    script: StatusCheckItem
  }
}

export function getScriptPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'python', 'tuxscale_upscale.py')
    : path.join(process.cwd(), 'resources', 'python', 'tuxscale_upscale.py')
}

export function resolvePythonCommand(customPath?: string): string {
  if (customPath && customPath.trim().length > 0) {
    return customPath.trim()
  }
  return process.env.TUXSCALE_PYTHON_PATH || 'python3'
}

function runCmd(cmd: string, args: string[], timeout = 6000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout.trim())
    })
  })
}

export async function detectPyTorch(customPythonPath?: string): Promise<PyTorchDetection> {
  const details: PyTorchDetection['details'] = {
    nvidia: { ok: false, message: 'Checking NVIDIA GPU...' },
    python: { ok: false, message: 'Checking Python...' },
    torch: { ok: false, message: 'Checking PyTorch...' },
    cuda: { ok: false, message: 'Checking CUDA...' },
    realesrgan: { ok: false, message: 'Checking Real-ESRGAN package...' },
    script: { ok: false, message: 'Checking worker script...' }
  }

  let gpuName: string | undefined

  // 1. Check NVIDIA GPU
  try {
    const nvOut = await runCmd('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'])
    if (nvOut) {
      gpuName = nvOut.split('\n')[0].trim()
      details.nvidia = {
        ok: true,
        message: `NVIDIA GPU: ${gpuName}`
      }
    } else {
      details.nvidia = {
        ok: false,
        message: 'No NVIDIA GPU detected via nvidia-smi'
      }
    }
  } catch {
    details.nvidia = {
      ok: false,
      message: 'nvidia-smi not found or no NVIDIA driver installed'
    }
  }

  // 2. Check Script Path
  const scriptPath = getScriptPath()
  if (fs.existsSync(scriptPath)) {
    details.script = {
      ok: true,
      message: 'Streaming worker script located'
    }
  } else {
    details.script = {
      ok: false,
      message: `Worker script not found at ${scriptPath}`
    }
  }

  // 3. Check Python
  const pythonCmd = resolvePythonCommand(customPythonPath)
  try {
    const pyVer = await runCmd(pythonCmd, ['--version'])
    details.python = {
      ok: true,
      message: `${pyVer || 'Python'} (${pythonCmd})`
    }
  } catch {
    details.python = {
      ok: false,
      message: `Python not executable at "${pythonCmd}". Set custom path in Settings.`
    }
    details.torch = { ok: false, message: 'Python not found' }
    details.cuda = { ok: false, message: 'Python not found' }
    details.realesrgan = { ok: false, message: 'Python not found' }

    return {
      available: false,
      gpuName,
      details
    }
  }

  // 4. Check PyTorch & CUDA & RealESRGAN
  try {
    const checkScript = `
import sys
try:
    import torch
    torch_ver = torch.__version__
    cuda_avail = torch.cuda.is_available()
    cuda_ver = torch.version.cuda if cuda_avail else "none"
except Exception as e:
    torch_ver = "err:" + str(e)
    cuda_avail = False
    cuda_ver = "none"

try:
    import realesrgan
    realesrgan_ok = True
except Exception as e:
    realesrgan_ok = False

print(f"{torch_ver}:::{cuda_avail}:::{cuda_ver}:::{realesrgan_ok}")
`
    const pyCheck = await runCmd(pythonCmd, ['-c', checkScript], 10000)
    const [torchVer, cudaAvail, cudaVer, realesrganOk] = pyCheck.split(':::')

    if (torchVer.startsWith('err:')) {
      details.torch = {
        ok: false,
        message: 'PyTorch not installed. Run: pip install torch torchvision'
      }
      details.cuda = {
        ok: false,
        message: 'PyTorch required to check CUDA'
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
          message: 'CUDA is not available in PyTorch. Install PyTorch with CUDA support.'
        }
      }
    }

    if (realesrganOk === 'True') {
      details.realesrgan = {
        ok: true,
        message: 'Real-ESRGAN installed'
      }
    } else {
      details.realesrgan = {
        ok: false,
        message: 'Real-ESRGAN not installed. Run: pip install basicsr realesrgan'
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    details.torch = { ok: false, message: `Failed to inspect PyTorch: ${msg}` }
    details.cuda = { ok: false, message: 'Failed to inspect CUDA' }
    details.realesrgan = { ok: false, message: 'Failed to inspect Real-ESRGAN' }
  }

  const isAvailable =
    details.nvidia.ok &&
    details.python.ok &&
    details.torch.ok &&
    details.cuda.ok &&
    details.realesrgan.ok &&
    details.script.ok

  return {
    available: isAvailable,
    gpuName,
    details
  }
}
