import { isIP } from 'node:net'
import { usageModeLabel } from '../shared/usage-modes.js'
import { categoryLabels, statusLabels } from '../shared/types.js'
import type { ScanReport } from '../shared/types.js'
/** Validate address candidates so versions and ordinary numbers remain readable. */
function redactAddresses(value: string): string {
  const ipv6Masked = value.replace(
    /(?:[a-f\d]*:){2,}[a-f\d:.]+(?:%[a-z\d_.-]+)?/gi,
    (candidate) => {
      const address = candidate.replace(/\.+$/, '')
      return isIP(address) === 6 ? '[IPv6 已隐藏]' + candidate.slice(address.length) : candidate
    },
  )
  return ipv6Masked.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (candidate) =>
    isIP(candidate) === 4 ? '[IP 已隐藏]' : candidate,
  )
}

export function redactReport(report: ScanReport): ScanReport {
  const copy = structuredClone(report)
  delete copy.configurationFingerprint
  const privateValues = [copy.machine.hostname, copy.network?.ip, copy.network?.browserIp].filter(
    Boolean,
  ) as string[]
  copy.machine.hostname = '[本机名称已隐藏]'
  if (copy.network) {
    copy.network.ip = '[公网 IP 已隐藏]'
    if (copy.network.browserIp) copy.network.browserIp = '[公网 IP 已隐藏]'
  }
  for (const check of copy.checks) {
    for (const evidence of check.evidence) {
      for (const value of privateValues)
        evidence.value = evidence.value.split(value).join('[已隐藏]')
      evidence.value = redactAddresses(evidence.value)
    }
  }
  return copy
}
function reportClock(report: ScanReport): { label: string; filename: string } | undefined {
  const date = new Date(report.completedAt)
  if (Number.isNaN(date.getTime())) return undefined
  let timeZone = report.machine.timezone || 'UTC'
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-GB', { ...options, timeZone })
  } catch {
    timeZone = 'UTC'
    formatter = new Intl.DateTimeFormat('en-GB', { ...options, timeZone })
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  )
  const day = `${parts.year}-${parts.month}-${parts.day}`
  return {
    label: `${day} ${parts.hour}:${parts.minute}:${parts.second}（${timeZone}）`,
    filename: `${day}-${parts.hour}${parts.minute}${parts.second}`,
  }
}
export function reportExportName(report: ScanReport, format: 'md' | 'json'): string {
  return `cg-claude-${reportClock(report)?.filename ?? 'report'}.${format}`
}

export function markdownReport(report: ScanReport): string {
  const routeLabel = { system: '系统 / HTTP 代理', tun: 'TUN 全流量接管', custom: '自定义路由' }[
    report.preferences.routeMode
  ]
  const changedTitles = report.verification?.unstableCheckIds.map(
    (id) => report.checks.find((check) => check.id === id)?.title ?? id,
  )
  const lines = [
    '# CG Claude 环境检测报告',
    '',
    '## 检测条件',
    '',
    `- 检测时间：${reportClock(report)?.label ?? '时间记录不可用'}`,
    `- 原始时间：${report.completedAt.replace(/[\r\n]/g, ' ')}`,
    `- 系统：${report.machine.platformName} / ${report.machine.arch}`,
    `- 检测范围：${report.networkEnabled ? '本机配置 + 公网观测' : '本机配置（未开启公网检测）'}`,
    `- 检测规则：${report.ruleset ?? '旧记录未保存规则版本'}`,
    `- 服务方式：${usageModeLabel(report.preferences.usageMode)}`,
    `- 网络模式：${routeLabel}`,
    `- 隐私偏好：${report.preferences.privacy === 'minimal' ? '关闭全部非必要流量' : '关闭使用指标与错误报告'}`,
    `- 期望时区：${report.preferences.expectedTimezone.replace(/[\r\n]/g, ' ') || '未指定'}`,
    `- 期望出口地区：${report.preferences.expectedCountry || '未指定'}`,
    '',
    `通过 ${report.counts.pass} 项；需关注 ${report.counts.warn} 项；需处理 ${report.counts.fail} 项；待确认 ${report.counts.manual} 项；未检测 ${report.counts.skipped} 项。`,
    '',
    '本报告反映可观察到的环境与配置，不推算账号状态或封号概率。',
    ...(report.verification
      ? [
          `连续检测：${report.verification.passes} 遍；结果变化项目：${changedTitles?.join('、') || '无'}`,
        ]
      : []),
    '',
  ]
  const issues = report.checks.filter((check) => check.status === 'fail' || check.status === 'warn')
  const pending = report.checks.filter(
    (check) => check.status === 'manual' || check.status === 'skipped',
  )
  if (issues.length) {
    lines.push('## 优先关注', '')
    for (const check of issues)
      lines.push(`- ${statusLabels[check.status]} · ${check.title}：${check.summary}`)
    lines.push('')
  }
  if (pending.length) {
    lines.push(
      '## 待确认与未检测',
      '',
      ...pending.map((check) => `- ${statusLabels[check.status]} · ${check.title}`),
      '',
    )
  }
  lines.push(
    '## 检测证据与建议',
    '',
    '参考链接反映该记录保存时的来源；当前文献库可能已有更新。',
    '',
  )
  for (const check of report.checks) {
    lines.push(
      `### ${categoryLabels[check.category]} · ${check.title}`,
      '',
      `状态：${statusLabels[check.status]}`,
      '',
      check.summary,
      '',
    )
    for (const evidence of check.evidence)
      lines.push(`- ${evidence.label}：${evidence.value.replace(/\n/g, ' ')}`)
    lines.push('', `建议：${check.recommendation}`, '')
    if (check.sourceUrl) lines.push(`参考：${check.sourceUrl}`, '')
  }
  return lines.join('\n')
}
