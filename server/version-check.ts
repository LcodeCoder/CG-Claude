import { fetch, EnvHttpProxyAgent } from 'undici'
import { z } from 'zod'
import { PROJECT_URL } from '../shared/app-settings.js'
import type { VersionCheck } from '../shared/app-settings.js'
import type { Context } from './context.js'

type ReleaseResponse = { status: number; value?: unknown }
type ReleaseTransport = () => Promise<ReleaseResponse>
const releaseSchema = z.object({
  tag_name: z.string().regex(/^v?\d+\.\d+\.\d+$/),
  draft: z.literal(false),
  prerelease: z.literal(false),
  published_at: z.string().datetime().nullable(),
})
export function compareVersions(left: string, right: string): number {
  if (!/^v?\d+\.\d+\.\d+$/.test(left) || !/^v?\d+\.\d+\.\d+$/.test(right))
    throw new Error('版本号无效')
  const a = left.replace(/^v/, '').split('.').map(BigInt)
  const b = right.replace(/^v/, '').split('.').map(BigInt)
  for (let index = 0; index < 3; index++)
    if (a[index] !== b[index]) return a[index]! > b[index]! ? 1 : -1
  return 0
}
async function requestRelease(ctx: Context): Promise<ReleaseResponse> {
  const env = ctx.env
  const dispatcher = new EnvHttpProxyAgent({
    httpProxy: env.http_proxy || env.HTTP_PROXY || '',
    httpsProxy: env.https_proxy || env.HTTPS_PROXY || env.http_proxy || env.HTTP_PROXY || '',
    noProxy: env.no_proxy || env.NO_PROXY || '',
    connect: { rejectUnauthorized: true },
    requestTls: { rejectUnauthorized: true },
    proxyTls: { rejectUnauthorized: true },
  })
  try {
    const response = await fetch(
      'https://api.github.com/repos/LcodeCoder/CG-Claude/releases/latest',
      {
        dispatcher,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'CG-Claude-Version-Check',
          'X-GitHub-Api-Version': '2026-03-10',
        },
      },
    )
    if (response.status !== 200) {
      await response.body?.cancel()
      return { status: response.status }
    }
    const chunks: Uint8Array[] = []
    let length = 0
    for await (const chunk of response.body!) {
      length += chunk.length
      if (length > 128 * 1024) throw new Error('版本响应过大')
      chunks.push(chunk)
    }
    return { status: response.status, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  } finally {
    await dispatcher.close()
  }
}
/** Checks only a public stable Release. A repository commit is not a downloadable release. */
export class VersionChecker {
  private pending?: Promise<VersionCheck>
  private cached?: VersionCheck
  constructor(
    ctx: Context,
    private currentVersion: string,
    private transport: ReleaseTransport = () => requestRelease(ctx),
  ) {}
  check(): Promise<VersionCheck> {
    if (this.cached && Date.now() - Date.parse(this.cached.checkedAt) < 60_000)
      return Promise.resolve(this.cached)
    return (this.pending ??= this.execute().finally(() => {
      this.pending = undefined
    }))
  }
  private async execute(): Promise<VersionCheck> {
    let response: ReleaseResponse
    try {
      response = await this.transport()
    } catch {
      throw new Error('版本检查失败，请检查网络后重试')
    }
    const base = { currentVersion: this.currentVersion, checkedAt: new Date().toISOString() }
    if (response.status === 404) return (this.cached = { ...base, status: 'unpublished' })
    if ([403, 429].includes(response.status)) throw new Error('GitHub 请求受限，请稍后重试')
    if (response.status !== 200) throw new Error('GitHub 暂时无法提供版本信息')
    const parsed = releaseSchema.safeParse(response.value)
    if (!parsed.success) throw new Error('版本信息无法验证，请到 GitHub 查看')
    const release = parsed.data
    const comparison = compareVersions(release.tag_name, this.currentVersion)
    return (this.cached = {
      ...base,
      status: comparison > 0 ? 'available' : comparison === 0 ? 'current' : 'ahead',
      latestVersion: release.tag_name.replace(/^v/, ''),
      releaseUrl: `${PROJECT_URL}/releases/tag/${encodeURIComponent(release.tag_name)}`,
      ...(release.published_at ? { publishedAt: release.published_at } : {}),
    })
  }
}
