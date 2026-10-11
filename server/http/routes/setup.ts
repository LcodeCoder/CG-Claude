import { setupRequestSchema, setupBrowserRequestSchema } from '../../../shared/types.js'
import type { Application } from '../../application.js'
import type { RouteHandler } from '../kernel.js'

export function setupRoutes(app: Application): RouteHandler {
  const { workflows, mutate: mutation } = app
  return async ({ req, res, url, send, body }) => {
    if (req.method === 'POST' && url.pathname.match(/^\/api\/setup\/([\w-]+)\/start$/)) {
      await body(req)
      const id = url.pathname.split('/')[3]!
      const { job, created } = await app.startSetup(id)
      send(res, created ? 202 : 200, job)
      return true
    }
    if (req.method === 'POST' && url.pathname === '/api/setup/preview') {
      const request = setupRequestSchema.parse(await body(req))
      const preview = await mutation(() => workflows.preview(request))
      send(res, 200, preview)
      return true
    }

    const setupBrowser = url.pathname.match(/^\/api\/setup\/([\w-]+)\/browser$/)
    if (req.method === 'POST' && setupBrowser) {
      const request = setupBrowserRequestSchema.parse(await body(req))
      workflows.submitBrowser(setupBrowser[1]!, request.probeId, request.browser)
      send(res, 200, { accepted: true })
      return true
    }
    const setupGet = url.pathname.match(/^\/api\/setup\/([\w-]+)$/)
    if (req.method === 'GET' && setupGet) {
      const job = workflows.get(setupGet[1]!)
      if (!job) {
        send(res, 404, { error: '配置流程不存在，请重新预览' })
        return true
      }
      send(res, 200, job)
      return true
    }
    return false
  }
}
