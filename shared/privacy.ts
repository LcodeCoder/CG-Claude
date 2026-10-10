import { isEnabledEnvironmentFlag, isNonEmptyEnvironmentValue } from './environment-values.js'
import type { Preferences } from './types.js'
/** Keep privacy tradeoffs consistent in diagnostics, previews, and the setup wizard. */
export const privacyCompatibilityNote =
  '最少流量模式会禁用 Remote Control，并减少自动更新等可选流量。Claude Code 2.1.283 起，付费订阅仅关闭遥测通常可保留 Remote Control；可信设备要求、组织策略与其他开关仍需核对。'
export const privacyEnvironmentKeys = [
  'DISABLE_TELEMETRY',
  'DISABLE_ERROR_REPORTING',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'DO_NOT_TRACK',
] as const
export function privacyState(values: Record<string, unknown>) {
  const nonessential = isNonEmptyEnvironmentValue(values.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)
  return {
    nonessential,
    telemetry:
      nonessential ||
      isNonEmptyEnvironmentValue(values.DISABLE_TELEMETRY) ||
      isEnabledEnvironmentFlag(values.DO_NOT_TRACK),
    errors: nonessential || isNonEmptyEnvironmentValue(values.DISABLE_ERROR_REPORTING),
  }
}
export function matchesPrivacyPreference(
  values: Record<string, unknown>,
  preference: Preferences['privacy'],
): boolean {
  const state = privacyState(values)
  return preference === 'minimal' ? state.nonessential : state.telemetry && state.errors
}
