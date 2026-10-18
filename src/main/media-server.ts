import http from 'http'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { isImageFile, IMAGE_MIME_TYPES } from './engines/shared/image-output'
import { extractFrame } from './preview/proxy'

const VIDEO_MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.ts': 'video/mp2t'
}

function getVideoMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return VIDEO_MIME_TYPES[ext] ?? 'application/octet-stream'
}

let server: http.Server | null = null
let serverPort = 0
const serverToken = crypto.randomBytes(16).toString('hex')
const allowedPaths = new Set<string>()

/**
 * Adds a file or directory path to the media server allowlist.
 */
export function allowPath(filePath: string): void {
  if (!filePath) return
  try {
    const resolved = path.resolve(filePath)
    allowedPaths.add(resolved)
  } catch {
    allowedPaths.add(filePath)
  }
}

/**
 * Adds multiple paths to the media server allowlist.
 */
export function allowPaths(filePaths: string[]): void {
  for (const fp of filePaths) {
    allowPath(fp)
  }
}

/**
 * Checks if a requested file path is in the allowlist or within an allowed directory.
 */
export function isPathAllowed(filePath: string): boolean {
  if (!filePath) return false
  const resolved = path.resolve(filePath)
  if (allowedPaths.has(resolved)) return true
  for (const allowed of allowedPaths) {
    if (resolved === allowed) return true
    if (resolved.startsWith(allowed + path.sep)) return true
  }
  return false
}

/**
 * Starts the local media HTTP server if not already running.
 */
export function startMediaServer(): Promise<{ port: number; token: string }> {
  if (server && serverPort > 0) {
    return Promise.resolve({ port: serverPort, token: serverToken })
  }

  return new Promise((resolve, reject) => {
    const s = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${serverPort}`)

        // Security check 1: Random per-launch token required for all routes
        const token = reqUrl.searchParams.get('token')
        if (token !== serverToken) {
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
          return
        }

        const rawPath = reqUrl.searchParams.get('path') ?? ''
        const filePath = path.resolve(rawPath)

        // Security check 2: Path must be allowlisted and exist on disk
        if (!rawPath || !isPathAllowed(filePath) || !fs.existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
          return
        }

        // Route: /image
        if (reqUrl.pathname === '/image') {
          if (!isImageFile(filePath)) {
            res.writeHead(404).end('Not found')
            return
          }
          const ext = path.extname(filePath).toLowerCase()
          const mimeType = IMAGE_MIME_TYPES[ext] ?? 'application/octet-stream'
          const stat = fs.statSync(filePath)
          res.writeHead(200, {
            'Content-Length': String(stat.size),
            'Content-Type': mimeType,
            'Cache-Control': 'no-cache'
          })
          const stream = fs.createReadStream(filePath)
          stream.pipe(res)
          res.on('close', () => {
            stream.destroy()
          })
          return
        }

        // Route: /frame (Extracts JPEG frame at timestamp t)
        if (reqUrl.pathname === '/frame') {
          const t = parseFloat(reqUrl.searchParams.get('t') ?? '0') || 0
          try {
            const framePath = await extractFrame(filePath, t)
            allowPath(framePath)
            const stat = fs.statSync(framePath)
            res.writeHead(200, {
              'Content-Length': String(stat.size),
              'Content-Type': 'image/jpeg',
              'Cache-Control': 'private, max-age=3600'
            })
            const stream = fs.createReadStream(framePath)
            stream.pipe(res)
            res.on('close', () => {
              stream.destroy()
            })
          } catch (err) {
            console.error('Frame extraction route error:', err)
            if (!res.headersSent) {
              res.writeHead(500).end('Failed to extract frame')
            }
          }
          return
        }

        // Route: /video
        if (reqUrl.pathname === '/video') {
          const stat = fs.statSync(filePath)
          const size = stat.size
          const mimeType = getVideoMimeType(filePath)
          const range = req.headers.range

          if (range) {
            // Support bytes=START-END, bytes=START-, and bytes=-N (suffix range)
            const match = range.replace(/bytes=/, '').trim()
            let start = 0
            let end = size - 1

            if (match.startsWith('-')) {
              // Suffix range: bytes=-N
              const suffixLength = parseInt(match.slice(1), 10)
              if (isNaN(suffixLength) || suffixLength <= 0) {
                res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end()
                return
              }
              start = Math.max(0, size - suffixLength)
              end = size - 1
            } else {
              const parts = match.split('-')
              start = parseInt(parts[0], 10)
              if (parts[1] && parts[1].length > 0) {
                end = parseInt(parts[1], 10)
              }
            }

            // Clamp end to size - 1
            end = Math.min(end, size - 1)

            // Return 416 only when start >= size or invalid range
            if (isNaN(start) || isNaN(end) || start < 0 || start >= size || start > end) {
              res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end()
              return
            }

            const chunkSize = end - start + 1
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${size}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(chunkSize),
              'Content-Type': mimeType
            })

            const stream = fs.createReadStream(filePath, { start, end })
            stream.pipe(res)
            res.on('close', () => {
              stream.destroy()
            })
          } else {
            res.writeHead(200, {
              'Accept-Ranges': 'bytes',
              'Content-Length': String(size),
              'Content-Type': mimeType
            })
            const stream = fs.createReadStream(filePath)
            stream.pipe(res)
            res.on('close', () => {
              stream.destroy()
            })
          }
          return
        }

        res.writeHead(404).end('Not found')
      } catch (error) {
        console.error('Media server error:', error)
        if (!res.headersSent) res.writeHead(500).end('Internal server error')
      }
    })

    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      serverPort = typeof addr === 'object' && addr ? addr.port : 0
      server = s
      resolve({ port: serverPort, token: serverToken })
    })

    s.on('error', reject)
  })
}

/**
 * Returns a media server URL for serving a video with token and path allowlisting.
 */
export async function getVideoUrl(videoPath: string): Promise<string> {
  const { port, token } = await startMediaServer()
  allowPath(videoPath)
  return `http://127.0.0.1:${port}/video?path=${encodeURIComponent(videoPath)}&token=${token}`
}

/**
 * Returns a media server URL for serving an image with token and path allowlisting.
 */
export async function getImageUrl(imagePath: string): Promise<string> {
  const { port, token } = await startMediaServer()
  allowPath(imagePath)
  return `http://127.0.0.1:${port}/image?path=${encodeURIComponent(imagePath)}&token=${token}`
}

/**
 * Returns a media server URL for serving a video frame at timestamp t.
 */
export async function getFrameUrl(videoPath: string, timestamp: number): Promise<string> {
  const { port, token } = await startMediaServer()
  allowPath(videoPath)
  return `http://127.0.0.1:${port}/frame?path=${encodeURIComponent(videoPath)}&t=${timestamp}&token=${token}`
}

/**
 * Stops the media server.
 */
export function stopMediaServer(): void {
  if (server) {
    server.close()
    server = null
    serverPort = 0
  }
}
