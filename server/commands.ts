import { execFile } from 'node:child_process'
import type { ExecFileOptionsWithStringEncoding } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs, constants } from 'node:fs'
import path from 'node:path'
import type { CommandResult, Context } from './context.js'

const execFileAsync = promisify(execFile)
type Executor = (
  command: string,
  args: string[],
  options: ExecFileOptionsWithStringEncoding,
) => Promise<{ stdout: string; stderr: string }>
type CommandContext = Pick<Context, 'home' | 'env' | 'platform'>

function windowsProbe(command: string, args: string[]): string | undefined {
  // These strings are entirely fixed. Arbitrary args and project paths stay in execFile.
  if (command === 'claude' && args.length === 1 && args[0] === '--version')
    return 'claude.cmd --version'
  if (command === 'npm' && args.length === 3 && args[0] === 'config' && args[1] === 'get') {
    if (args[2] === 'proxy') return 'npm.cmd config get proxy'
    if (args[2] === 'https-proxy') return 'npm.cmd config get https-proxy'
  }
  return undefined
}
function commandFailure(error: unknown): CommandResult {
  const failure = error as { stdout?: string; code?: string }
  return {
    ok: false,
    stdout: failure.stdout?.trim() ?? '',
    stderr:
      failure.code === 'ENOENT'
        ? '当前命令搜索路径中未找到此命令'
        : failure.code === 'EACCES'
          ? '命令没有执行权限'
          : '命令未完成或超时',
  }
}

/** Native executables run directly; only known Windows read probes may use a .cmd shim. */
export async function runSystemCommand(
  ctx: CommandContext,
  command: string,
  args: string[],
  timeout = 5000,
  execute: Executor = execFileAsync,
): Promise<CommandResult> {
  let executable = command
  if (
    ctx.platform !== 'win32' &&
    ['claude', 'npm', 'node', 'git', 'curl', 'scutil'].includes(command)
  ) {
    for (const directory of (ctx.env.PATH ?? '').split(':')) {
      if (!path.isAbsolute(directory) || /[\x00-\x1f]/.test(directory)) continue
      const candidate = path.join(directory, command)
      try {
        if (!(await fs.stat(candidate)).isFile()) continue
        await fs.access(candidate, constants.X_OK)
        executable = candidate
        break
      } catch {
        /* Try the next absolute PATH entry. */
      }
    }
  }
  const options: ExecFileOptionsWithStringEncoding = {
    timeout,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    env: {
      ...ctx.env,
      HOME: ctx.home,
      USERPROFILE: ctx.home,
      ...(ctx.platform === 'win32' ? { NoDefaultCurrentDirectoryInExePath: '1' } : {}),
    },
    encoding: 'utf8',
  }
  const started = Date.now()
  try {
    let result: { stdout: string; stderr: string }
    try {
      result = await execute(executable, args, options)
    } catch (error) {
      const script = ctx.platform === 'win32' ? windowsProbe(command, args) : undefined
      const code = (error as NodeJS.ErrnoException).code
      // Never rerun a command that started and failed, including timeout or nonzero exit.
      if (!script || (code !== 'ENOENT' && code !== 'EINVAL')) throw error
      result = await execute('cmd.exe', ['/d', '/s', '/c', script], {
        ...options,
        timeout: Math.max(1, timeout - (Date.now() - started)),
        windowsVerbatimArguments: true,
      })
    }
    return {
      ok: true,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      ...(executable !== command ? { executable } : {}),
    }
  } catch (error) {
    const failure = error as { code?: unknown; stdout?: string; stderr?: string }
    // Git's fixed --get probes exit 1 for an absent key; an actual error stays unknown.
    if (
      command === 'git' &&
      args.length === 4 &&
      args[0] === 'config' &&
      args[1] === '--global' &&
      args[2] === '--get' &&
      ['http.proxy', 'https.proxy'].includes(args[3]!) &&
      failure.code === 1 &&
      failure.stdout !== undefined &&
      failure.stderr !== undefined &&
      !failure.stdout.trim() &&
      !failure.stderr.trim()
    )
      return { ok: true, stdout: '', stderr: '' }
    return commandFailure(error)
  }
}
