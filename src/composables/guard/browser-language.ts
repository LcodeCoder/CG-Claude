import type {
  BrowserLanguageRequest,
  BrowserLanguagePreview,
} from '../../../shared/browser-configuration'
import type { GuardContext } from './context'

export function createBrowserLanguageActions(context: GuardContext) {
  const { busy, working, api, notify, connected, finishWrite } = context
  async function previewBrowserLanguage(
    value: BrowserLanguageRequest,
  ): Promise<BrowserLanguagePreview | undefined> {
    if (busy.value || !connected.value) return
    working.value = true
    try {
      return await api<BrowserLanguagePreview>('/browser-language/preview', {
        method: 'POST',
        body: JSON.stringify(value),
      })
    } catch (error) {
      notify((error as Error).message, 'error')
    } finally {
      working.value = false
    }
  }
  async function applyBrowserLanguage(id: string, restoring = false): Promise<boolean> {
    if (busy.value || !connected.value) return false
    working.value = true
    try {
      return await finishWrite(
        () =>
          api<{ message: string }>(
            restoring
              ? '/browser-language/backups/' + id + '/restore'
              : '/browser-language/' + id + '/apply',
            { method: 'POST', body: '{}' },
          ),
        (value) => value.message,
      )
    } finally {
      working.value = false
    }
  }
  async function restoreBrowserLanguage(id: string) {
    return applyBrowserLanguage(id, true)
  }
  return { previewBrowserLanguage, applyBrowserLanguage, restoreBrowserLanguage }
}
