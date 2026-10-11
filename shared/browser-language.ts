/** A user-selected language target is independent of IP geography and app UI language. */
export const browserLanguageOptions = [
  { value: 'en-US', title: 'English (United States) · en-US' },
  { value: 'en-GB', title: 'English (United Kingdom) · en-GB' },
  { value: 'en-CA', title: 'English (Canada) · en-CA' },
  { value: 'en-AU', title: 'English (Australia) · en-AU' },
  { value: 'en-SG', title: 'English (Singapore) · en-SG' },
  { value: 'en', title: 'English · 不限定地区' },
] as const
export const browserLanguageTargets = browserLanguageOptions.map((option) => option.value)
export function normalizeLanguage(value?: string): string | undefined {
  if (!value?.trim()) return
  try {
    return Intl.getCanonicalLocales(value.trim())[0]
  } catch {
    return
  }
}
