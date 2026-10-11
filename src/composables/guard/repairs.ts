import type { RepairPlan, BackupSummary, FixId } from '../../../shared/types'
import type { GuardContext } from './context'

export function createRepairActions(context: GuardContext) {
  const { busy, working, api, notify, connected, selected, canRepair, plan, finishWrite } = context
  async function preview(): Promise<boolean> {
    if (!selected.value.length || !canRepair.value || busy.value) return false
    working.value = true
    try {
      plan.value = await api<RepairPlan>('/repairs/preview', {
        method: 'POST',
        body: JSON.stringify({ fixIds: selected.value }),
      })
      return true
    } catch (failure) {
      notify((failure as Error).message, 'error')
      return false
    } finally {
      working.value = false
    }
  }
  async function apply(): Promise<boolean> {
    if (!plan.value || busy.value || !connected.value) return false
    working.value = true
    const id = plan.value.id
    try {
      return await finishWrite(
        () => api<BackupSummary>('/repairs/' + id + '/apply', { method: 'POST', body: '{}' }),
        (backup) => `已修复 ${backup.files.length} 个配置文件，并保存原始备份。`,
        () => {
          plan.value = undefined
          selected.value = []
        },
      )
    } finally {
      working.value = false
    }
  }
  async function restore(id: string): Promise<boolean> {
    if (busy.value || !connected.value) return false
    working.value = true
    try {
      return await finishWrite(
        () => api('/backups/' + id + '/restore', { method: 'POST', body: '{}' }),
        () => '已恢复原始配置。请重新打开终端让环境变量生效。',
      )
    } finally {
      working.value = false
    }
  }
  function toggleFix(id: FixId) {
    if (!canRepair.value) return
    selected.value = selected.value.includes(id)
      ? selected.value.filter((item) => item !== id)
      : [...selected.value, id]
  }
  return { preview, apply, restore, toggleFix }
}
