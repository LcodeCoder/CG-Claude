import { onUnmounted } from 'vue'
import type { SetupJob } from '../../../shared/types'
import type { ScanJob, ServiceStatus } from '../../../shared/service-status'
import { browserSnapshot } from '../browser'
import type { GuardContext } from './context'

export function createGuardMonitors(context: GuardContext) {
  const {
    session,
    api,
    notify,
    refresh,
    boot,
    report,
    setupJob,
    scanning,
    remoteWorking,
    selected,
    progress,
  } = context
  let monitorVersion = 0
  let scanMonitorVersion = 0
  let serviceMonitorVersion = 0
  async function monitorService() {
    const version = ++serviceMonitorVersion
    try {
      while (session.mounted && version === serviceMonitorVersion) {
        const state = await api<ServiceStatus>('/status')
        if (!session.mounted || version !== serviceMonitorVersion) return
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
      if (session.mounted && version === serviceMonitorVersion)
        notify((failure as Error).message, 'error')
    }
  }
  async function monitorScan(initial: ScanJob) {
    const version = ++scanMonitorVersion
    scanning.value = true
    let state = initial
    try {
      while (session.mounted && version === scanMonitorVersion && state.status === 'running') {
        progress.value = { completed: state.completed, total: state.total, current: state.current }
        await new Promise((resolve) => setTimeout(resolve, 300))
        if (!session.mounted || version !== scanMonitorVersion) return
        state = await api<ScanJob>('/scans/' + initial.id)
      }
      if (!session.mounted || version !== scanMonitorVersion) return
      if (state.status === 'failed') throw new Error(state.error || '检测没有完成')
      if (state.report) {
        report.value = state.report
        selected.value = []
        progress.value = { completed: state.total, total: state.total, current: '检测完成' }
        await refresh()
        if (!session.mounted || version !== scanMonitorVersion) return
        notify(
          `检测完成：${state.report.counts.pass} 项通过，${state.report.counts.warn + state.report.counts.fail} 项需关注。`,
        )
      }
    } catch (failure) {
      if (session.mounted && version === scanMonitorVersion)
        notify((failure as Error).message, 'error')
    } finally {
      if (version === scanMonitorVersion) {
        scanning.value = false
        remoteWorking.value = false
      }
    }
  }
  async function monitorSetup(initial: SetupJob) {
    const version = ++monitorVersion
    let state = initial
    const submittedProbes = new Set<string>()
    try {
      while (session.mounted && version === monitorVersion && state.status === 'running') {
        await new Promise((resolve) => setTimeout(resolve, 400))
        if (!session.mounted || version !== monitorVersion) return
        state = await api<SetupJob>('/setup/' + initial.id)
        if (!session.mounted || version !== monitorVersion) return
        setupJob.value = state
        if (state.browserProbeId && !submittedProbes.has(state.browserProbeId)) {
          const probeId = state.browserProbeId
          const browser = await browserSnapshot(state.preferences.timezoneMode === 'exit')
          if (!session.mounted || version !== monitorVersion) return
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
      if (!session.mounted || version !== monitorVersion) return
      await refresh()
      if (!session.mounted || version !== monitorVersion) return
      if (state.reportId)
        report.value = boot.value?.reports.find((value) => value.id === state.reportId)
      const failed = state.nodes.filter((node) => node.enabled && node.status === 'skipped').length
      notify(
        state.status === 'interrupted'
          ? state.error || '配置流程中断，请重新预览'
          : failed
            ? `配置流程已结束，${failed} 项未完成，请查看执行记录。`
            : '所选配置已处理完成，复检报告已更新。',
        failed || state.status === 'interrupted' ? 'error' : 'success',
      )
    } catch (failure) {
      if (!session.mounted || version !== monitorVersion) return
      notify(
        (failure as Error).message + ' 流程由本机服务执行，重新连接后请核对实际进度。',
        'error',
      )
    }
  }
  function stop() {
    monitorVersion++
    scanMonitorVersion++
    serviceMonitorVersion++
    scanning.value = false
    remoteWorking.value = false
  }
  onUnmounted(stop)
  return { monitorService, monitorScan, monitorSetup, stop }
}
export type GuardMonitors = ReturnType<typeof createGuardMonitors>
