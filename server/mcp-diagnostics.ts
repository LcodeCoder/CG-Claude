/** Static MCP inspection: never expands variables, executes helpers or contacts a server. */
type JsonObject = Record<string, unknown>
export type CredentialStorage = 'literal' | 'reference' | 'dynamic' | 'empty'
export type McpInspection = {
  serverCount: number
  errors: string[]
  notes: string[]
  credentials: Record<CredentialStorage, number>
}
export const credentialField = /(?:API[-_]?KEY|TOKEN|PASSWORD|PASSWD|SECRET|AUTHORIZATION)/i
const variableReference = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^{}]*))?\}/g
function object(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
/** A reference with a nonempty default still stores a literal fallback in the file. */
export function credentialStorage(value: unknown, authorization = false): CredentialStorage {
  if (typeof value !== 'string') return 'dynamic'
  const text = authorization ? value.trim().replace(/^(?:Bearer|Basic)\s+/i, '') : value.trim()
  if (!text || (authorization && /^(?:Bearer|Basic)$/i.test(text))) return 'empty'
  const references = [...text.matchAll(variableReference)]
  const remainder = text.replace(variableReference, '').trim()
  if (references.length) {
    if (references.some((match) => Boolean(match[2]))) return 'literal'
    return remainder ? 'dynamic' : 'reference'
  }
  return /\$\{|\$[A-Za-z_]|\{\{|%[A-Za-z_][A-Za-z0-9_]*%/.test(text) ? 'dynamic' : 'literal'
}
function decode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
export function inspectMcp(parsed: unknown): McpInspection {
  const result: McpInspection = {
    serverCount: 0,
    errors: [],
    notes: [],
    credentials: { literal: 0, reference: 0, dynamic: 0, empty: 0 },
  }
  if (!object(parsed)) {
    result.errors.push('.mcp.json 必须是 JSON 对象')
    return result
  }
  const servers = parsed.mcpServers
  if (servers !== undefined && !object(servers)) {
    result.errors.push('mcpServers 必须是对象')
    return result
  }
  const countCredential = (value: unknown, authorization = false) => {
    result.credentials[credentialStorage(value, authorization)]++
  }
  const entries = Object.values(servers ?? {})
  result.serverCount = entries.length
  entries.forEach((entry, index) => {
    // Numbers identify entries without exposing user-supplied server names or values.
    const label = `第 ${index + 1} 个 MCP 服务`
    if (!object(entry)) {
      result.errors.push(label + '必须是对象')
      return
    }
    for (const field of ['env', 'headers'] as const) {
      const values = entry[field]
      if (values === undefined) continue
      if (!object(values)) {
        result.errors.push(label + '的 ' + field + ' 必须是对象')
        continue
      }
      if (Object.values(values).some((value) => typeof value !== 'string'))
        result.errors.push(label + '的 ' + field + ' 值必须是字符串')
      for (const [key, value] of Object.entries(values))
        if (credentialField.test(key)) countCredential(value, /authorization/i.test(key))
      if (
        Object.entries(values).some(
          ([key, value]) =>
            key.trim() !== key || (typeof value === 'string' && value.trim() !== value),
        )
      )
        result.notes.push(label + '的 ' + field + ' 含首尾空白，请在客户端核对；值已隐藏')
    }
    const type = entry.type ?? 'stdio'
    if (['stdio', 'http', 'streamable-http', 'sse', 'ws'].includes(String(type))) {
      if (type === 'stdio' && (typeof entry.command !== 'string' || !entry.command.trim()))
        result.errors.push(label + '需要非空 command；远程服务应显式声明 type')
      if (type !== 'stdio' && typeof entry.url !== 'string')
        result.errors.push(label + '的远程传输需要字符串 url')
    } else result.notes.push(label + '的传输类型需按客户端版本确认')
    if (
      entry.args !== undefined &&
      (!Array.isArray(entry.args) || !entry.args.every((value) => typeof value === 'string'))
    )
      result.errors.push(label + '的 args 必须是字符串数组')
    if (typeof entry.headersHelper === 'string' && entry.headersHelper.trim())
      result.notes.push(label + '声明动态请求头命令，需要核对来源；本工具不会执行')
    if (typeof entry.url === 'string' && entry.url) {
      try {
        const url = new URL(entry.url)
        if (url.username) countCredential(decode(url.username))
        if (url.password) countCredential(decode(url.password))
        for (const [key, value] of url.searchParams)
          if (credentialField.test(key) || /^(?:key|auth)$/i.test(key)) countCredential(value)
      } catch {
        result.notes.push(label + '的地址无法静态解析，需确认变量引用与实际客户端配置')
      }
    }
  })
  return result
}
