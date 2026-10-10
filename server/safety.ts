import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Context } from './context.js'
import { configTargets, configPath } from './context.js'

export function hash(content: string | null): string {
  return createHash('sha256')
    .update(content === null ? '\0absent' : content)
    .digest('hex')
}
export function safeValue(value: string, max = 220): string {
  let text = value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\b(?:sk-ant-|sk-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]+/g, '[密钥已隐藏]')
    .replace(/([a-z][a-z\d+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[凭据已隐藏]@')
    .replace(/([?&](?:token|key|api_key|access_token|password|secret)=)[^&#\s]+/gi, '$1[已隐藏]')
  if (text.length > max) text = text.slice(0, max) + '…'
  return text
}
export function endpointValue(value: string): string {
  try {
    const url = new URL(value.trim().replace(/^['"]|['"]$/g, ''))
    return `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}${url.pathname && url.pathname !== '/' ? '/[路径已隐藏]' : ''}${url.username || url.password ? '（凭据已隐藏）' : ''}`
  } catch {
    return '[已配置；值已隐藏]'
  }
}
export function maskedAssignment(key: string, value: string): string {
  if (/TOKEN|KEY|PASSWORD|SECRET|AUTH/i.test(key)) return '[已配置；密钥已隐藏]'
  if (/PROXY|BASE_URL/i.test(key)) return endpointValue(value)
  return safeValue(value)
}
export async function assertSafePath(ctx: Context, relative: string): Promise<string> {
  const target = configPath(ctx, relative)
  let current = ctx.home
  for (const part of relative.split(/[\\/]/)) {
    current = path.join(current, part)
    try {
      const stat = await fs.lstat(current)
      if (stat.isSymbolicLink()) throw new Error('此路径含符号链接，请手动编辑真实配置文件')
      if (current !== target && !stat.isDirectory()) throw new Error('配置目录不是文件夹')
      if (current === target && !stat.isFile()) throw new Error('此配置不是普通文件')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
  }
  return target
}
export interface ConfigContent {
  relative: string
  display: string
  exists: boolean
  editable: boolean
  content: string | null
  mode: number
  error?: string
}
export async function readConfig(ctx: Context, relative: string): Promise<ConfigContent> {
  const base = {
    relative,
    display: '~/' + relative,
    exists: false,
    editable: true,
    content: null,
    mode: 0o600,
  }
  try {
    const target = await assertSafePath(ctx, relative)
    const stat = await fs.stat(target)
    if (stat.size > 1024 * 1024) throw new Error('配置超过 1 MB，请手动检查')
    const content = await fs.readFile(target, 'utf8')
    return { ...base, exists: true, content, mode: stat.mode & 0o777 }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return base
    return { ...base, exists: true, editable: false, error: (error as Error).message }
  }
}
export async function writeConfig(
  ctx: Context,
  relative: string,
  content: string | null,
  mode = 0o600,
): Promise<void> {
  const target = await assertSafePath(ctx, relative)
  if (content === null) {
    await fs.unlink(target).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
    return
  }
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
  await assertSafePath(ctx, relative)
  const temporary = path.join(path.dirname(target), `.guard-${randomUUID()}.tmp`)
  try {
    await fs.writeFile(temporary, content, { mode, flag: 'wx' })
    // Preserve captured permissions even when this process has a stricter umask.
    await fs.chmod(temporary, mode)
    await assertSafePath(ctx, relative)
    await fs.rename(temporary, target)
  } finally {
    await fs.unlink(temporary).catch(() => {})
  }
}
export async function readAllConfigs(ctx: Context): Promise<ConfigContent[]> {
  const results = await Promise.allSettled(
    configTargets.map((target) => readConfig(ctx, target.relative)),
  )
  return results.map((result, index) => {
    if (result.status === 'fulfilled') return result.value
    const relative = configTargets[index]!.relative
    return {
      relative,
      display: '~/' + relative,
      exists: true,
      editable: false,
      content: null,
      mode: 0o600,
      error: '读取失败',
    }
  })
}
