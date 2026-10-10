import path from 'node:path'
import type { Context } from './context.js'
import type { ConfigContent } from './safety.js'
import { claudeEnv, parseClaude } from './configs.js'

/** Resolve declared scope only; never expand expressions or read external directories. */
export function claudeConfigurationScopeReason(
  ctx: Context,
  file?: ConfigContent,
): string | undefined {
  // The configured home can carry Windows syntax in an isolated platform simulation.
  const windowsPaths =
    ctx.platform === 'win32' ||
    (path.win32.isAbsolute(ctx.home) && !path.posix.isAbsolute(ctx.home))
  const paths = windowsPaths ? path.win32 : path.posix
  const normalize = (value: string) => {
    const resolved = paths.resolve(value)
    return windowsPaths ? resolved.toLowerCase() : resolved
  }
  const expected = normalize(paths.join(ctx.home, '.claude'))
  const overrides: unknown[] = [ctx.env.CLAUDE_CONFIG_DIR]
  if (file?.content) {
    try {
      overrides.push(claudeEnv(parseClaude(file.content)).CLAUDE_CONFIG_DIR)
    } catch {
      // Structure errors remain the responsibility of the file's own check.
    }
  }
  if (
    overrides.some(
      (value) =>
        value != null &&
        value !== '' &&
        (typeof value !== 'string' || !paths.isAbsolute(value) || normalize(value) !== expected),
    )
  )
    return '发现自定义或无法确认的 CLAUDE_CONFIG_DIR。本入口只支持默认用户配置；请在实际 Claude Code 会话用 /status 核对目录，默认设置保持原样。'
}
