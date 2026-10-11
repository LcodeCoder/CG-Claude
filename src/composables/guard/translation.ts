import type { TranslationRequest, TranslationTestResult } from '../../../shared/translation'
import type { GuardContext } from './context'

export function createTranslationActions(context: GuardContext) {
  const { busy, working, api, notify, connected, finishWrite } = context
  async function saveTranslation(value: TranslationRequest): Promise<boolean> {
    if (busy.value || !connected.value) return false
    working.value = true
    try {
      return await finishWrite(
        () => api('/translation/settings', { method: 'PUT', body: JSON.stringify(value) }),
        () => '翻译模型设置已保存。',
      )
    } finally {
      working.value = false
    }
  }
  async function testTranslation(
    value: TranslationRequest,
  ): Promise<TranslationTestResult | undefined> {
    if (busy.value || !connected.value) return
    working.value = true
    try {
      return await api<TranslationTestResult>('/translation/test', {
        method: 'POST',
        body: JSON.stringify(value),
      })
    } catch (error) {
      notify((error as Error).message, 'error')
    } finally {
      working.value = false
    }
  }
  return { saveTranslation, testTranslation }
}
