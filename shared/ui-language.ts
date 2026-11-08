import { z } from 'zod'

/** Interface languages are independent from the user's browser-language or translation target. */
export const uiLanguages = ['zh-CN', 'en'] as const
export const uiLanguageSchema = z.enum(uiLanguages)
export type UiLanguage = (typeof uiLanguages)[number]

/**
 * Map a POSIX or BCP 47 locale to the interface language. `C` and `POSIX` name
 * no language at all, so they are skipped rather than treated as a choice.
 */
export function languageFromLocale(locale: string | undefined): UiLanguage | undefined {
  if (!locale) return undefined
  const value = locale.trim()
  if (!value) return undefined
  const base = value.split(/[.@]/, 1)[0]!.replaceAll('_', '-')
  if (/^C$/i.test(base) || /^POSIX$/i.test(base)) return undefined
  return /^zh(?:-|$)/i.test(base) ? 'zh-CN' : 'en'
}

/**
 * Resolve the first-run interface language from the conventional POSIX locale
 * variables. LC_ALL has the highest priority, then the GNU LANGUAGE priority
 * list, LC_MESSAGES and LANG; the desktop's native locale is the final hint.
 * English is the fallback for every non-Chinese value, including an unset
 * environment.
 */
export function detectUiLanguage(env: Record<string, string | undefined>): UiLanguage {
  for (const key of ['LC_ALL', 'LANGUAGE', 'LC_MESSAGES', 'LANG', 'CG_SYSTEM_LOCALE']) {
    const raw = env[key]
    if (!raw) continue
    const candidate = key === 'LANGUAGE' ? raw.split(':').find((value) => value.trim()) : raw
    const language = languageFromLocale(candidate)
    if (language) return language
  }
  return 'en'
}
