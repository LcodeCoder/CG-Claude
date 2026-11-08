import { ref } from 'vue'
import { languageFromLocale } from '../../shared/ui-language'
import type { UiLanguage } from '../../shared/ui-language'
import { englishUi } from './en'

function initialUiLanguage(): UiLanguage {
  const browserLanguage = typeof navigator !== 'undefined' ? navigator.language : undefined
  return languageFromLocale(browserLanguage) ?? 'en'
}

export const uiLanguage = ref<UiLanguage>(initialUiLanguage())
/** Only authored interface copy is localized. Code, paths, configuration and quotations stay intact. */
export function translateUi(text: string, values: Record<string, string | number> = {}): string {
  const phrase =
    uiLanguage.value === 'en' && Object.hasOwn(englishUi, text) ? englishUi[text]! : text
  return phrase.replace(/\{(\w+)\}/g, (original, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : original,
  )
}
export function useUiText() {
  return { t: translateUi, language: uiLanguage }
}
