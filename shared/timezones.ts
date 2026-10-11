export const ARTICLE_TIMEZONE = 'Asia/Taipei'
export const ARTICLE_URL = 'https://x.com/AYi_AInotes/status/2106639522586829094'

export const timezoneModes = ['article', 'exit', 'manual'] as const
export type TimezoneMode = (typeof timezoneModes)[number]
export const timezoneModeLabels: Record<TimezoneMode, string> = {
  article: '原文建议 · 台北',
  exit: '按当前 IP 出口',
  manual: '手动选择时区',
}
export const commonTimezones = [
  'Asia/Taipei',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'America/Los_Angeles',
  'America/New_York',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Berlin',
  'Australia/Sydney',
  'UTC',
] as const

/** Compare IANA identities, never just UTC offsets: Shanghai and Taipei are different zones. */
export function normalizeTimezone(value: string | undefined): string | undefined {
  if (!value?.trim() || /^[+-]/.test(value.trim())) return undefined
  try {
    return new Intl.DateTimeFormat('en', { timeZone: value.trim() }).resolvedOptions().timeZone
  } catch {
    return undefined
  }
}
export function sameTimezone(left: string | undefined, right: string | undefined): boolean {
  const normalized = normalizeTimezone(left)
  return Boolean(normalized && normalized === normalizeTimezone(right))
}
