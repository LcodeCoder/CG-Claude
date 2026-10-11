import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { ServiceOperationError } from '../operations.js'

export interface RouteContext {
  req: IncomingMessage
  res: ServerResponse
  url: URL
  send: typeof sendJson
  body: typeof readJson
}
export type RouteHandler = (context: RouteContext) => Promise<boolean>
interface HttpOptions {
  port: () => number
  dev: boolean
  token: string
  distDir: string
  closing: () => boolean
  routes: RouteHandler[]
}
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}
function sendJson(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(value))
}
async function readJson(req: IncomingMessage): Promise<unknown> {
  if (req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json')
    throw new HttpError(415, '请求需要 JSON 内容类型')
  let length = 0
  const chunks: Buffer[] = []
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    length += chunk.length
    if (length > 64 * 1024) {
      // Keep the socket alive long enough to return a useful 413 response.
      req.resume()
      throw new HttpError(413, '请求内容超过 64 KB')
    }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    throw new HttpError(400, '请求不是有效 JSON')
  }
}
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.json': 'application/json',
}
async function staticFile({ req, res, url, send }: RouteContext, options: HttpOptions) {
  if (!['GET', 'HEAD'].includes(req.method || '')) {
    send(res, 405, { error: '此请求方式不受支持' })
    return
  }
  let requested: string
  try {
    requested = decodeURIComponent(url.pathname)
  } catch {
    throw new HttpError(400, '路径无效')
  }
  const filename = path.resolve(options.distDir, '.' + requested)
  if (filename !== options.distDir && !filename.startsWith(options.distDir + path.sep))
    throw new HttpError(403, '路径不可访问')
  const file =
    requested === '/' || !path.extname(requested)
      ? path.join(options.distDir, 'index.html')
      : filename
  let bytes: Buffer
  try {
    bytes = await fs.readFile(file)
  } catch {
    throw new HttpError(404, '界面尚未构建，请先运行 npm run build，开发时访问 5173 端口')
  }
  if (!options.dev)
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; connect-src 'self' https://api.ipify.org; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    )
  res.writeHead(200, {
    'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
    'Content-Length': bytes.byteLength,
    'Cache-Control': file.startsWith(path.join(options.distDir, 'assets') + path.sep)
      ? 'public, max-age=86400'
      : 'no-cache',
  })
  res.end(req.method === 'HEAD' ? undefined : bytes)
}

/** The single HTTP boundary: local-origin checks, authentication, JSON limits and errors. */
export function createLocalHttpServer(options: HttpOptions) {
  return createServer({ headersTimeout: 10_000, requestTimeout: 15_000 }, async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Frame-Options', 'DENY')
    try {
      if (options.closing() && req.method !== 'GET')
        throw new HttpError(503, '本机服务正在退出，等待当前流程完成')
      const hosts = [
        `127.0.0.1:${options.port()}`,
        `localhost:${options.port()}`,
        ...(options.dev ? ['127.0.0.1:5173', 'localhost:5173'] : []),
      ]
      const host = req.headers.host
      const origin = req.headers.origin
      if (
        !host ||
        !hosts.includes(host) ||
        (origin && !hosts.some((entry) => origin === 'http://' + entry)) ||
        (req.headers['sec-fetch-site'] === 'cross-site' && !origin)
      )
        throw new HttpError(403, '只允许本机工具界面访问')
      let url: URL
      try {
        url = new URL(req.url || '/', `http://${host}`)
      } catch {
        throw new HttpError(400, '请求地址无效')
      }
      if (url.pathname.startsWith('/api/') && req.method !== 'GET') {
        const candidate = String(req.headers['x-cg-token'] || '')
        if (
          !/^[a-f\d]{64}$/.test(candidate) ||
          !timingSafeEqual(Buffer.from(candidate), Buffer.from(options.token))
        )
          throw new HttpError(403, '本机操作凭证无效，请刷新界面')
      }
      const context = { req, res, url, send: sendJson, body: readJson }
      for (const route of options.routes) if (await route(context)) return
      if (url.pathname.startsWith('/api/')) throw new HttpError(404, '接口不存在')
      await staticFile(context, options)
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? '请求参数不符合要求'
          : error instanceof Error
            ? error.message
            : '操作未完成'
      const status =
        error instanceof HttpError || error instanceof ServiceOperationError ? error.status : 400
      if (status === 413) res.setHeader('Connection', 'close')
      if (!res.headersSent) sendJson(res, status, { error: message })
      else res.end()
    }
  })
}
