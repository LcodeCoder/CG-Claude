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
  SnapshotSummary,
  ProjectReport,
  ManualReview,
  ManualReviewRequest,
} from '../../shared/types'
import { DIAGNOSTIC_CHECK_COUNT, samePreferences } from '../../shared/types'
import { browserSnapshot } from './browser'
import { createLocalApi } from '../lib/local-api'
import type { ScanJob, ServiceStatus } from '../../shared/service-status'
import type { ConnectionRequest } from '../../shared/connections'
import type { TranslationRequest, TranslationTestResult } from '../../shared/translation'
export function useGuard() {
  const boot = shallowRef<Bootstrap>()
  const report = shallowRef<ScanReport>()
  const plan = shallowRef<RepairPlan>()
  const setupPreview = shallowRef<SetupPreview>()
  const setupJob = shallowRef<SetupJob>()
  const snapshotPlan = shallowRef<SnapshotPreview>()
  const projectReport = shallowRef<ProjectReport>()
  let monitorVersion = 0
  let scanMonitorVersion = 0
  let serviceMonitorVersion = 0
  const remoteWorking = ref(false)
  const configurationCurrent = ref(true)
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
  const reportConfigurationChanged = computed(() =>
    Boolean(
      report.value &&
      boot.value &&
      (!configurationCurrent.value ||
        !report.value.configurationFingerprint ||
        report.value.configurationFingerprint !== boot.value.configurationFingerprint),
    ),
  )
  const canRepair = computed(
    () =>
      Boolean(
        connected.value &&
        !reportConfigurationChanged.value &&
        report.value &&
        boot.value &&
        report.value.id === boot.value.reports[0]?.id,
      ) && samePreferences(report.value?.preferences, boot.value?.preferences),
  )
  const availableFixes = computed(() =>
    canRepair.value
      ? [...new Set(report.value?.checks.flatMap((check) => check.fixIds) ?? [])]
      : [],
  )
  const busy = computed(
    () =>
      scanning.value ||
      working.value ||
      remoteWorking.value ||
      setupJob.value?.status === 'running',
  )
  function notify(message: string, kind: 'success' | 'error' = 'success') {
    if (!mounted) return
    if (toastTimer) clearTimeout(toastTimer)
    toast.value = { message, kind }
    toastTimer = setTimeout(
      () => {
        toast.value = undefined
      },
      kind === 'error' ? 10000 : 6000,
    )
  }
  const api = createLocalApi({
    token: () => token,
    connection: (value, message) => {
      if (!mounted) return
      connected.value = value
      error.value = message
    },
  })
  async function refresh() {
    const value = await api<Bootstrap>('/bootstrap')
    token = value.token
    boot.value = value
    configurationCurrent.value = true
    setupJob.value = value.workflows?.[0]
    remoteWorking.value = Boolean(
      value.service?.activity && value.service.activity.kind !== 'setup',
    )
    if (!report.value) report.value = value.reports[0]
    connected.value = true
  }
  async function initialize() {
    loading.value = true
    error.value = ''
    try {
      await refresh()
      if (setupJob.value?.status === 'running') void monitorSetup(setupJob.value)
      else if (boot.value?.service?.scan) void monitorScan(boot.value.service.scan)
      else if (boot.value?.service?.activity) void monitorService()
    } catch (failure) {
      error.value = (failure as Error).message || '本机服务未连接，请检查启动窗口'
    } finally {
      loading.value = false
    }
  }
  async function finishWrite<T>(
    operation: () => Promise<T>,
    saved: (value: T) => string,
    complete?: () => void,
  ): Promise<boolean> {
    let result: T
    try {
      result = await operation()
    } catch (failure) {
      notify((failure as Error).message, 'error')
      return false
    }
    complete?.()
    configurationCurrent.value = false
    try {
      await refresh()
      notify(saved(result))
    } catch {
      notify(saved(result) + ' 界面刷新未完成，重新连接后查看。', 'error')
    }
    return true
  }
  async function monitorService() {
    const version = ++serviceMonitorVersion
    try {
      while (mounted && version === serviceMonitorVersion) {
        const state = await api<ServiceStatus>('/status')
        if (!mounted || version !== serviceMonitorVersion) return
        if (state.scan) {
          remoteWorking.value = false
          void monitorScan(state.scan)
          return
        }
        if (state.activity?.kind === 'setup') {
          await refresh()
          if (setupJob.value?.status === 'running') void monitorSetup(setupJob.value)
          return
        }
        if (!state.activity) {
          await refresh()
          remoteWorking.value = false
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 700))
      }
    } catch (failure) {
      notify((failure as Error).message, 'error')
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
  async function monitorScan(initial: ScanJob) {
    const version = ++scanMonitorVersion
    scanning.value = true
    let state = initial
    try {
      while (mounted && version === scanMonitorVersion && state.status === 'running') {
        progress.value = { completed: state.completed, total: state.total, current: state.current }
        await new Promise((resolve) => setTimeout(resolve, 300))
        if (!mounted || version !== scanMonitorVersion) return
        state = await api<ScanJob>('/scans/' + initial.id)
      }
      if (!mounted || version !== scanMonitorVersion) return
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
      if (version === scanMonitorVersion) {
        scanning.value = false
        remoteWorking.value = false
      }
    }
  }
  async function scan(network = false, passes = 3) {
    if (busy.value || !connected.value) return
    scanning.value = true
    progress.value = {
      completed: 0,
      total: DIAGNOSTIC_CHECK_COUNT * passes,
      current: network ? '正在检查浏览器出口与 WebRTC' : '正在读取浏览器设置',
    }
    try {
      const browser = await browserSnapshot(network)
      const job = await api<ScanJob>('/scans', {
        method: 'POST',
        body: JSON.stringify({ network, browser, passes }),
      })
      await monitorScan(job)
    } catch (failure) {
      notify((failure as Error).message, 'error')
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
        body: JSON.stringify({
          ...request,
          browser: await browserSnapshot(
            request.preferences.timezoneMode === 'exit' &&
              Boolean(request.timezone?.system || request.timezone?.terminal),
          ),
        }),
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
    const submittedProbes = new Set<string>()
    try {
      while (mounted && version === monitorVersion && state.status === 'running') {
        await new Promise((resolve) => setTimeout(resolve, 400))
        if (!mounted || version !== monitorVersion) return
        state = await api<SetupJob>('/setup/' + initial.id)
        if (!mounted || version !== monitorVersion) return
        setupJob.value = state
        if (state.browserProbeId && !submittedProbes.has(state.browserProbeId)) {
          const probeId = state.browserProbeId
          const browser = await browserSnapshot(state.preferences.timezoneMode === 'exit')
          if (!mounted || version !== monitorVersion) return
          try {
            await api('/setup/' + initial.id + '/browser', {
              method: 'POST',
              body: JSON.stringify({ probeId, browser }),
            })
            submittedProbes.add(probeId)
          } catch {
            /* Continue monitoring; a missed probe remains unconfirmed in the report. */
          }
        }
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
      notify(
        (failure as Error).message + ' 流程由本机服务执行，重新连接后请核对实际进度。',
        'error',
      )
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
    monitorVersion++
    scanMonitorVersion++
    serviceMonitorVersion++
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
    previewConnection,
    applyConnection,
    saveManualReview,
    resetManualReviews,
    importLegacyReviews,
    previewSnapshot,
    restoreSnapshot,
    scanProject,
    prepareSetup,
    startSetup,
    loading,
    remoteWorking,
    scanning,
    working,
    connected,
    error,
    progress,
    toast,
    selected,
    availableFixes,
    canRepair,
    reportConfigurationChanged,
    busy,
    initialize,
    scan,
    preview,
    apply,
    restore,
    savePreferences,
    saveTranslation,
    testTranslation,
    notify,
    toggleFix,
  }
}
