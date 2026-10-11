import { ref } from 'vue'
import { englishUi } from './en'

export const uiLanguage = ref<'zh-CN' | 'en'>('zh-CN')
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
