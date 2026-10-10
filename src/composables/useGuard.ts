import { shallowRef, ref, computed, onUnmounted } from 'vue'
import type {
  Bootstrap,
  FixId,
  Preferences,
  RepairPlan,
  ScanReport,
  BackupSummary,
  SetupJob,
  SetupPreview,
  SetupRequest,
  SnapshotPreview,
  ProjectReport,
  ManualReview,
  ManualReviewRequest,
} from '../../shared/types'
import { DIAGNOSTIC_CHECK_COUNT } from '../../shared/types'
import { browserSnapshot } from './browser'
interface Job {
  id: string
  status: 'running' | 'complete' | 'failed'
  completed: number
  total: number
  current: string
  report?: ScanReport
  error?: string
}
export function useGuard() {
  const boot = shallowRef<Bootstrap>()
  const report = shallowRef<ScanReport>()
  const plan = shallowRef<RepairPlan>()
  const setupPreview = shallowRef<SetupPreview>()
  const setupJob = shallowRef<SetupJob>()
  const snapshotPlan = shallowRef<SnapshotPreview>()
  const projectReport = shallowRef<ProjectReport>()
  let monitorVersion = 0
  const loading = ref(true)
  const scanning = ref(false)
  const working = ref(false)
  const connected = ref(false)
  const error = ref('')
  const progress = ref({ completed: 0, total: DIAGNOSTIC_CHECK_COUNT, current: '准备检测' })
  const toast = ref<{ message: string; kind: 'success' | 'error' }>()
  let token = ''
  let mounted = true
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  const selected = ref<FixId[]>([])
  const canRepair = computed(
    () =>
      Boolean(
        connected.value &&
        report.value &&
        boot.value &&
        report.value.id === boot.value.reports[0]?.id,
      ) && JSON.stringify(report.value?.preferences) === JSON.stringify(boot.value?.preferences),
  )
  const availableFixes = computed(() =>
    canRepair.value
      ? [...new Set(report.value?.checks.flatMap((check) => check.fixIds) ?? [])]
      : [],
  )
  const busy = computed(
    () => scanning.value || working.value || setupJob.value?.status === 'running',
  )
  function notify(message: string, kind: 'success' | 'error' = 'success') {
    if (toastTimer) clearTimeout(toastTimer)
    toast.value = { message, kind }
    toastTimer = setTimeout(
      () => {
        toast.value = undefined
      },
      kind === 'error' ? 10000 : 6000,
    )
  }
  async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
    let response: Response
    try {
      response = await fetch('/api' + url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-CG-Token': token } : {}),
          ...options.headers,
        },
        signal: AbortSignal.timeout(20000),
      })
    } catch (failure) {
      connected.value = false
      const timedOut =
        failure instanceof Error && ['TimeoutError', 'AbortError'].includes(failure.name)
      error.value = timedOut
        ? '本机服务响应超时，请检查启动窗口后重试。'
        : '无法连接本机服务，请检查启动窗口，并确认工具仍在运行。'
      throw new Error(error.value)
    }
    connected.value = true
    error.value = ''
    let value: T & { error?: string }
    try {
      value = (await response.json()) as T & { error?: string }
    } catch {
      throw new Error('本机服务返回了无法读取的响应，请重新启动工具后重试。')
    }
    if (!response.ok) throw new Error(value.error || '本机服务没有完成操作')
    return value
  }
  async function refresh() {
    const value = await api<Bootstrap>('/bootstrap')
    token = value.token
    boot.value = value
    setupJob.value = value.workflows?.[0]
    if (!report.value) report.value = value.reports[0]
    connected.value = true
  }
  async function initialize() {
    loading.value = true
    error.value = ''
    try {
      await refresh()
      if (setupJob.value?.status === 'running') void monitorSetup(setupJob.value)
    } catch (failure) {
      error.value = (failure as Error).message || '本机服务未连接，请检查启动窗口'
    } finally {
      loading.value = false
    }
  }
  async function updateManualReviews(
    path: string,
    method: 'POST' | 'PUT',
    body: unknown,
  ): Promise<boolean> {
    if (busy.value) return false
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
  async function scan(network = false, passes = 3) {
    if (busy.value) return
    scanning.value = true
    progress.value = {
      completed: 0,
      total: DIAGNOSTIC_CHECK_COUNT * passes,
      current: network ? '正在检查浏览器出口与 WebRTC' : '正在读取浏览器设置',
    }
    try {
      const browser = await browserSnapshot(network)
      const job = await api<Job>('/scans', {
        method: 'POST',
        body: JSON.stringify({ network, browser, passes }),
      })
      const deadline = Date.now() + 180000
      let state = job
      while (mounted && state.status === 'running') {
        progress.value = { completed: state.completed, total: state.total, current: state.current }
        if (Date.now() > deadline) throw new Error('检测超过 180 秒，请检查本机服务后重新检测')
        await new Promise((resolve) => setTimeout(resolve, 300))
        state = await api<Job>('/scans/' + job.id)
      }
      if (state.status === 'failed') throw new Error(state.error || '检测没有完成')
      if (state.report) {
        report.value = state.report
        selected.value = []
        progress.value = { completed: state.total, total: state.total, current: '检测完成' }
        await refresh()
        notify(
          `检测完成：${state.report.counts.pass} 项通过，${state.report.counts.warn + state.report.counts.fail} 项需关注。`,
        )
      }
    } catch (failure) {
      notify((failure as Error).message, 'error')
    } finally {
      scanning.value = false
    }
  }
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
    if (!plan.value || busy.value) return false
    working.value = true
    try {
      const backup = await api<BackupSummary>('/repairs/' + plan.value.id + '/apply', {
        method: 'POST',
        body: '{}',
      })
      plan.value = undefined
      selected.value = []
      await refresh()
      notify(`已修复 ${backup.files.length} 个配置文件，并保存原始备份。`)
      return true
    } catch (failure) {
      notify((failure as Error).message, 'error')
      return false
    } finally {
      working.value = false
    }
  }
  async function restore(id: string): Promise<boolean> {
    if (busy.value) return false
    working.value = true
    try {
      await api('/backups/' + id + '/restore', { method: 'POST', body: '{}' })
      await refresh()
      notify('已恢复原始配置。请重新启动终端让环境变量生效。')
      return true
    } catch (failure) {
      notify((failure as Error).message, 'error')
      return false
    } finally {
      working.value = false
    }
  }
  async function savePreferences(value: Preferences): Promise<boolean> {
    if (busy.value) return false
    working.value = true
    try {
      await api('/preferences', { method: 'PUT', body: JSON.stringify(value) })
      selected.value = []
      plan.value = undefined
      await refresh()
      notify('检测偏好已保存，重新检测后生效。')
      return true
    } catch (failure) {
      notify((failure as Error).message, 'error')
      return false
    } finally {
      working.value = false
    }
  }
  async function captureSnapshot(): Promise<void> {
    if (busy.value) return
    working.value = true
    try {
      await api('/snapshots', { method: 'POST', body: '{}' })
      await refresh()
      notify('当前配置与检测偏好已保存为完整快照。')
    } catch (failure) {
      notify((failure as Error).message, 'error')
    } finally {
      working.value = false
    }
  }
  async function previewSnapshot(id: string): Promise<void> {
    if (busy.value) return
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
    if (!snapshotPlan.value || busy.value) return false
    working.value = true
    try {
      await api('/snapshot-plans/' + snapshotPlan.value.id + '/restore', {
        method: 'POST',
        body: '{}',
      })
      snapshotPlan.value = undefined
      plan.value = undefined
      selected.value = []
      await refresh()
      notify('配置快照已完整还原，还原前的配置也已保存为快照。')
      return true
    } catch (failure) {
      notify((failure as Error).message, 'error')
      return false
    } finally {
      working.value = false
    }
  }
  async function scanProject(path: string): Promise<void> {
    if (busy.value) return
    working.value = true
    try {
      projectReport.value = await api<ProjectReport>('/projects/scan', {
        method: 'POST',
        body: JSON.stringify({ path }),
      })
      notify('项目配置扫描完成。')
    } catch (failure) {
      notify((failure as Error).message, 'error')
    } finally {
      working.value = false
    }
  }
  async function prepareSetup(request: SetupRequest): Promise<boolean> {
    if (busy.value) return false
    working.value = true
    setupPreview.value = undefined
    try {
      setupPreview.value = await api<SetupPreview>('/setup/preview', {
        method: 'POST',
        body: JSON.stringify({ ...request, browser: await browserSnapshot(false) }),
      })
      return true
    } catch (failure) {
      notify((failure as Error).message, 'error')
      return false
    } finally {
      working.value = false
    }
  }
  async function startSetup(): Promise<boolean> {
    if (!setupPreview.value || busy.value) return false
    working.value = true
    try {
      const job = await api<SetupJob>('/setup/' + setupPreview.value.id + '/start', {
        method: 'POST',
        body: '{}',
      })
      setupJob.value = job
      selected.value = []
      plan.value = undefined
      void monitorSetup(job)
      return true
    } catch (failure) {
      notify((failure as Error).message, 'error')
      return false
    } finally {
      working.value = false
    }
  }
  async function monitorSetup(initial: SetupJob) {
    const version = ++monitorVersion
    let state = initial
    try {
      while (mounted && version === monitorVersion && state.status === 'running') {
        await new Promise((resolve) => setTimeout(resolve, 400))
        if (!mounted || version !== monitorVersion) return
        state = await api<SetupJob>('/setup/' + initial.id)
        setupJob.value = state
      }
      if (!mounted || version !== monitorVersion) return
      await refresh()
      if (state.reportId)
        report.value = boot.value?.reports.find((value) => value.id === state.reportId)
      const failed = state.nodes.filter((node) => node.enabled && node.status === 'skipped').length
      notify(
        state.status === 'interrupted'
          ? state.error || '配置流程中断，请重新预览'
          : failed
            ? `配置流程已结束，${failed} 个节点未成功并已跳过，请查看流程结果。`
            : '所选配置已处理完成，复检报告已更新。',
        failed || state.status === 'interrupted' ? 'error' : 'success',
      )
    } catch (failure) {
      notify((failure as Error).message + ' 配置仍在本机执行，重新连接后可查看进度。', 'error')
    }
  }
  function toggleFix(id: FixId) {
    if (!canRepair.value) return
    selected.value = selected.value.includes(id)
      ? selected.value.filter((item) => item !== id)
      : [...selected.value, id]
  }
  onUnmounted(() => {
    mounted = false
    if (toastTimer) clearTimeout(toastTimer)
  })
  return {
    boot,
    report,
    plan,
    setupPreview,
    setupJob,
    snapshotPlan,
    projectReport,
    captureSnapshot,
    saveManualReview,
    resetManualReviews,
    importLegacyReviews,
    previewSnapshot,
    restoreSnapshot,
    scanProject,
    prepareSetup,
    startSetup,
    loading,
    scanning,
    working,
    connected,
    error,
    progress,
    toast,
    selected,
    availableFixes,
    canRepair,
    busy,
    initialize,
    scan,
    preview,
    apply,
    restore,
    savePreferences,
    notify,
    toggleFix,
  }
}
