import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createContext } from '../server/context'
import type { Context, CommandResult } from '../server/context'
import { Storage } from '../server/storage'
export async function fixture(overrides: Partial<Context> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-guard-test-'))
  const home = path.join(root, 'home')
  await fs.mkdir(home, { recursive: true })
  let systemTimezone = 'Asia/Taipei'
  let userTimezone: string | null = null
  const ctx = createContext({
    home,
    dataDir: path.join(root, 'data'),
    env: {},
    platform: 'darwin',
    demo: true,
    readSystemTimezone: async () => ({ timezone: systemTimezone, source: '隔离测试系统时区' }),
    setSystemTimezone: async (timezone) => {
      systemTimezone = timezone
    },
    readRuntimeTimezone: () => ctx.env.TZ || systemTimezone,
    readUserTimezone: async () => userTimezone,
    setUserTimezone: async (timezone) => {
      userTimezone = timezone
    },
    run: async (command, args): Promise<CommandResult> => {
      if (command === 'scutil' && args[0] === '--proxy')
        return {
          ok: true,
          stdout: '<dictionary> {\n HTTPEnable : 0\n HTTPSEnable : 0\n SOCKSEnable : 0\n}',
          stderr: '',
        }
      if (command === 'scutil') return { ok: true, stdout: 'nameserver[0] : 1.1.1.1', stderr: '' }
      if (command === 'claude') return { ok: true, stdout: '2.1.200 (Claude Code)', stderr: '' }
      if (command === 'curl')
        return {
          ok: true,
          stdout: JSON.stringify({
            ip: '8.8.8.8',
            country: 'US',
            city: 'Test City',
            org: 'AS15169 Test organization',
          }),
          stderr: '',
        }
      return { ok: false, stdout: '', stderr: 'fixture command unavailable' }
    },
    ...overrides,
  })
  const storage = new Storage(ctx)
  await storage.init()
  async function write(relative: string, text: string) {
    const target = path.join(home, relative)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, text, { mode: 0o600 })
  }
  return {
    root,
    home,
    ctx,
    storage,
    write,
    read: (relative: string) => fs.readFile(path.join(home, relative), 'utf8'),
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  }
}
