import { authenticationEnvironmentKeys } from '../shared/authentication.js'
import type { ChangePreview, FixId, Preferences, ConfigFileInfo } from '../shared/types.js'
import { privacyState } from '../shared/privacy.js'
import { configTargets } from './context.js'
import type { ConfigContent } from './safety.js'
import { maskedAssignment, endpointValue } from './safety.js'

export const proxyKeys = /^(?:https?_proxy|all_proxy|no_proxy)$/i
export const relevantEnvKeys = new RegExp(
  '^(?:' +
    [
      'https?_proxy',
      'all_proxy',
      'no_proxy',
      'ANTHROPIC_BASE_URL',
      ...authenticationEnvironmentKeys,
      'NODE_EXTRA_CA_CERTS',
      'NODE_TLS_REJECT_UNAUTHORIZED',
      'CLAUDE_CODE_CLIENT_CERT',
      'CLAUDE_CODE_CLIENT_KEY',
      'CLAUDE_CODE_CLIENT_KEY_PASSPHRASE',
      'CLAUDE_CODE_CERT_STORE',
      'DISABLE_TELEMETRY',
      'DISABLE_ERROR_REPORTING',
      'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
      'DO_NOT_TRACK',
      'TZ',
    ].join('|') +
    ')$',
  'i',
)

export interface Assignment {
  key: string
  value: string
  line: number
  safe: boolean
}
export function shellAssignments(content: string): Assignment[] {
  const found: Assignment[] = []
  const lines = content.split(/\r?\n/)
  let continuation = false
  let blockDepth = 0
  let heredoc = ''
  lines.forEach((line, index) => {
    const previousContinuation = continuation
    continuation = /\\\s*$/.test(line) && !/^\s*#/.test(line)
    const trimmed = line.trim()
    if (heredoc) {
      if (trimmed === heredoc) heredoc = ''
      else {
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
        if (match && relevantEnvKeys.test(match[1]!))
          found.push({ key: match[1]!, value: match[2]!, line: index, safe: false })
      }
      return
    }
    if (/^\s*#/.test(line)) return
    const delimiter = line.match(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/)
    if (delimiter) {
      heredoc = delimiter[1]!
      return
    }
    if (/^(?:fi|done|esac|\})\b|^\}/.test(trimmed)) blockDepth = Math.max(0, blockDepth - 1)
    const inBlock = blockDepth > 0
    if (
      /^(?:if|for|while|until|case|select)\b/.test(trimmed) ||
      /(?:\(\)|function\s+[\w-]+)\s*\{/.test(trimmed) ||
      trimmed === '{'
    )
      blockDepth++
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match || !relevantEnvKeys.test(match[1]!)) return
    const value = match[2]!.trim()
    // Change only unconditional, complete literal assignment lines.
    const simple = /^(?:"[^"$`\n]*"|'[^'\n]*'|[^\s;|&<>\\$`#]*)\s*(?:#.*)?$/.test(value)
    found.push({
      key: match[1]!,
      value,
      line: index,
      safe: simple && !inBlock && blockDepth === 0 && !previousContinuation && !continuation,
    })
  })
  return found
}
export function npmAssignments(content: string): Assignment[] {
  return content.split(/\r?\n/).flatMap((line, index) => {
    if (/^\s*[#;]/.test(line)) return []
    const match = line.match(/^\s*(proxy|https-proxy)\s*=\s*(.*)$/i)
    return match ? [{ key: match[1]!, value: match[2]!, line: index, safe: true }] : []
  })
}
export function gitAssignments(content: string): Assignment[] {
  let section = ''
  return content.split(/\r?\n/).flatMap((line, index) => {
    if (/^\s*[#;]/.test(line)) return []
    const header = line.match(/^\s*\[([^\]]+)\]/)
    if (header) section = header[1]!
    const assignment = line.match(/^\s*proxy\s*=\s*(.*)$/i)
    if (!assignment || !/^https?(?:\s|$)/i.test(section)) return []
    return [
      { key: `${section}.proxy`, value: assignment[1]!, line: index, safe: !/\\\s*$/.test(line) },
    ]
  })
}
export function parseClaude(content: string | null): Record<string, unknown> {
  if (content === null) return {}
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    throw new Error('JSON 格式错误，请先手动修正')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('settings.json 必须是 JSON 对象')
  const config = value as Record<string, unknown>
  if (
    config.env !== undefined &&
    (!config.env || typeof config.env !== 'object' || Array.isArray(config.env))
  ) {
    throw new Error('settings.json 中的 env 必须是 JSON 对象')
  }
  return config
}
export function claudeEnv(config: Record<string, unknown>): Record<string, unknown> {
  return (config.env ?? {}) as Record<string, unknown>
}
export interface Transform {
  after: string
  changes: ChangePreview[]
  affectedIds: FixId[]
}
export function transformConfig(
  file: ConfigContent,
  selected: FixId[],
  prefs: Preferences,
): Transform | null {
  if (!file.editable) throw new Error(`${file.display}：${file.error || '不可编辑'}`)
  const target = configTargets.find((item) => item.relative === file.relative)!
  const content = file.content ?? ''
  const changes: ChangePreview[] = []
  const affectedIds = new Set<FixId>()
  let after = content
  if (target.kind === 'shell' || target.kind === 'npm' || target.kind === 'git') {
    const assignments =
      target.kind === 'shell'
        ? shellAssignments(content)
        : target.kind === 'npm'
          ? npmAssignments(content)
          : gitAssignments(content)
    const removals = assignments.filter((item) => {
      if (!item.safe) return false
      if (target.kind === 'shell' && proxyKeys.test(item.key) && selected.includes('shell-proxy'))
        return true
      if (
        target.kind === 'shell' &&
        item.key === 'ANTHROPIC_BASE_URL' &&
        selected.includes('shell-endpoint')
      )
        return true
      if (target.kind === 'npm' && selected.includes('npm-proxy')) return true
      if (target.kind === 'git' && selected.includes('git-proxy')) return true
      return false
    })
    const lines = new Set(removals.map((item) => item.line))
    after = content
      .split(/\r?\n/)
      .filter((_, index) => !lines.has(index))
      .join(content.includes('\r\n') ? '\r\n' : '\n')
    for (const item of removals) {
      changes.push({
        key: item.key,
        before: maskedAssignment(item.key, item.value),
        after: '移除此项',
      })
      affectedIds.add(
        target.kind === 'npm'
          ? 'npm-proxy'
          : target.kind === 'git'
            ? 'git-proxy'
            : item.key === 'ANTHROPIC_BASE_URL'
              ? 'shell-endpoint'
              : 'shell-proxy',
      )
    }
    if (target.kind === 'npm' && selected.includes('npm-tls')) {
      after = after.replace(
        /^(\s*strict-ssl\s*=\s*)(false|0)(\s*(?:[#;].*)?)$/gim,
        (_line, prefix, before, suffix) => {
          changes.push({ key: 'strict-ssl', before: String(before), after: 'true（启用证书校验）' })
          affectedIds.add('npm-tls')
          return prefix + 'true' + suffix
        },
      )
    }
  } else {
    const config = parseClaude(file.content)
    const env = { ...claudeEnv(config) }
    if (selected.includes('claude-endpoint') && 'ANTHROPIC_BASE_URL' in env) {
      changes.push({
        key: 'env.ANTHROPIC_BASE_URL',
        before: endpointValue(String(env.ANTHROPIC_BASE_URL)),
        after: '移除此项，使用客户端默认地址',
      })
      delete env.ANTHROPIC_BASE_URL
      affectedIds.add('claude-endpoint')
    }
    if (selected.includes('claude-privacy')) {
      const desired =
        prefs.privacy === 'minimal'
          ? {
              DISABLE_TELEMETRY: '1',
              DISABLE_ERROR_REPORTING: '1',
              CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
            }
          : { DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1' }
      const state = privacyState(env)
      for (const [key, value] of Object.entries(desired)) {
        if (
          (key === 'DISABLE_TELEMETRY' && state.telemetry) ||
          (key === 'DISABLE_ERROR_REPORTING' && state.errors) ||
          (key === 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC' && state.nonessential)
        )
          continue
        changes.push({
          key: 'env.' + key,
          before: key in env ? maskedAssignment(key, String(env[key])) : '未设置',
          after: value,
        })
        env[key] = value
        affectedIds.add('claude-privacy')
      }
      // Preserve any existing user choice for nonessential traffic in balanced mode.
    }
    if (changes.length) {
      config.env = env
      after = JSON.stringify(config, null, 2) + '\n'
    }
  }
  return changes.length ? { after, changes, affectedIds: [...affectedIds] } : null
}
export function describeConfigs(files: ConfigContent[]): ConfigFileInfo[] {
  return files.map((file) => ({
    id: configTargets.find((target) => target.relative === file.relative)!.id,
    label: configTargets.find((target) => target.relative === file.relative)!.label,
    path: file.display,
    exists: file.exists,
    editable: file.editable,
    summary: file.error ?? (file.exists ? '可检测并预览针对性修改' : '尚未创建'),
  }))
}
