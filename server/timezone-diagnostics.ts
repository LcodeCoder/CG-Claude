import type { BrowserSnapshot, CheckResult, NetworkInfo, Preferences } from '../shared/types.js'
import {
  ARTICLE_TIMEZONE,
  ARTICLE_URL,
  normalizeTimezone,
  sameTimezone,
  timezoneModeLabels,
} from '../shared/timezones.js'
import type { SystemTimezone } from './system-timezone.js'
import type { EnvironmentSources } from './environment-sources.js'
import { safeValue } from './safety.js'

export interface TimezoneTarget {
  timezone?: string
  basis: string
  error?: string
  exit?: string
  fromArticle: boolean
}
export function resolveTimezoneTarget(
  preferences: Preferences,
  networkEnabled: boolean,
  network?: NetworkInfo,
  browser?: BrowserSnapshot,
): TimezoneTarget {
  const mode = preferences.timezoneMode ?? (preferences.expectedTimezone ? 'manual' : 'article')
  const basis = timezoneModeLabels[mode]
  if (mode === 'article') return { timezone: ARTICLE_TIMEZONE, basis, fromArticle: true }
  if (mode === 'manual') {
    const timezone = normalizeTimezone(preferences.expectedTimezone)
    return {
      timezone,
      basis,
      fromArticle: false,
      ...(timezone ? {} : { error: '尚未选择有效的手动目标时区' }),
    }
  }
  if (!networkEnabled) return { basis, fromArticle: false, error: '按出口检测需要开启本次公网检测' }
  if (network?.ip && browser?.publicIp && network.ip !== browser.publicIp)
    return {
      basis,
      fromArticle: false,
      error: '本机与浏览器出口不同，需先确认要采用哪个出口',
      exit: network.ip,
    }
  const timezone = network?.ip ? normalizeTimezone(network.timezone) : undefined
  return {
    timezone,
    basis,
    fromArticle: false,
    exit: network?.ip,
    ...(timezone ? {} : { error: '当前出口查询没有返回有效时区；请重新检测或手动选择' }),
  }
}
function targetEvidence(target: TimezoneTarget) {
  return [
    { label: '检测依据', value: target.basis },
    { label: '目标时区', value: target.timezone ?? '未获取；不能判定通过' },
    { label: '原文基准', value: `${ARTICLE_TIMEZONE}（台北）；第 2.2 / 6.1 / 9 节` },
    ...(target.exit ? [{ label: '用于时区建议的出口', value: safeValue(target.exit) }] : []),
    ...(target.error ? [{ label: '目标读取状态', value: target.error }] : []),
  ]
}
export function systemTimezoneCheck(system: SystemTimezone, target: TimezoneTarget): CheckResult {
  const known = Boolean(normalizeTimezone(system.timezone) && target.timezone)
  const matches = known && sameTimezone(system.timezone, target.timezone)
  return {
    id: 'timezone',
    category: 'system',
    title: '系统时区',
    description:
      '读取操作系统时区，按原文台北建议、当前 IP 出口或手动选择的目标核对。相同 UTC 偏移不代表同一时区。',
    status: !known ? 'manual' : matches ? 'pass' : 'warn',
    summary: !known
      ? (target.error ?? system.error ?? '系统时区需要手动确认')
      : matches
        ? `${system.timezone} · 符合${target.basis}`
        : `${system.timezone} ≠ ${target.timezone} · 不符合所选目标`,
    evidence: [
      { label: '系统时区', value: system.timezone ?? '未读取' },
      { label: '系统证据来源', value: system.source },
      ...(system.raw ? [{ label: '系统原始读数', value: safeValue(system.raw) }] : []),
      ...(system.error ? [{ label: '读取状态', value: system.error }] : []),
      ...targetEvidence(target),
    ],
    recommendation: !known
      ? (target.error ?? system.error ?? '先核对系统时区再检测。')
      : matches
        ? '当前系统读数符合所选目标；自动设定时区、定位服务和手机端仍需单独复核。'
        : '在系统日期与时间中调整到所选目标，或在 CG Claude 的检测偏好中重新选择时区依据，随后重新检测。',
    fixIds: [],
    source: target.fromArticle ? 'community' : 'system',
    sourceUrl: ARTICLE_URL,
  }
}
export function browserTimezoneCheck(
  system: SystemTimezone,
  target: TimezoneTarget,
  browser?: BrowserSnapshot,
): CheckResult {
  const known = Boolean(
    normalizeTimezone(system.timezone) && normalizeTimezone(browser?.timezone) && target.timezone,
  )
  const consistent = sameTimezone(browser?.timezone, system.timezone)
  const matches = consistent && sameTimezone(browser?.timezone, target.timezone)
  return {
    id: 'browser-timezone',
    category: 'browser',
    title: '浏览器与本机时区',
    description: '核对当前应用浏览器、本机系统与所选目标时区；两者一致仍需满足目标。',
    status: !browser ? 'skipped' : !known ? 'manual' : matches ? 'pass' : 'warn',
    summary: !browser
      ? '从浏览器界面运行后检测'
      : !known
        ? '时区证据或目标不完整，需确认'
        : matches
          ? '浏览器与系统一致，且符合所选目标'
          : consistent
            ? `两者均为 ${system.timezone}，但目标是 ${target.timezone}`
            : '浏览器与系统时区不同',
    evidence: [
      { label: '浏览器时区', value: safeValue(browser?.timezone ?? '未检测') },
      { label: '系统时区', value: system.timezone ?? '未读取' },
      ...targetEvidence(target),
      { label: '检测范围', value: '仅当前应用浏览器；用于 Claude 登录的其他浏览器资料需另外复核' },
    ],
    recommendation:
      '差异可能来自 TZ、浏览器设置或扩展。系统、终端和浏览器应分别复检；浏览器语言不参与判定。',
    fixIds: [],
    source: target.fromArticle ? 'community' : 'system',
    sourceUrl: ARTICLE_URL,
  }
}
export function runtimeTimezoneCheck(
  system: SystemTimezone,
  runtimeTimezone: string,
  target: TimezoneTarget,
  environment: EnvironmentSources,
): CheckResult {
  const declarations = environment.sources.filter((source) => Boolean(source.values.TZ))
  const unresolved = environment.sources.filter((source) => source.unresolved.includes('TZ'))
  const known = Boolean(
    normalizeTimezone(system.timezone) && normalizeTimezone(runtimeTimezone) && target.timezone,
  )
  const conflict =
    known &&
    (!sameTimezone(runtimeTimezone, system.timezone) ||
      !sameTimezone(runtimeTimezone, target.timezone) ||
      declarations.some((source) => !sameTimezone(source.values.TZ, system.timezone)))
  const incomplete = !known || unresolved.length > 0 || environment.unavailable.length > 0
  return {
    id: 'timezone-env',
    category: 'system',
    title: '终端进程与 TZ',
    description:
      '单独读取 CG Claude 的 Node 进程时区，并核对启动文件、Claude 设置和进程中的 TZ 声明。',
    status: conflict ? 'warn' : incomplete ? 'manual' : 'pass',
    summary: conflict
      ? '进程或 TZ 声明与系统 / 目标时区不同'
      : incomplete
        ? '时区证据或部分声明未能读取'
        : declarations.length
          ? '已读取的进程与 TZ 声明符合系统和目标'
          : '进程符合系统和目标，未发现 TZ 覆盖',
    evidence: [
      { label: 'Node 进程时区', value: runtimeTimezone },
      { label: '系统时区', value: system.timezone ?? '未读取' },
      ...targetEvidence(target),
      ...declarations.map((source) => ({
        label: `${source.label} · TZ`,
        value: safeValue(source.values.TZ!),
      })),
      ...unresolved.map((source) => ({
        label: `${source.label} · TZ`,
        value: '复杂表达式，未执行，需手动核对',
      })),
      ...environment.unavailable.map((source) => ({ label: '未读取来源', value: source })),
    ],
    recommendation:
      '修改系统或 TZ 后重启 CG Claude，并在实际使用 Claude Code 的新终端中核对 Node 时区。这里不能证明所有已打开终端的状态。',
    fixIds: [],
    source: 'system',
    sourceUrl: ARTICLE_URL,
  }
}
export function timezoneFollowupCheck(target: TimezoneTarget): CheckResult {
  return {
    id: 'timezone-followup',
    category: 'system',
    title: '自动时区、定位与手机端',
    description:
      '原文第 2.2 / 6.1 / 9 节还要求关闭自动设定时区、关闭定位服务中的设定时区，并核对手机。',
    status: 'manual',
    summary: '三项尚未自动核实，需逐项人工复核',
    evidence: [
      ...targetEvidence(target),
      { label: '电脑自动设定时区', value: '未自动读取；不能由当前时区推断已关闭' },
      { label: '定位服务 · 设定时区', value: '未自动读取；不能由当前时区推断已关闭' },
      { label: '手机时区与自动设置', value: '本机不能读取另一台设备；请按所选目标核对' },
    ],
    recommendation:
      'Mac：系统设置 → 通用 → 日期与时间；隐私与安全性 → 定位服务 → 系统服务。iPhone：通用 → 日期与时间，及定位服务 → 系统服务。Windows：时间和语言 → 日期和时间。逐项完成后，在人工复核中记录。',
    fixIds: [],
    source: 'community',
    sourceUrl: ARTICLE_URL,
  }
}
