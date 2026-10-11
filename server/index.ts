import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import packageMetadata from '../package.json' with { type: 'json' }
import type { Context } from './context.js'
import { createApplication } from './application.js'
import { createLocalHttpServer } from './http/kernel.js'
import { diagnosticRoutes } from './http/routes/diagnostics.js'
import { configurationRoutes } from './http/routes/configuration.js'
import { recordsRoutes } from './http/routes/records.js'
import { setupRoutes } from './http/routes/setup.js'

export interface ServerOptions {
  ctx?: Context
  port?: number
  dev?: boolean
  distDir?: string
  runtime?: 'browser' | 'electron'
}
/** Composition root and listener lifecycle; business operations live in application.ts. */
export async function createAppServer(options: ServerOptions = {}) {
  const port = options.port ?? Number(process.env.CG_PORT || 4318)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('CG_PORT 必须是有效端口')
  const application = await createApplication(options.ctx, packageMetadata.version)
  const token = randomBytes(32).toString('hex')
  const root = path.dirname(fileURLToPath(import.meta.url))
  let actualPort = port
  let closeDone: Promise<void> | undefined
  const server = createLocalHttpServer({
    port: () => actualPort,
    dev: options.dev ?? process.env.CG_DEV === '1',
    token,
    distDir: path.resolve(
      options.distDir ??
        path.resolve(root, root.includes('dist-server') ? '../../dist' : '../dist'),
    ),
    closing: () => application.status().closing,
    routes: [
      diagnosticRoutes(application, token, options.runtime ?? 'browser'),
      configurationRoutes(application),
      recordsRoutes(application),
      setupRoutes(application),
    ],
  })
  return {
    server,
    ctx: application.ctx,
    storage: application.storage,
    repairs: application.repairs,
    workflows: application.workflows,
    snapshots: application.snapshots,
    isBusy: () => application.operations.busy,
    status: application.status,
    async listen() {
      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject)
          server.listen(port, '127.0.0.1', () => {
            server.removeListener('error', reject)
            resolve()
          })
        })
      } catch (error) {
        await application.releaseLock()
        throw error
      }
      const address = server.address()
      if (address && typeof address !== 'string') actualPort = address.port
      return actualPort
    },
    close() {
      return (closeDone ??= (async () => {
        await application.operations.close()
        try {
          if (server.listening)
            await new Promise<void>((resolve, reject) =>
              server.close((error) => (error ? reject(error) : resolve())),
            )
        } finally {
          await application.releaseLock()
        }
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
        ? `${process.env.CG_PORT || 4318} 端口已被占用。可直接访问已运行工具，或用 CG_PORT 指定其他端口。`
        : (error as Error).message,
    )
    process.exitCode = 1
  }
}
