import {
  manualReviewRequestSchema,
  manualReviewImportSchema,
  projectRequestSchema,
} from '../../../shared/types.js'
import { scanProject } from '../../projects.js'
import { markdownReport, redactReport, reportExportName } from '../../report.js'
import type { Application } from '../../application.js'
import type { RouteHandler } from '../kernel.js'

export function recordsRoutes(app: Application): RouteHandler {
  const { ctx, storage, snapshots, mutate: mutation } = app
  return async ({ req, res, url, send, body }) => {
    if (req.method === 'PUT' && url.pathname === '/api/manual-reviews') {
      const request = manualReviewRequestSchema.parse(await body(req))
      send(res, 200, await mutation(() => storage.saveManualReview(request)))
      return true
    }
    if (req.method === 'POST' && url.pathname === '/api/manual-reviews/import') {
      const request = manualReviewImportSchema.parse(await body(req))
      send(res, 200, await mutation(() => storage.importManualReviews(request.ids)))
      return true
    }
    if (req.method === 'POST' && url.pathname === '/api/manual-reviews/reset') {
      send(res, 200, await mutation(() => storage.resetManualReviews()))
      return true
    }

    if (req.method === 'POST' && url.pathname === '/api/snapshots') {
      await body(req)
      const snapshot = await mutation(() => snapshots.capture())
      send(res, 200, snapshot)
      return true
    }
    const snapshotPreview = url.pathname.match(/^\/api\/snapshots\/([\w-]+)\/preview$/)
    if (req.method === 'POST' && snapshotPreview) {
      await body(req)
      send(res, 200, await mutation(() => snapshots.preview(snapshotPreview[1]!)))
      return true
    }
    const snapshotRestore = url.pathname.match(/^\/api\/snapshot-plans\/([\w-]+)\/restore$/)
    if (req.method === 'POST' && snapshotRestore) {
      await body(req)
      send(res, 200, await mutation(() => snapshots.restore(snapshotRestore[1]!)))
      return true
    }
    if (req.method === 'POST' && url.pathname === '/api/projects/scan') {
      const request = projectRequestSchema.parse(await body(req))
      send(res, 200, await mutation(() => scanProject(ctx, request.path)))
      return true
    }

    const exportMatch = url.pathname.match(/^\/api\/reports\/([\w-]+)\/export$/)
    if (req.method === 'GET' && exportMatch) {
      const original = (await storage.reports()).find((report) => report.id === exportMatch[1])
      if (!original) {
        send(res, 404, { error: '检测报告不存在' })
        return true
      }
      const report = url.searchParams.get('redact') === '0' ? original : redactReport(original)
      const markdown = url.searchParams.get('format') === 'markdown'
      res.writeHead(200, {
        'Content-Type': markdown
          ? 'text/markdown; charset=utf-8'
          : 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${reportExportName(report, markdown ? 'md' : 'json')}"`,
        'Cache-Control': 'no-store',
      })
      res.end(markdown ? markdownReport(report) : JSON.stringify(report, null, 2))
      return true
    }
    return false
  }
}
