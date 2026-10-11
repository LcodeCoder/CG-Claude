import { scanRequestSchema } from '../../../shared/types.js'
import type { Application } from '../../application.js'
import type { RouteHandler } from '../kernel.js'

export function diagnosticRoutes(
  app: Application,
  token: string,
  runtime: 'browser' | 'electron',
): RouteHandler {
  return async ({ req, res, url, send, body }) => {
    if (req.method === 'GET' && url.pathname === '/api/status') {
      send(res, 200, app.status())
      return true
    }
    if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
      send(res, 200, await app.bootstrap(token, runtime))
      return true
    }
    if (req.method === 'POST' && url.pathname === '/api/scans') {
      send(res, 202, await app.startScan(scanRequestSchema.parse(await body(req))))
      return true
    }
    const match = url.pathname.match(/^\/api\/scans\/([\w-]+)$/)
    if (req.method === 'GET' && match) {
      const job = app.scan(match[1]!)
      send(res, job ? 200 : 404, job || { error: '检测任务不存在，请重新检测' })
      return true
    }
    return false
  }
}
