import type { SnapshotSummary, SnapshotPreview } from '../../../shared/types'
import type { GuardContext } from './context'

export function createSnapshotsActions(context: GuardContext) {
  const { busy, working, api, notify, connected, snapshotPlan, plan, selected, finishWrite } =
    context
  async function captureSnapshot(): Promise<void> {
    if (busy.value || !connected.value) return
    working.value = true
    try {
      await finishWrite(
        () => api<SnapshotSummary>('/snapshots', { method: 'POST', body: '{}' }),
        (snapshot) =>
          snapshot.excludedFiles.length
            ? `快照已保存；${snapshot.excludedFiles.length} 个文件未包含，可在快照详情中查看。`
            : '当前配置与检测偏好已保存为完整快照。',
      )
    } finally {
      working.value = false
    }
  }
  async function previewSnapshot(id: string): Promise<void> {
    if (busy.value || !connected.value) return
    working.value = true
    try {
      snapshotPlan.value = await api<SnapshotPreview>('/snapshots/' + id + '/preview', {
        method: 'POST',
        body: '{}',
      })
    } catch (failure) {
      notify((failure as Error).message, 'error')
    } finally {
      working.value = false
    }
  }
  async function restoreSnapshot(): Promise<boolean> {
    if (!snapshotPlan.value || busy.value || !connected.value) return false
    working.value = true
    const id = snapshotPlan.value.id
    try {
      return await finishWrite(
        () => api('/snapshot-plans/' + id + '/restore', { method: 'POST', body: '{}' }),
        () => '配置快照已还原，还原前的配置也已保存为快照。',
        () => {
          snapshotPlan.value = undefined
          plan.value = undefined
          selected.value = []
        },
      )
    } finally {
      working.value = false
    }
  }
  return { captureSnapshot, previewSnapshot, restoreSnapshot }
}
