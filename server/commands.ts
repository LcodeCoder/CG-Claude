import { execFile } from 'node:child_process'
import type { ExecFileOptionsWithStringEncoding } from 'node:child_process'
import { promisify } from 'node:util'
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
    stderr: failure.code === 'ENOENT' ? '未安装此命令' : '命令未完成或没有权限',
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
      result = await execute(command, args, options)
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
    return { ok: true, stdout: result.stdout.trim(), stderr: result.stderr.trim() }
  } catch (error) {
    return commandFailure(error)
  }
}
