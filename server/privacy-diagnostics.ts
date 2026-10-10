import type { CheckResult, Preferences } from '../shared/types.js'
import {
  isEnabledEnvironmentFlag,
  isNonEmptyEnvironmentValue,
} from '../shared/environment-values.js'
import {
  matchesPrivacyPreference,
  privacyCompatibilityNote,
  privacyEnvironmentKeys,
} from '../shared/privacy.js'
import type { EnvironmentSources } from './environment-sources.js'

const privacyNames = new Set<string>(privacyEnvironmentKeys)
function describeValue(key: string, value: string | undefined): string {
  if (value === undefined) return '未设置'
  if (key === 'DO_NOT_TRACK')
    return isEnabledEnvironmentFlag(value)
      ? '已启用，关闭遥测与功能旗标获取'
      : value === '' || /^(?:0|false|no|off)$/i.test(value)
        ? '未启用'
        : '值不在文档布尔值范围内，需复核'
  return isNonEmptyEnvironmentValue(value)
    ? '非空值，关闭对应流量（0 和 false 也生效）'
    : '空值，未启用'
}

export function privacyConfiguration(
  input: EnvironmentSources,
  preferences: Preferences,
): CheckResult {
  // Settings usually override inherited env. Shell files are evidence about future
  // launches, never sourced or merged into CG Claude's current process.
  const current = Object.assign(
    {},
    ...input.sources.filter((source) => source.kind === 'process').map((source) => source.values),
    ...input.sources.filter((source) => source.kind === 'claude').map((source) => source.values),
  ) as Record<string, string>
  const applied = matchesPrivacyPreference(current, preferences.privacy)
  const shellCandidate = input.sources.some(
    (source) =>
      source.kind === 'shell' && matchesPrivacyPreference(source.values, preferences.privacy),
  )
  const unresolved = input.sources.flatMap((source) =>
    source.unresolved
      .filter((key) => privacyNames.has(key))
      .map((key) => ({
        label: `${source.label} · ${key}`,
        value: '条件、动态表达式或非字符串值，未执行；需在实际会话确认',
      })),
  )
  const incomplete = input.unavailable.length > 0 || unresolved.length > 0
  const review = incomplete || (!applied && shellCandidate)
  const evidence = input.sources.flatMap((source) =>
    privacyEnvironmentKeys
      .filter((key) => key in source.values)
      .map((key) => ({
        label: `${source.label} · ${key}`,
        value: describeValue(key, source.values[key]),
      })),
  )
  if (!evidence.length) evidence.push({ label: '已读取来源', value: '未发现显式隐私开关' })
  evidence.push(
    ...unresolved,
    ...input.unavailable.map((label) => ({
      label,
      value: '该来源未能纳入检测，检查范围不完整',
    })),
    {
      label: '检查范围',
      value:
        '此工具进程与已读取用户设置；shell 文件仅列出候选配置。项目、组织策略和应用托管会话需另行核对。',
    },
  )
  return {
    id: 'claude-privacy',
    category: 'claude',
    title: '遥测与错误报告',
    description: '按所选隐私偏好核对官方开关，分别处理非空值开关与 DO_NOT_TRACK 布尔值。',
    status: review ? 'manual' : applied ? 'pass' : 'warn',
    summary: incomplete
      ? '部分隐私配置无法静态确认'
      : !applied && shellCandidate
        ? '启动文件存在隐私配置，实际会话需确认'
        : applied
          ? '已读取配置符合当前隐私偏好'
          : '部分隐私开关尚未设置',
    evidence,
    fixIds: !review && !applied ? ['claude-privacy'] : [],
    recommendation: `非空的 DISABLE_TELEMETRY、DISABLE_ERROR_REPORTING 和 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC 都会关闭对应流量，值为 0 也一样；DO_NOT_TRACK 则按常规布尔值处理。${privacyCompatibilityNote} 它们不控制网页的模型训练选择，也不决定账号状态。修改后新建 Claude Code 会话核对。`,
    source: 'official',
    sourceUrl: 'https://code.claude.com/docs/en/env-vars',
  }
}
