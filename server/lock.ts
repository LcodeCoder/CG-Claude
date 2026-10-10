import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { Context } from './context.js'
import lockfile from 'proper-lockfile'
// Prevent the browser service and desktop application from writing the same data at once.
export async function acquireServiceLock(ctx: Context) {
  const leasePath = path.join(ctx.dataDir, 'service-lease.lock')
  try {
    const stat = await fs.lstat(leasePath)
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('工具服务租约必须是普通目录，请检查记录目录')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  let releaseLease: () => Promise<void>
  try {
    releaseLease = await lockfile.lock(ctx.dataDir, {
      lockfilePath: leasePath,
      stale: 10000,
      update: 2000,
      retries: 0,
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOCKED')
      throw new Error('另一个 CG Claude 正在使用同一本机记录目录，请先退出再打开本工具')
    throw error
  }
  try {
    const releaseOwner = await acquireOwnerFile(ctx)
    let releasePromise: Promise<void> | undefined
    return () =>
      (releasePromise ??= (async () => {
        try {
          await releaseOwner()
        } finally {
          await releaseLease()
        }
      })())
  } catch (error) {
    await releaseLease()
    throw error
  }
}
// Keep the PID marker compatible with earlier versions. The lease serializes stale-owner recovery.
async function acquireOwnerFile(ctx: Context) {
  const file = path.join(ctx.dataDir, 'service.lock')
  const owner = { pid: process.pid, id: randomUUID() }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const handle = await fs.open(file, 'wx', 0o600)
      try {
        await handle.writeFile(JSON.stringify(owner))
      } finally {
        await handle.close()
      }
      return async () => {
        try {
          const current = JSON.parse(await fs.readFile(file, 'utf8'))
          if (current.id === owner.id) await fs.unlink(file)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const stat = await fs.lstat(file)
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error('工具服务锁必须是普通文件，请检查记录目录')
      let existing: { pid?: number } = {}
      try {
        existing = JSON.parse(await fs.readFile(file, 'utf8'))
      } catch {
        /* A crashed process may leave an empty lock. */
      }
      if (Number.isInteger(existing.pid) && existing.pid! > 0) {
        try {
          process.kill(existing.pid!, 0)
        } catch (failure) {
          if ((failure as NodeJS.ErrnoException).code === 'ESRCH') {
            await fs.unlink(file)
            continue
          }
        }
      } else if (Date.now() - stat.mtimeMs > 10000) {
        await fs.unlink(file)
        continue
      }
      throw new Error(
        '另一个 CG Claude 正在使用同一本机记录目录，请先退出已运行的桌面应用或浏览器服务，再打开本工具',
      )
    }
  }
  throw new Error('本机服务正在启动，请稍后重试')
}
