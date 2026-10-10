import { constants, promises as fs } from 'node:fs'
import path from 'node:path'
import { connectionFields, connectionVariants } from '../shared/connections.js'
import type {
  ConnectionConfiguration,
  ConnectionKey,
  ConnectionRequest,
} from '../shared/connections.js'
import type { ChangePreview } from '../shared/types.js'
import type { Context } from './context.js'
import { parseClaude, claudeEnv } from './configs.js'
import { maskedAssignment, readConfig, safeValue } from './safety.js'
import type { ConfigContent } from './safety.js'
import { claudeConfigurationScopeReason } from './configuration-scope.js'

export const CONNECTION_FILE = '.claude/settings.json'
function displayValue(ctx: Context, key: string, value: unknown): string {
  return typeof value === 'string'
    ? value.length
      ? maskedAssignment(key, value.replaceAll(ctx.home, '~'))
      : '空值'
    : '值不是字符串，需要人工核对'
}
export function describeConnectionConfiguration(
  ctx: Context,
  file: ConfigContent,
): ConnectionConfiguration {
  let reason = file.error ?? claudeConfigurationScopeReason(ctx, file)
  let env: Record<string, unknown> = {}
  if (!reason) {
    try {
      env = claudeEnv(parseClaude(file.content))
    } catch (error) {
      reason = (error as Error).message
    }
  }
  return {
    path: file.display,
    editable: file.editable && !reason,
    reason,
    fields: connectionFields.map(({ key }) => {
      const existing = connectionVariants(key).filter((variant) => Object.hasOwn(env, variant))
      return {
        key,
        present: existing.length > 0,
        current: reason
          ? '当前文件未纳入编辑范围；请核对上方说明'
          : existing.length
            ? existing
                .map((variant) => variant + '：' + displayValue(ctx, variant, env[variant]))
                .join('；')
            : '此文件未设置，会继续使用其他配置层或客户端默认值',
      }
    }),
  }
}
async function validateCa(key: ConnectionKey, value: string | null) {
  if (key !== 'NODE_EXTRA_CA_CERTS' || value === null) return
  if (!path.isAbsolute(value) || /^[/\\]{2}/.test(value))
    throw new Error('CA 证书请输入本机绝对路径，不能使用 ~、变量或网络共享路径')
  try {
    const stat = await fs.stat(value)
    if (!stat.isFile() || !stat.size) throw new Error('不是非空普通文件')
    await fs.access(value, constants.R_OK)
  } catch {
    throw new Error('CA 证书文件不存在、为空或无法读取；请核对本机绝对路径')
  }
}
export async function validateConnectionFiles(request: ConnectionRequest) {
  for (const item of request.changes)
    await validateCa(item.key, item.value === null ? null : item.value.trim())
}
export async function prepareConnectionEdit(ctx: Context, request: ConnectionRequest) {
  const file = await readConfig(ctx, CONNECTION_FILE)
  const info = describeConnectionConfiguration(ctx, file)
  if (!info.editable) throw new Error(info.reason ?? '当前用户配置无法安全编辑')
  const config = parseClaude(file.content)
  const env = { ...claudeEnv(config) }
  const changes: ChangePreview[] = []
  for (const item of request.changes) {
    const value = item.value === null ? null : item.value.trim()
    await validateCa(item.key, value)
    for (const variant of connectionVariants(item.key)) {
      const present = Object.hasOwn(env, variant)
      const after = variant === item.key ? value : null
      if (after === null) {
        if (!present) continue
        changes.push({
          key: variant,
          before: displayValue(ctx, variant, env[variant]),
          after: '移除此文件中的设置；可继承其他配置层',
        })
        delete env[variant]
      } else if (!present || env[variant] !== after) {
        changes.push({
          key: variant,
          before: present ? displayValue(ctx, variant, env[variant]) : '此文件未设置',
          after: displayValue(ctx, variant, after),
        })
        env[variant] = after
      }
    }
  }
  config.env = env
  const notes = [
    '只修改本次选择的 env 字段。JSON 排版统一为两格缩进，其余字段与凭据原值保留。',
    '修改前会保存完整配置快照和此文件原始备份，可在「备份恢复」还原。',
    'HTTP(S)_PROXY 与 NO_PROXY 在此文件的同名小写项会按预览移除，统一保存为大写；shell 和项目配置需要另外核对。',
    '请重新启动 Claude Code 并用 /status 确认实际连接设置；保存不代表已测试地址连通性。检测偏好不会自动改变。',
  ]
  if (
    request.changes.some((item) => item.key === 'HTTP_PROXY' && item.value !== null) &&
    (env.HTTPS_PROXY || env.https_proxy)
  )
    notes.push('此文件仍有 HTTPS_PROXY / https_proxy，它会优先于刚设置的 HTTP_PROXY。')
  if (request.changes.some((item) => item.key === 'NO_PROXY' && item.value?.trim() === '*'))
    notes.push('NO_PROXY=* 会让请求绕过代理，请确认这符合你的网络方式。')
  if (request.changes.some((item) => item.key === 'NODE_EXTRA_CA_CERTS' && item.value !== null))
    notes.push('CA 文件只验证存在、非空和可读，没有解析证书内容；请在实际客户端日志确认加载结果。')
  return {
    file,
    changes,
    after: JSON.stringify(config, null, 2) + '\n',
    notes: notes.map((note) => safeValue(note, 600)),
  }
}
