import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Context } from './context.js'
const executeFile = promisify(execFile)
type CommandContext = Pick<Context, 'home' | 'env' | 'platform' | 'demo'>
const marker = 'CG_CLAUDE_PATH_V1='
const supportedShells = new Set([
  '/bin/zsh',
  '/bin/bash',
  '/bin/sh',
  '/usr/bin/zsh',
  '/usr/bin/bash',
])
/** Import only PATH. Startup output and every other environment value stay private. */
export function parseLoginPath(stdout: string): string[] {
  const lines = stdout.split(/\r?\n/).filter((line) => line.startsWith(marker))
  if (lines.length !== 1) return []
  return pathEntries(lines[0]!.slice(marker.length))
}
function pathEntries(value?: string): string[] {
  return (value ?? '')
    .split(':')
    .filter((entry) => entry.startsWith('/') && !/[\x00-\x1f]/.test(entry))
}
type LoginPathExecutor = (
  command: string,
  args: string[],
  options: import('node:child_process').ExecFileOptionsWithStringEncoding,
) => Promise<{ stdout: string; stderr: string }>
export async function prepareCommandEnvironment(
  ctx: CommandContext,
  execute: LoginPathExecutor = executeFile,
): Promise<void> {
  if (ctx.demo || !['darwin', 'linux'].includes(ctx.platform)) return
  let login: string[] = []
  const shell = supportedShells.has(ctx.env.SHELL ?? '')
    ? ctx.env.SHELL!
    : ctx.platform === 'darwin'
      ? '/bin/zsh'
      : '/bin/bash'
  try {
    const result = await execute(shell, ['-ilc', `printf '\\n${marker}%s\\n' "$PATH"`], {
      cwd: ctx.home,
      timeout: 3500,
      maxBuffer: 128 * 1024,
      encoding: 'utf8',
      env: {
        ...ctx.env,
        HOME: ctx.home,
        HISTFILE: '/dev/null',
        SHELL_SESSIONS_DISABLE: '1',
        TERM: 'dumb',
      },
    })
    login = parseLoginPath(result.stdout)
  } catch {
    /* A broken shell config must not prevent the desktop app from starting. */
  }
  const fixed = [
    path.join(ctx.home, '.local/bin'),
    path.join(ctx.home, '.volta/bin'),
    path.join(ctx.home, '.npm-global/bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ]
  let nvm: string[] = []
  try {
    const root = path.join(ctx.home, '.nvm/versions/node')
    const versions = (await fs.readdir(root))
      .filter((name) => /^v\d+\.\d+\.\d+$/.test(name))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .slice(0, 30)
    nvm = versions.map((version) => path.join(root, version, 'bin'))
  } catch {
    /* nvm is optional. */
  }
  ctx.env.PATH = [...new Set([...login, ...pathEntries(ctx.env.PATH), ...fixed, ...nvm])].join(':')
}
