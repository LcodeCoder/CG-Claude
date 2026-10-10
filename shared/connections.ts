import { z } from 'zod'

export const connectionKeys = [
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
  'ANTHROPIC_BASE_URL',
  'NODE_EXTRA_CA_CERTS',
] as const
export type ConnectionKey = (typeof connectionKeys)[number]
export const connectionFields: {
  key: ConnectionKey
  title: string
  help: string
  placeholder: string
}[] = [
  {
    key: 'HTTPS_PROXY',
    title: '首选代理',
    help: '填写 HTTP 或 HTTPS 代理地址。Claude Code 不支持 SOCKS 协议。',
    placeholder: 'http://127.0.0.1:7890',
  },
  {
    key: 'HTTP_PROXY',
    title: '备用代理',
    help: '没有 HTTPS_PROXY 时使用；已有首选代理会继续优先。',
    placeholder: 'http://127.0.0.1:7890',
  },
  {
    key: 'NO_PROXY',
    title: '代理绕过范围',
    help: '用逗号或空格分隔主机；* 会让全部请求绕过代理。',
    placeholder: 'localhost,127.0.0.1',
  },
  {
    key: 'ANTHROPIC_BASE_URL',
    title: 'API / 网关地址',
    help: '使用自己的网关时设置。移除此项会回到其他配置层或客户端默认地址。',
    placeholder: 'https://your-gateway.example',
  },
  {
    key: 'NODE_EXTRA_CA_CERTS',
    title: '额外 CA 证书',
    help: '仅填写可信 CA 文件的本机绝对路径；工具只检查文件元数据。',
    placeholder: '/absolute/path/to/corporate-ca.pem',
  },
]
export function connectionValueError(key: ConnectionKey, value: string): string | undefined {
  if (/[\x00-\x1f\x7f]/.test(value)) return '请使用单行值，不包含控制字符'
  const trimmed = value.trim()
  if (!trimmed) return '请输入新值，或选择移除此项'
  if (trimmed.length > 2048) return '配置值不能超过 2048 个字符'
  if (key === 'NO_PROXY' || key === 'NODE_EXTRA_CA_CERTS') return
  try {
    const url = new URL(trimmed)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname)
      return '请输入带 http:// 或 https:// 的完整地址'
    if (url.search || url.hash) return '地址不应包含查询参数或片段；认证信息请使用专门的认证设置'
    if (key === 'ANTHROPIC_BASE_URL' && (url.username || url.password))
      return 'API 地址不应包含用户名或密码；认证信息请使用专门的认证设置'
    if (key.endsWith('_PROXY') && url.pathname !== '/') return '代理地址只填写协议、主机与端口'
  } catch {
    return '请输入带 http:// 或 https:// 的完整地址'
  }
}
export const connectionRequestSchema = z
  .object({
    changes: z
      .array(
        z
          .object({
            key: z.enum(connectionKeys),
            value: z.string().max(2048).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(connectionKeys.length),
  })
  .strict()
  .superRefine(({ changes }, ctx) => {
    const seen = new Set<string>()
    changes.forEach((change, index) => {
      if (seen.has(change.key))
        ctx.addIssue({
          code: 'custom',
          path: ['changes', index, 'key'],
          message: '同一个配置项只能修改一次',
        })
      seen.add(change.key)
      const message =
        change.value === null ? undefined : connectionValueError(change.key, change.value)
      if (message) ctx.addIssue({ code: 'custom', path: ['changes', index, 'value'], message })
    })
  })
export type ConnectionRequest = z.infer<typeof connectionRequestSchema>
export interface ConnectionConfiguration {
  path: string
  editable: boolean
  reason?: string
  fields: { key: ConnectionKey; present: boolean; current: string }[]
}
export function connectionVariants(key: ConnectionKey): string[] {
  return ['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY'].includes(key) ? [key, key.toLowerCase()] : [key]
}
