import { categoryLabels, statusLabels } from '../shared/types.js'
import type { ScanReport } from '../shared/types.js'
export function redactReport(report: ScanReport): ScanReport {
  const copy = structuredClone(report)
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
      evidence.value = evidence.value.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP 已隐藏]')
      if (/^(?:[a-f\d]*:){2,}[a-f\d:.%\w-]*$/i.test(evidence.value))
        evidence.value = '[IPv6 已隐藏]'
    }
  }
  return copy
}
export function markdownReport(report: ScanReport): string {
  const lines = [
    '# CG Claude 环境检测报告',
    '',
    `检测时间：${report.completedAt}`,
    `系统：${report.machine.platformName} / ${report.machine.arch}`,
    '',
    `通过 ${report.counts.pass} 项；需关注 ${report.counts.warn} 项；需处理 ${report.counts.fail} 项；待确认 ${report.counts.manual} 项；未检测 ${report.counts.skipped} 项。`,
    '',
    '本报告反映可观察到的环境与配置，不推算账号状态或封号概率。',
    ...(report.verification
      ? [
          `连续检测：${report.verification.passes} 遍；结果变化项目：${report.verification.unstableCheckIds.join('、') || '无'}`,
        ]
      : []),
    '',
  ]
  for (const check of report.checks) {
    lines.push(
      `## ${categoryLabels[check.category]} · ${check.title}`,
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
