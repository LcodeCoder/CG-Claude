import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import {
  preferencesSchema,
  repairRequestSchema,
  scanRequestSchema,
  setupRequestSchema,
  setupBrowserRequestSchema,
  projectRequestSchema,
  manualReviewRequestSchema,
  manualReviewImportSchema,
} from '../shared/types.js'
import type { ScanJob, ServiceStatus } from '../shared/service-status.js'
import { createContext, machineInfo } from './context.js'
import type { Context } from './context.js'
import { describeConfigs } from './configs.js'
import { claudeConfigurationScopeReason } from './configuration-scope.js'
import { readAllConfigs, configurationFingerprint } from './safety.js'
import { Storage } from './storage.js'
import { RepairEngine } from './repairs.js'
import { runRepeatedDiagnostics, TOTAL_CHECKS } from './diagnostics.js'
import { markdownReport, redactReport, reportExportName } from './report.js'
import { SetupWorkflows } from './workflows.js'
import { acquireServiceLock } from './lock.js'
import { SnapshotEngine } from './snapshots.js'
import { scanProject } from './projects.js'
import { TranslationService } from './translation.js'
import { translationRequestSchema } from '../shared/translation.js'

import { connectionRequestSchema } from '../shared/connections.js'
import { CONNECTION_FILE, describeConnectionConfiguration } from './connections.js'

export interface ServerOptions {
  ctx?: Context
  port?: number
  dev?: boolean
  distDir?: string
  runtime?: 'browser' | 'electron'
}
export async function createAppServer(options: ServerOptions = {}) {
  const ctx = options.ctx ?? createContext()
  const port = options.port ?? Number(process.env.CG_PORT || 4318)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('CG_PORT 必须是有效端口')
  const storage = new Storage(ctx)
  await storage.init()
  const releaseLock = await acquireServiceLock(ctx)
  const repairs = new RepairEngine(ctx, storage)
  const snapshots = new SnapshotEngine(ctx, storage)
  const translation = new TranslationService(storage)
  const workflows = new SetupWorkflows(ctx, storage, repairs, snapshots)
  try {
    await workflows.init()
  } catch (error) {
    await releaseLock()
    throw error
  }
  let setupDone: Promise<void> = Promise.resolve()
  let scanDone: Promise<void> = Promise.resolve()
  let mutationDone: Promise<void> = Promise.resolve()
  const token = randomBytes(32).toString('hex')
  const jobs = new Map<string, ScanJob>()
  let busy = false
  let scanActive = false
  let closing = false
  let closeDone: Promise<void> | undefined
  const dev = options.dev ?? process.env.CG_DEV === '1'
  const root = path.dirname(fileURLToPath(import.meta.url))
  const distDir =
    options.distDir ?? path.resolve(root, root.includes('dist-server') ? '../../dist' : '../dist')
  let actualPort = port
  const allowedOrigins = () =>
    new Set([
      `http://127.0.0.1:${actualPort}`,
      `http://localhost:${actualPort}`,
      ...(dev ? ['http://127.0.0.1:5173', 'http://localhost:5173'] : []),
    ])
  function send(res: ServerResponse, status: number, value: unknown) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(value))
  }
  async function body(req: IncomingMessage): Promise<unknown> {
    if (!req.headers['content-type']?.startsWith('application/json'))
      throw new Error('请求需要 JSON 内容类型')
    let length = 0
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      length += chunk.length
      if (length > 64 * 1024) throw new Error('请求内容超过 64 KB')
      chunks.push(chunk)
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    } catch {
      throw new Error('请求不是有效 JSON')
    }
  }
  async function mutation<T>(operation: () => Promise<T>): Promise<T> {
    if (closing) throw new Error('本机服务正在退出，请等待当前操作完成')
    if (busy || scanActive) throw new Error('当前有检测或修改正在进行，请完成后再操作')
    busy = true
    const pending = Promise.resolve().then(operation)
    mutationDone = pending.then(
      () => {},
      () => {},
    )
    try {
      return await pending
    } finally {
      busy = false
    }
  }
  function serviceStatus(): ServiceStatus {
    const scan = scanActive ? [...jobs.values()].find((job) => job.status === 'running') : undefined
    const setup = workflows.list().find((job) => job.status === 'running')
    return {
      closing,
      ...(scanActive
        ? {
            activity: {
              kind: 'scan' as const,
              label: scan?.current || '正在准备检测',
              id: scan?.id,
            },
            scan,
          }
        : busy
          ? {
              activity: setup
                ? {
                    kind: 'setup' as const,
                    label:
                      setup.nodes.find(
                        (node) => node.status === 'running' || node.status === 'retrying',
                      )?.title || '正在配置',
                    id: setup.id,
                  }
                : { kind: 'mutation' as const, label: '正在处理本机操作' },
            }
          : {}),
    }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Frame-Options', 'DENY')
    if (closing && req.method !== 'GET') {
      send(res, 503, { error: '本机服务正在退出，等待当前流程完成' })
      return
    }
    const host = req.headers.host
    const origin = req.headers.origin
    const allowedHosts = new Set([
      `127.0.0.1:${actualPort}`,
      `localhost:${actualPort}`,
      ...(dev ? ['127.0.0.1:5173', 'localhost:5173'] : []),
    ])
    if (
      !host ||
      !allowedHosts.has(host) ||
      (origin && !allowedOrigins().has(origin)) ||
      (req.headers['sec-fetch-site'] === 'cross-site' && !origin)
    ) {
      send(res, 403, { error: '只允许本机工具界面访问' })
      return
    }
    let url: URL
    try {
      url = new URL(req.url || '/', `http://${host}`)
    } catch {
      send(res, 400, { error: '请求地址无效' })
      return
    }
    try {
      if (url.pathname.startsWith('/api/') && req.method !== 'GET') {
        const candidate = String(req.headers['x-cg-token'] || '')
        if (
          !/^[a-f\d]{64}$/.test(candidate) ||
          !timingSafeEqual(Buffer.from(candidate), Buffer.from(token))
        ) {
          send(res, 403, { error: '本机操作凭证无效，请刷新界面' })
          return
        }
      }
      if (req.method === 'GET' && url.pathname === '/api/status') {
        send(res, 200, serviceStatus())
        return
      }
      if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
        const results = await Promise.allSettled([
          storage.preferences(),
          readAllConfigs(ctx),
          storage.reports(),
          storage.backups(),
          storage.manualReviews(),
        ])
        for (const result of results) if (result.status === 'rejected') throw result.reason
        const values = results.map((result) =>
          result.status === 'fulfilled' ? result.value : undefined,
        )
        const configurationFiles = values[1] as Awaited<ReturnType<typeof readAllConfigs>>
        const claudeFile = configurationFiles.find((file) => file.relative === CONNECTION_FILE)!
        send(res, 200, {
          service: serviceStatus(),
          machine: machineInfo(ctx),
          preferences: values[0],
          configurationFingerprint: configurationFingerprint(configurationFiles),
          connection: describeConnectionConfiguration(ctx, claudeFile),
          files: describeConfigs(
            configurationFiles,
            claudeConfigurationScopeReason(ctx, claudeFile),
          ),
          reports: values[2],
          backups: values[3],
          demo: ctx.demo,
          token,
          runtime: options.runtime ?? 'browser',
          workflows: workflows.list(),
          snapshots: await snapshots.list(),
          projectRoot: ctx.demo ? ctx.home : process.cwd(),
          manualReviews: values[4],
          translation: await translation.configuration(),
        })
        return
      }
      if (req.method === 'GET' && url.pathname === '/api/translation/settings') {
        send(res, 200, await translation.configuration())
        return
      }
      if (req.method === 'PUT' && url.pathname === '/api/translation/settings') {
        const request = translationRequestSchema.parse(await body(req))
        send(res, 200, await mutation(() => translation.save(request)))
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/translation/test') {
        const request = translationRequestSchema.parse(await body(req))
        send(res, 200, await mutation(() => translation.test(request)))
        return
      }
      if (req.method === 'PUT' && url.pathname === '/api/manual-reviews') {
        const request = manualReviewRequestSchema.parse(await body(req))
        send(res, 200, await mutation(() => storage.saveManualReview(request)))
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/manual-reviews/import') {
        const request = manualReviewImportSchema.parse(await body(req))
        send(res, 200, await mutation(() => storage.importManualReviews(request.ids)))
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/manual-reviews/reset') {
        send(res, 200, await mutation(() => storage.resetManualReviews()))
        return
      }
      if (req.method === 'PUT' && url.pathname === '/api/preferences') {
        const preferences = preferencesSchema.parse(await body(req))
        if (preferences.expectedTimezone) {
          try {
            new Intl.DateTimeFormat('en', { timeZone: preferences.expectedTimezone })
          } catch {
            throw new Error('期望时区不是有效的 IANA 时区')
          }
        }
        await mutation(() => storage.savePreferences(preferences))
        send(res, 200, preferences)
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/scans') {
        if (busy || scanActive) {
          send(res, 409, { error: '已有检测或修改正在进行' })
          return
        }
        scanActive = true
        let finishScan!: () => void
        scanDone = new Promise<void>((resolve) => {
          finishScan = resolve
        })
        try {
          const request = scanRequestSchema.parse(await body(req))
          const preferences = await storage.preferences()
          const previous = (await storage.reports())[0]
          const job: ScanJob = {
            id: randomUUID(),
            status: 'running',
            completed: 0,
            total: TOTAL_CHECKS * (request.passes ?? 1),
            current: '正在读取本机配置',
          }
          if (jobs.size >= 30)
            for (const [id, item] of jobs) {
              if (item.status !== 'running') {
                jobs.delete(id)
                break
              }
            }
          jobs.set(job.id, job)
          send(res, 202, job)
          void runRepeatedDiagnostics(
            ctx,
            preferences,
            request,
            (completed, total, current) => {
              Object.assign(job, { completed, total, current })
            },
            previous,
          )
            .then(async (report) => {
              await storage.saveReport(report)
              Object.assign(job, { status: 'complete', report })
            })
            .catch((error) => {
              Object.assign(job, { status: 'failed', error: (error as Error).message })
            })
            .finally(() => {
              scanActive = false
              finishScan()
            })
          return
        } catch (error) {
          scanActive = false
          finishScan()
          throw error
        }
      }
      const scanMatch = url.pathname.match(/^\/api\/scans\/([\w-]+)$/)
      if (req.method === 'GET' && scanMatch) {
        const job = jobs.get(scanMatch[1]!)
        if (!job) {
          send(res, 404, { error: '检测任务不存在，请重新检测' })
          return
        }
        send(res, 200, job)
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/snapshots') {
        await body(req)
        const snapshot = await mutation(() => snapshots.capture())
        send(res, 200, snapshot)
        return
      }
      const snapshotPreview = url.pathname.match(/^\/api\/snapshots\/([\w-]+)\/preview$/)
      if (req.method === 'POST' && snapshotPreview) {
        await body(req)
        send(res, 200, await mutation(() => snapshots.preview(snapshotPreview[1]!)))
        return
      }
      const snapshotRestore = url.pathname.match(/^\/api\/snapshot-plans\/([\w-]+)\/restore$/)
      if (req.method === 'POST' && snapshotRestore) {
        await body(req)
        send(res, 200, await mutation(() => snapshots.restore(snapshotRestore[1]!)))
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/projects/scan') {
        const request = projectRequestSchema.parse(await body(req))
        send(res, 200, await mutation(() => scanProject(ctx, request.path)))
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/setup/preview') {
        const request = setupRequestSchema.parse(await body(req))
        const preview = await mutation(() => workflows.preview(request))
        send(res, 200, preview)
        return
      }
      const setupStart = url.pathname.match(/^\/api\/setup\/([\w-]+)\/start$/)
      if (req.method === 'POST' && setupStart) {
        const existing = workflows.forPreview(setupStart[1]!)
        if (existing) {
          send(res, 200, existing)
          return
        }
        if (busy || scanActive) {
          send(res, 409, { error: '已有检测或配置流程正在进行' })
          return
        }
        busy = true
        let finishSetup!: () => void
        setupDone = new Promise<void>((resolve) => {
          finishSetup = resolve
        })
        try {
          await body(req)
          const job = await workflows.create(setupStart[1]!)
          send(res, 202, job)
          void workflows.execute(job).finally(() => {
            busy = false
            finishSetup()
          })
        } catch (error) {
          busy = false
          finishSetup()
          throw error
        }
        return
      }
      const setupBrowser = url.pathname.match(/^\/api\/setup\/([\w-]+)\/browser$/)
      if (req.method === 'POST' && setupBrowser) {
        const request = setupBrowserRequestSchema.parse(await body(req))
        workflows.submitBrowser(setupBrowser[1]!, request.probeId, request.browser)
        send(res, 200, { accepted: true })
        return
      }
      const setupGet = url.pathname.match(/^\/api\/setup\/([\w-]+)$/)
      if (req.method === 'GET' && setupGet) {
        const job = workflows.get(setupGet[1]!)
        if (!job) {
          send(res, 404, { error: '配置流程不存在，请重新预览' })
          return
        }
        send(res, 200, job)
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/connections/preview') {
        const request = connectionRequestSchema.parse(await body(req))
        send(
          res,
          200,
          await mutation(async () =>
            repairs.previewConnection(request, await storage.preferences()),
          ),
        )
        return
      }
      const connectionApply = url.pathname.match(/^\/api\/connections\/([\w-]+)\/apply$/)
      if (req.method === 'POST' && connectionApply) {
        await body(req)
        send(
          res,
          200,
          await mutation(async () =>
            repairs.applyConnection(connectionApply[1]!, await storage.preferences(), snapshots),
          ),
        )
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/repairs/preview') {
        const request = repairRequestSchema.parse(await body(req))
        const plan = await mutation(async () =>
          repairs.preview(request.fixIds, await storage.preferences()),
        )
        send(res, 200, plan)
        return
      }
      const applyMatch = url.pathname.match(/^\/api\/repairs\/([\w-]+)\/apply$/)
      if (req.method === 'POST' && applyMatch) {
        await body(req)
        const summary = await mutation(async () =>
          repairs.apply(applyMatch[1]!, await storage.preferences()),
        )
        send(res, 200, summary)
        return
      }
      const restoreMatch = url.pathname.match(/^\/api\/backups\/([\w-]+)\/restore$/)
      if (req.method === 'POST' && restoreMatch) {
        await body(req)
        const summary = await mutation(() => repairs.restore(restoreMatch[1]!))
        send(res, 200, summary)
        return
      }
      const exportMatch = url.pathname.match(/^\/api\/reports\/([\w-]+)\/export$/)
      if (req.method === 'GET' && exportMatch) {
        const original = (await storage.reports()).find((report) => report.id === exportMatch[1])
        if (!original) {
          send(res, 404, { error: '检测报告不存在' })
          return
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
        return
      }
      if (url.pathname.startsWith('/api/')) {
        send(res, 404, { error: '接口不存在' })
        return
      }
      if (req.method !== 'GET') {
        send(res, 405, { error: '此请求方式不受支持' })
        return
      }
      let requested: string
      try {
        requested = decodeURIComponent(url.pathname)
      } catch {
        send(res, 400, { error: '路径无效' })
        return
      }
      const filename = path.resolve(distDir, '.' + requested)
      if (filename !== distDir && !filename.startsWith(distDir + path.sep)) {
        send(res, 403, { error: '路径不可访问' })
        return
      }
      let file = filename
      if (requested === '/' || !path.extname(requested)) file = path.join(distDir, 'index.html')
      let bytes: Buffer
      try {
        bytes = await fs.readFile(file)
      } catch {
        send(res, 404, { error: '界面尚未构建，请先运行 npm run build，开发时访问 5173 端口' })
        return
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
      if (!dev)
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; connect-src 'self' https://api.ipify.org; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        )
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        // Stable public assets (logo, favicon) must revalidate after an app update.
        'Cache-Control': file.startsWith(path.join(distDir, 'assets') + path.sep)
          ? 'public, max-age=86400'
          : 'no-cache',
      })
      res.end(bytes)
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? '请求参数不符合要求'
          : (error as Error).message || '操作未完成'
      if (!res.headersSent) send(res, 400, { error: message })
      else res.end()
    }
  })
  return {
    server,
    ctx,
    storage,
    repairs,
    workflows,
    snapshots,
    isBusy: () => busy || scanActive,
    status: serviceStatus,
    async listen() {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject)
          resolve()
        })
      }).catch(async (error) => {
        await releaseLock()
        throw error
      })
      const address = server.address()
      if (address && typeof address !== 'string') actualPort = address.port
      return actualPort
    },
    close() {
      return (closeDone ??= (async () => {
        closing = true
        await Promise.allSettled([setupDone, scanDone, mutationDone])
        if (!server.listening) {
          await releaseLock()
          return
        }
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        )
        await releaseLock()
      })())
    },
  }
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    const app = await createAppServer()
    const port = await app.listen()
    console.log(`CG Claude 已启动：http://127.0.0.1:${port}`)
    console.log(
      app.ctx.demo
        ? '隔离测试模式：配置修改仅发生在测试目录。'
        : '本机模式：配置修改需在界面预览并执行。',
    )
    if (process.env.CG_OPEN_BROWSER === '1') {
      const url = `http://127.0.0.1:${port}`
      const command =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'cmd.exe'
            : 'xdg-open'
      const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
      execFile(command, args, (error) => {
        if (error) console.log(`请手动打开：${url}`)
      })
    }
    const shutdown = () => {
      void app.close().then(() => process.exit(0))
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    console.error(
      code === 'EADDRINUSE'
        ? '4318 端口已被占用。可直接访问已运行工具，或用 CG_PORT 指定其他端口。'
        : (error as Error).message,
    )
    process.exitCode = 1
  }
}
