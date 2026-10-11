import { shallowRef, ref, computed, onUnmounted } from 'vue'
import type {
  Bootstrap,
  FixId,
  RepairPlan,
  ScanReport,
  SetupJob,
  SetupPreview,
  SnapshotPreview,
  ProjectReport,
} from '../../../shared/types'
import { DIAGNOSTIC_CHECK_COUNT, samePreferences } from '../../../shared/types'
import type { GuardNotification } from '../../lib/notifications'
import { createLocalApi } from '../../lib/local-api'

/** Shared reactive state and local transport; feature modules receive this context explicitly. */
export function createGuardContext() {
  const boot = shallowRef<Bootstrap>()
  const report = shallowRef<ScanReport>()
  const plan = shallowRef<RepairPlan>()
  const setupPreview = shallowRef<SetupPreview>()
  const setupJob = shallowRef<SetupJob>()
  const snapshotPlan = shallowRef<SnapshotPreview>()
  const projectReport = shallowRef<ProjectReport>()
  const remoteWorking = ref(false)
  const configurationCurrent = ref(true)
  const loading = ref(true)
  const scanning = ref(false)
  const working = ref(false)
  const connected = ref(false)
  const error = ref('')
  const progress = ref({ completed: 0, total: DIAGNOSTIC_CHECK_COUNT, current: '准备检测' })
  const toast = ref<GuardNotification>()
  const session = { token: '', mounted: true }
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
      setupJob.value?.status === 'running' ||
      boot.value?.service?.closing === true,
  )
  function notify(message: string, kind: 'success' | 'error' = 'success') {
    if (!session.mounted) return
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
    token: () => session.token,
    connection: (value, message) => {
      if (!session.mounted) return
      connected.value = value
      error.value = message
    },
  })
  async function refresh() {
    const value = await api<Bootstrap>('/bootstrap')
    if (!session.mounted) return
    session.token = value.token
    const previous = boot.value
    const followLatest = !report.value || report.value.id === previous?.reports[0]?.id
    boot.value = value
    configurationCurrent.value = true
    setupJob.value = value.workflows?.[0]
    remoteWorking.value = Boolean(
      value.service?.activity && value.service.activity.kind !== 'setup',
    )
    if (followLatest) report.value = value.reports[0]
    connected.value = true
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
  onUnmounted(() => {
    session.mounted = false
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
    remoteWorking,
    configurationCurrent,
    loading,
    scanning,
    working,
    connected,
    error,
    progress,
    toast,
    selected,
    reportConfigurationChanged,
    canRepair,
    availableFixes,
    busy,
    session,
    api,
    notify,
    refresh,
    finishWrite,
  }
}
export type GuardContext = ReturnType<typeof createGuardContext>
