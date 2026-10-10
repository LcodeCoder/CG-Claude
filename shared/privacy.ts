import { isEnabledEnvironmentFlag, isNonEmptyEnvironmentValue } from './environment-values.js'
import type { Preferences } from './types.js'
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
