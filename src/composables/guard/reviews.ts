import type { ManualReview, ManualReviewRequest } from '../../../shared/types'
import type { GuardContext } from './context'

export function createReviewsActions(context: GuardContext) {
  const { busy, working, api, boot, notify, connected } = context
  async function updateManualReviews(
    path: string,
    method: 'POST' | 'PUT',
    body: unknown,
  ): Promise<boolean> {
    if (busy.value || !connected.value) return false
    working.value = true
    try {
      const reviews = await api<ManualReview[]>(path, { method, body: JSON.stringify(body) })
      if (boot.value) boot.value = { ...boot.value, manualReviews: reviews }
      return true
    } catch (failure) {
      notify((failure as Error).message, 'error')
      return false
    } finally {
      working.value = false
    }
  }
  async function saveManualReview(request: ManualReviewRequest): Promise<boolean> {
    const saved = await updateManualReviews('/manual-reviews', 'PUT', request)
    if (saved) notify('复核记录已保存在本机。')
    return saved
  }
  async function resetManualReviews(): Promise<boolean> {
    const saved = await updateManualReviews('/manual-reviews/reset', 'POST', {})
    if (saved) notify('已重置本机人工复核记录。')
    return saved
  }
  async function importLegacyReviews() {
    if (!connected.value) return
    try {
      const legacy = localStorage.getItem('claude-guard-checklist')
      if (!legacy) return
      const value: unknown = JSON.parse(legacy)
      if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) return
      const saved = await updateManualReviews('/manual-reviews/import', 'POST', { ids: value })
      if (saved) localStorage.removeItem('claude-guard-checklist')
    } catch {
      // Keep old storage intact if it cannot be read or migrated.
    }
  }
  return { saveManualReview, resetManualReviews, importLegacyReviews }
}
