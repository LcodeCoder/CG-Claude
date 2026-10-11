import type { Preferences } from '../../../shared/types'
import type { LocalActionId, LocalActionResult } from '../../../shared/local-actions'
import type { GuardContext } from './context'

export function createPreferencesActions(context: GuardContext) {
  const { busy, working, api, notify, connected, selected, plan, finishWrite } = context
  async function savePreferences(value: Preferences): Promise<boolean> {
    if (busy.value || !connected.value) return false
    working.value = true
    try {
      return await finishWrite(
        () => api('/preferences', { method: 'PUT', body: JSON.stringify(value) }),
        () => '检测偏好已保存，重新检测后生效。',
        () => {
          plan.value = undefined
          selected.value = []
        },
      )
    } finally {
      working.value = false
    }
  }
  async function openLocalAction(action: LocalActionId): Promise<boolean> {
    if (!connected.value || busy.value) return false
    try {
      const result = await api<LocalActionResult>('/local-actions', {
        method: 'POST',
        body: JSON.stringify({ action }),
      })
      notify(result.message)
      return result.opened
    } catch (error) {
      notify((error as Error).message, 'error')
      return false
    }
  }
  return { savePreferences, openLocalAction }
}
