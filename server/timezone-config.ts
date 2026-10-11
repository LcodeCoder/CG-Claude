import path from 'node:path'
import type { Context } from './context.js'
import type { ConfigContent } from './safety.js'
import type { ChangePreview } from '../shared/types.js'
import { normalizeTimezone } from '../shared/timezones.js'
import { claudeEnv, parseClaude, shellAssignments } from './configs.js'
import { requireTimezone } from './timezone-settings.js'

const essential = new Set(['.zshenv', '.bashrc', '.profile'])
export function terminalTimezoneScopeReason(ctx: Context) {
  if (ctx.env.ZDOTDIR && path.resolve(ctx.env.ZDOTDIR) !== path.resolve(ctx.home))
    return '存在自定义 ZDOTDIR，无法确认 Zsh 启动配置；请先在实际终端核对'
}
/** Modify literal TZ declarations only; preserve comments, line endings and unrelated settings. */
export function transformTimezoneConfig(
  file: ConfigContent,
  value: string,
  platform: NodeJS.Platform,
): { after: string; changes: ChangePreview[] } | undefined {
  const timezone = requireTimezone(value)
  if (file.relative === '.claude/settings.json') {
    if (!file.editable) throw new Error(`${file.display}：${file.error || '配置不可编辑'}`)
    const config = parseClaude(file.content)
    const env = claudeEnv(config)
    if (env.TZ === timezone) return undefined
    const before = typeof env.TZ === 'string' ? normalizeTimezone(env.TZ) : undefined
    config.env = { ...env, TZ: timezone }
    const newline = file.content?.includes('\r\n') ? '\r\n' : '\n'
    return {
      after: JSON.stringify(config, null, 2).replace(/\n/g, newline) + newline,
      changes: [
        {
          key: 'env.TZ',
          before: before ?? (env.TZ === undefined ? '未设置' : '原值（已隐藏）'),
          after: timezone,
        },
      ],
    }
  }
  if (
    !/^\.(?:zshrc|zprofile|zshenv|bashrc|bash_profile|bash_login|profile)$/.test(file.relative) ||
    platform === 'win32'
  )
    return undefined
  if (!file.exists && !essential.has(file.relative)) return undefined
  if (!file.editable) throw new Error(`${file.display}：${file.error || '配置不可编辑'}`)
  const content = file.content ?? ''
  const assignments = shellAssignments(content).filter((item) => item.key === 'TZ')
  const known = new Set(assignments.filter((item) => item.safe).map((item) => item.line))
  const lines = content.split(/\r?\n/)
  const complex =
    assignments.some((item) => !item.safe) ||
    lines.some(
      (line, index) =>
        !/^\s*#/.test(line) &&
        !known.has(index) &&
        (/\bTZ\s*=/.test(line) ||
          /\b(?:unset|readonly|typeset|declare|local)\b.*\bTZ\b/.test(line)),
    )
  if (complex) throw new Error(`${file.display} 含条件、函数或复杂 TZ 设置，请手动处理后重试`)
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  for (const assignment of assignments) {
    const line = lines[assignment.line]!
    const comment = line.match(/(?:"[^"]*"|'[^']*'|[^#]*)\s+(#.*)$/)?.[1]
    lines[assignment.line] =
      `${line.match(/^\s*/)?.[0] ?? ''}export TZ='${timezone}'${comment ? ` ${comment}` : ''}`
  }
  let after = lines.join(newline)
  if (!assignments.length) {
    after += `${after && !after.endsWith(newline) ? newline : ''}export TZ='${timezone}'${newline}`
    const appended = shellAssignments(after)
      .filter((item) => item.key === 'TZ')
      .at(-1)
    if (!appended?.safe) throw new Error(`${file.display} 脚本结构未闭合，无法安全添加 TZ`)
  }
  if (after === content) return undefined
  return {
    after,
    changes: [
      { key: 'TZ', before: assignments.length ? '现有 TZ 声明' : '未设置', after: timezone },
    ],
  }
}
