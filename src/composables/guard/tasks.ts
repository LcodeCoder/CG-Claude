import type { SetupRequest, SetupPreview, SetupJob } from '../../../shared/types'
import type { ScanJob } from '../../../shared/service-status'
import { DIAGNOSTIC_CHECK_COUNT } from '../../../shared/types'
import { browserSnapshot } from '../browser'
import type { GuardMonitors } from './monitors'
import type { GuardContext } from './context'

export function createTasksActions(context: GuardContext, monitors: GuardMonitors) {
  const {
    busy,
    working,
    api,
    notify,
    connected,
    loading,
    error,
    boot,
    setupJob,
    scanning,
    progress,
    setupPreview,
    selected,
    plan,
    refresh,
  } = context
  async function initialize() {
    monitors.stop()
    loading.value = true
    error.value = ''
    try {
      await refresh()
      if (setupJob.value?.status === 'running') void monitors.monitorSetup(setupJob.value)
      else if (boot.value?.service?.scan) void monitors.monitorScan(boot.value.service.scan)
      else if (boot.value?.service?.activity) void monitors.monitorService()
    } catch (failure) {
      error.value = (failure as Error).message || '本机服务未连接，请检查启动窗口'
    } finally {
      loading.value = false
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
      await monitors.monitorScan(job)
    } catch (failure) {
      notify((failure as Error).message, 'error')
      scanning.value = false
    }
  }
  async function prepareSetup(request: SetupRequest): Promise<boolean> {
    if (busy.value || !connected.value) return false
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
      void monitors.monitorSetup(job)
      return true
    } catch (failure) {
      notify((failure as Error).message, 'error')
      return false
    } finally {
      working.value = false
    }
  }
  return { initialize, scan, prepareSetup, startSetup }
}
