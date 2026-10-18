import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { clearPyTorchDetectionCache } from './detect'

let activeInstallProcess: ChildProcess | null = null

export function getTargetVenvDir(): string {
  return path.join(os.homedir(), '.config', 'tuxscale', 'pytorch-env')
}

export function getTargetModelsDir(): string {
  return path.join(os.homedir(), '.config', 'tuxscale', 'models')
}

export function getSetupScriptPath(): string {
  const candidatePaths: string[] = []

  if (app.isPackaged) {
    candidatePaths.push(path.join(process.resourcesPath, 'python', 'setup-cuda-env.sh'))
  }

  candidatePaths.push(path.join(process.cwd(), 'resources', 'python', 'setup-cuda-env.sh'))
  candidatePaths.push(path.join(process.cwd(), 'scripts', 'setup-cuda-env.sh'))

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error('PyTorch CUDA setup script (setup-cuda-env.sh) not found.')
}

export function isPyTorchInstalling(): boolean {
  return activeInstallProcess !== null
}

export function cancelPyTorchInstall(): void {
  if (activeInstallProcess) {
    try {
      activeInstallProcess.kill('SIGTERM')
    } catch {
      // Ignore
    }
    activeInstallProcess = null
  }
}

export function installPyTorchEnv(
  onProgress: (data: { percent: number; message: string; log?: string }) => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (activeInstallProcess) {
      resolve({ success: false, error: 'Installation is already in progress.' })
      return
    }

    let scriptPath: string
    try {
      scriptPath = getSetupScriptPath()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      resolve({ success: false, error: msg })
      return
    }

    const targetDir = getTargetVenvDir()
    const modelsDir = getTargetModelsDir()

    onProgress({
      percent: 2,
      message: 'Starting PyTorch CUDA installer...',
      log: `Target directory: ${targetDir}`
    })

    const child = spawn('bash', [scriptPath, targetDir, modelsDir], {
      env: {
        ...process.env,
        PATH: `/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`
      }
    })

    activeInstallProcess = child
    let lastPercent = 5
    let lastMessage = 'Setting up directories...'

    const handleLine = (line: string): void => {
      const trimmed = line.trim()
      if (!trimmed) return

      if (trimmed.startsWith('PROGRESS:')) {
        const parts = trimmed.split(':')
        const pVal = parseInt(parts[1], 10)
        if (!isNaN(pVal)) {
          lastPercent = pVal
          lastMessage = parts.slice(2).join(':')
          onProgress({ percent: lastPercent, message: lastMessage, log: trimmed })
          return
        }
      }

      onProgress({ percent: lastPercent, message: lastMessage, log: trimmed })
    }

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      for (const line of text.split('\n')) {
        handleLine(line)
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      for (const line of text.split('\n')) {
        handleLine(line)
      }
    })

    child.on('error', (err) => {
      activeInstallProcess = null
      resolve({ success: false, error: `Failed to execute setup script: ${err.message}` })
    })

    child.on('close', (code, signal) => {
      activeInstallProcess = null
      if (signal === 'SIGTERM' || signal === 'SIGINT') {
        resolve({ success: false, error: 'Installation was cancelled by user.' })
      } else if (code === 0) {
        clearPyTorchDetectionCache()
        onProgress({
          percent: 100,
          message: 'PyTorch CUDA setup complete!',
          log: 'Setup finished successfully.'
        })
        resolve({ success: true })
      } else {
        resolve({
          success: false,
          error: `Setup script failed with exit code ${code}. Check the installation log.`
        })
      }
    })
  })
}
