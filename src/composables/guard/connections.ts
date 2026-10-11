import type { RepairPlan } from '../../../shared/types'
import type { ConnectionRequest } from '../../../shared/connections'
import type { GuardContext } from './context'

export function createConnectionActions(context: GuardContext) {
  const { busy, working, api, notify, connected, selected, plan, finishWrite } = context
  async function previewConnection(request: ConnectionRequest): Promise<RepairPlan | undefined> {
    if (busy.value || !connected.value) return
    working.value = true
    try {
      return await api<RepairPlan>('/connections/preview', {
        method: 'POST',
        body: JSON.stringify(request),
      })
    } catch (failure) {
      notify((failure as Error).message, 'error')
    } finally {
      working.value = false
    }
  }
  async function applyConnection(id: string): Promise<boolean> {
    if (busy.value || !connected.value) return false
    working.value = true
    try {
      return await finishWrite(
        () => api('/connections/' + id + '/apply', { method: 'POST', body: '{}' }),
        () => '连接设置已保存，修改前的快照与原始备份已保留。',
        () => {
          plan.value = undefined
          selected.value = []
        },
      )
    } finally {
      working.value = false
    }
  }
  return { previewConnection, applyConnection }
}
