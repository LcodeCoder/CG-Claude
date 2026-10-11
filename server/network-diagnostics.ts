import { isIP } from 'node:net'
import type { BrowserSnapshot, CheckResult, NetworkInfo } from '../shared/types.js'
import type { Context } from './context.js'
import { safeValue } from './safety.js'

export async function probeNetwork(ctx: Context): Promise<{ info?: NetworkInfo; error?: string }> {
  const result = await ctx.run(
    'curl',
    [
      '--disable',
      '--silent',
      '--show-error',
      '--fail',
      '--max-time',
      '8',
      'https://ipinfo.io/json',
    ],
    9500,
  )
  if (!result.ok) return { error: '公网查询未完成，检查网络或 curl 是否可用。' }
  try {
    const value = JSON.parse(result.stdout) as Record<string, unknown>
    const ip = typeof value.ip === 'string' ? value.ip : ''
    if (!isIP(ip)) return { error: 'IP 查询服务没有返回有效地址。' }
    const pick = (key: string) =>
      typeof value[key] === 'string' ? safeValue(value[key], 150) : undefined
    return {
      info: {
        ip,
        country: pick('country'),
        city: pick('city'),
        org: pick('org'),
        timezone: pick('timezone'),
      },
    }
  } catch {
    return { error: '公网查询服务返回了无法解析的结果。' }
  }
}
export function isPublicAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4)
    return !/^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(address)
  if (version === 6) {
    if (/^::ffff:/i.test(address)) return isPublicAddress(address.slice(7))
    return !/^(?:fc|fd|fe8|fe9|fea|feb|::1$|::$)/i.test(address)
  }
  return false
}
export function ipv6Result(
  interfaces: { name: string; family: string; internal: boolean; address: string }[],
): CheckResult {
  const addresses = interfaces.filter((item) => item.family === 'IPv6' && !item.internal)
  const publicAddresses = addresses.filter((item) => isPublicAddress(item.address))
  return {
    id: 'ipv6',
    category: 'network',
    title: 'IPv6 路由覆盖',
    description: '区分公网候选与链路本地 / 私有 IPv6；接口不能证明实际请求路由。',
    fixIds: [],
    status: publicAddresses.length ? 'manual' : 'pass',
    summary: publicAddresses.length
      ? '存在 IPv6 公网候选，需确认代理覆盖'
      : addresses.length
        ? '仅观察到本地 IPv6 地址，未发现公网候选'
        : '未发现非回环 IPv6 地址',
    evidence: addresses.slice(0, 8).map((item) => ({
      label: `${item.name} · ${isPublicAddress(item.address) ? '公网候选' : '本地地址'}`,
      value: safeValue(item.address),
    })),
    recommendation:
      '本机地址样本不等于泄漏测试。若代理仅覆盖 IPv4，核对 IPv6 路由；按网络需要选择是否关闭，并记录原配置以便恢复。',
    source: 'community',
    sourceUrl: 'https://x.com/AYi_AInotes/status/2106639522586829094?s=46',
  }
}
export function webrtcResult(
  browser: BrowserSnapshot | undefined,
  network: NetworkInfo | undefined,
  enabled: boolean,
): CheckResult {
  const base: CheckResult = {
    id: 'webrtc',
    category: 'browser',
    title: 'WebRTC 出口',
    description: '检查浏览器 ICE 候选地址，比较公网出口；隐藏候选不等于已证明无泄漏。',
    status: 'skipped',
    summary: '开启网络检测后检查',
    evidence: [],
    recommendation: '完整复核可打开 BrowserLeaks，浏览器扩展及网络策略会影响结果。',
    fixIds: [],
    source: 'system',
    sourceUrl: 'https://browserleaks.com/webrtc',
  }
  if (!enabled) return base
  if (!browser?.webrtc?.available)
    return { ...base, status: 'manual', summary: '浏览器未提供 WebRTC 检测能力' }
  const rtc = browser.webrtc
  const candidates = rtc.candidates.filter(
    (candidate) => isIP(candidate.address) || candidate.address.endsWith('.local'),
  )
  const publicCandidates = candidates.filter((candidate) => isPublicAddress(candidate.address))
  // WebRTC belongs to this browser. Accepting the terminal's different IP can hide a bypass.
  const expected = browser.publicIp && isIP(browser.publicIp) ? browser.publicIp : undefined
  const differs = Boolean(
    expected && publicCandidates.some((candidate) => candidate.address !== expected),
  )
  const completed = rtc.tested && !rtc.timedOut && !rtc.error
  const comparable = Boolean(completed && publicCandidates.length && expected)
  return {
    ...base,
    status: differs ? 'warn' : comparable ? 'pass' : 'manual',
    summary: differs
      ? '发现与浏览器 HTTPS 出口不同的公网地址'
      : !completed
        ? 'WebRTC 采样未完整完成，需外部复核'
        : comparable
          ? '本次可见公网候选与浏览器 HTTPS 出口一致'
          : '未获取可比较的浏览器出口或公网候选，需外部复核',
    evidence: [
      ...candidates.map((candidate) => ({
        label: candidate.type === 'srflx' ? 'STUN 公网候选' : '本机候选',
        value: safeValue(candidate.address),
      })),
      ...(expected ? [{ label: '浏览器 HTTPS 出口', value: expected }] : []),
      ...(network?.ip ? [{ label: '终端出口（不能替代浏览器比较基准）', value: network.ip }] : []),
      {
        label: '采样状态',
        value: completed
          ? '本次采样完成；其他浏览器资料仍需复核'
          : '未完成、超时或遇到错误；不能证明无泄漏',
      },
    ],
  }
}
