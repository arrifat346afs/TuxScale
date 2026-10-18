import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import os from 'os'

function getTempDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron')
    if (electron && typeof electron === 'object' && electron.app?.getPath) {
      return electron.app.getPath('temp')
    }
  } catch {
    // Fall back to os.tmpdir() when not running in Electron
  }
  return os.tmpdir()
}

let cacheDirInitialized = false

/**
 * Returns the directory path for preview proxies and extracted frames.
 */
export function getCacheDir(): string {
  const cacheDir = path.join(getTempDir(), 'tuxscale-preview-cache')
  if (!cacheDirInitialized) {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }
    cacheDirInitialized = true
  }
  return cacheDir
}

/**
 * Computes a hash key based on video path, file size, and modification time.
 */
export function getCacheKey(filePath: string): string {
  try {
    const stat = fs.statSync(filePath)
    return crypto
      .createHash('sha256')
      .update(`${path.resolve(filePath)}_${stat.size}_${stat.mtimeMs}`)
      .digest('hex')
      .slice(0, 16)
  } catch {
    return crypto.createHash('sha256').update(path.resolve(filePath)).digest('hex').slice(0, 16)
  }
}

/**
 * Returns the destination file path for a video's H.264 proxy.
 */
export function getProxyPath(filePath: string): string {
  const key = getCacheKey(filePath)
  return path.join(getCacheDir(), `proxy_${key}.mp4`)
}

/**
 * Checks whether a valid proxy already exists in the cache.
 */
export function hasCachedProxy(filePath: string): boolean {
  try {
    const proxyPath = getProxyPath(filePath)
    if (!fs.existsSync(proxyPath)) return false
    const stat = fs.statSync(proxyPath)
    return stat.size > 0
  } catch {
    return false
  }
}

/**
 * Returns the destination file path for an extracted frame at timestamp t.
 */
export function getFrameCachePath(filePath: string, timestamp: number): string {
  const key = getCacheKey(filePath)
  // Quantize timestamp to 2 decimal places to ensure consistent cache keys
  const tKey = Math.round(timestamp * 100)
  return path.join(getCacheDir(), `frame_${key}_${tKey}.jpg`)
}

/**
 * Checks whether an extracted frame exists in the cache.
 */
export function hasCachedFrame(filePath: string, timestamp: number): boolean {
  try {
    const framePath = getFrameCachePath(filePath, timestamp)
    if (!fs.existsSync(framePath)) return false
    const stat = fs.statSync(framePath)
    return stat.size > 0
  } catch {
    return false
  }
}

/**
 * Deletes all cached proxies and frames.
 */
export function cleanupCache(): void {
  try {
    const cacheDir = path.join(getTempDir(), 'tuxscale-preview-cache')
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true })
    }
  } catch {
    // Ignore error during shutdown
  }
}

// Ensure cache is deleted when app quits
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electron = require('electron')
  if (electron && typeof electron === 'object' && electron.app?.on) {
    electron.app.on('will-quit', cleanupCache)
  }
} catch {
  // If called in an environment where app events are not yet bound
}
process.on('exit', cleanupCache)
