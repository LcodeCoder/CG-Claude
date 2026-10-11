import { randomUUID } from 'node:crypto'
import { VersionChecker } from './version-check.js'
import type { Bootstrap, ScanRequest, SetupJob } from '../shared/types.js'
import type { ScanJob, ServiceStatus } from '../shared/service-status.js'
import { createContext, machineInfo } from './context.js'
import type { Context } from './context.js'
import { prepareCommandEnvironment } from './command-environment.js'
import { Storage } from './storage.js'
import { acquireServiceLock } from './lock.js'
import { OperationCoordinator } from './operations.js'
import { RepairEngine } from './repairs.js'
import { SnapshotEngine } from './snapshots.js'
import { TranslationService } from './translation.js'
import { BrowserLanguageEngine } from './browser-configuration.js'
import { SetupWorkflows } from './workflows.js'
import { runRepeatedDiagnostics, TOTAL_CHECKS } from './diagnostics.js'
import { describeConfigs } from './configs.js'
import { CONNECTION_FILE, describeConnectionConfiguration } from './connections.js'
import { claudeConfigurationScopeReason } from './configuration-scope.js'
import { readAllConfigs, configurationFingerprint, safeValue } from './safety.js'

/** Compose local services once. Transport adapters do not own task or configuration state. */
export async function createApplication(context?: Context, version = '0.0.0') {
  const ctx = context ?? createContext()
  if (!context) await prepareCommandEnvironment(ctx)
  const storage = new Storage(ctx)
  await storage.init()
  const releaseLock = await acquireServiceLock(ctx)
  const operations = new OperationCoordinator()
  const repairs = new RepairEngine(ctx, storage)
  const snapshots = new SnapshotEngine(ctx, storage)
  const versions = new VersionChecker(ctx, version)
  const translation = new TranslationService(storage)
  const browserLanguages = new BrowserLanguageEngine(ctx, storage)
  const workflows = new SetupWorkflows(ctx, storage, repairs, snapshots)
  try {
    await workflows.init()
  } catch (error) {
    await releaseLock()
    throw error
  }
  const scans = new Map<string, ScanJob>()
  function status(): ServiceStatus {
    const state = operations.status()
    if (state.activity?.kind === 'scan') {
      const scan = [...scans.values()].find((item) => item.status === 'running')
      return {
        ...state,
        activity: { ...state.activity, label: scan?.current || '正在准备检测', id: scan?.id },
        scan,
      }
    }
    if (state.activity?.kind === 'setup') {
      const job = workflows.list().find((item) => item.status === 'running')
      return {
        ...state,
        activity: {
          ...state.activity,
          label:
            job?.nodes.find((node) => ['running', 'retrying'].includes(node.status))?.title ||
            '正在配置',
          id: job?.id,
        },
      }
    }
    return state
  }
  async function bootstrap(token: string, runtime: Bootstrap['runtime']): Promise<Bootstrap> {
    const [
      preferences,
      files,
      reports,
      backups,
      manualReviews,
      snapshotList,
      translationSettings,
      languageSettings,
    ] = await Promise.all([
      storage.preferences(),
      readAllConfigs(ctx),
      storage.reports(),
      storage.backups(),
      storage.manualReviews(),
      snapshots.list(),
      translation.configuration(),
      browserLanguages.configuration(),
    ])
    const claude = files.find((file) => file.relative === CONNECTION_FILE)!
    return {
      service: status(),
      machine: machineInfo(ctx),
      preferences,
      configurationFingerprint: configurationFingerprint(files),
      connection: describeConnectionConfiguration(ctx, claude),
      files: describeConfigs(files, claudeConfigurationScopeReason(ctx, claude)),
      reports,
      backups,
      demo: ctx.demo,
      token,
      runtime,
      workflows: workflows.list(),
      snapshots: snapshotList,
      projectRoot: ctx.demo ? ctx.home : process.cwd(),
      manualReviews,
      translation: translationSettings,
      browserLanguages: languageSettings,
    }
  }
  function startScan(request: ScanRequest): Promise<ScanJob> {
    let preferences: Awaited<ReturnType<Storage['preferences']>>
    let previous: Awaited<ReturnType<Storage['reports']>>[number] | undefined
    return operations.start(
      { kind: 'scan', label: '正在准备检测' },
      async () => {
        preferences = await storage.preferences()
        previous = (await storage.reports())[0]
        const job: ScanJob = {
          id: randomUUID(),
          status: 'running',
          completed: 0,
          total: TOTAL_CHECKS * (request.passes ?? 1),
          current: '正在读取本机配置',
        }
        if (scans.size >= 30) {
          const oldest = [...scans].find(([, item]) => item.status !== 'running')
          if (oldest) scans.delete(oldest[0])
        }
        scans.set(job.id, job)
        return job
      },
      async (job) => {
        const report = await runRepeatedDiagnostics(
          ctx,
          preferences,
          request,
          (completed, total, current) => Object.assign(job, { completed, total, current }),
          previous,
        )
        await storage.saveReport(report)
        Object.assign(job, { status: 'complete', report })
      },
      (job, error) => {
        Object.assign(job, {
          status: 'failed',
          error: safeValue(error instanceof Error ? error.message : '检测未完成', 400),
        })
      },
    )
  }
  async function startSetup(previewId: string): Promise<{ job: SetupJob; created: boolean }> {
    const existing = workflows.forPreview(previewId)
    if (existing) return { job: existing, created: false }
    const job = await operations.start(
      { kind: 'setup', label: '正在准备配置' },
      () => workflows.create(previewId),
      (value) => workflows.execute(value),
      async (value, error) => {
        value.status = 'interrupted'
        value.completedAt = new Date().toISOString()
        value.error = safeValue(error instanceof Error ? error.message : '配置流程中断', 400)
        await storage.saveWorkflows(workflows.list()).catch(() => {})
      },
    )
    return { job, created: true }
  }
  const mutate = <T>(operation: () => Promise<T>) =>
    operations.run({ kind: 'mutation', label: '正在处理本机操作' }, operation)
  return {
    ctx,
    storage,
    repairs,
    snapshots,
    translation,
    versions,
    browserLanguages,
    workflows,
    operations,
    status,
    bootstrap,
    mutate,
    startScan,
    startSetup,
    scan: (id: string) => scans.get(id),
    releaseLock,
  }
}
export type Application = Awaited<ReturnType<typeof createApplication>>
