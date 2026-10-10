import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type {
  FixId,
  SetupJob,
  SetupNode,
  SetupNodeId,
  SetupPreview,
  SetupRequest,
} from '../shared/types.js'
import { fixIds, fixLabels, SETUP_MAX_RETRIES } from '../shared/types.js'
import type { Context } from './context.js'
import { configTargets } from './context.js'
import { runRepeatedDiagnostics } from './diagnostics.js'
import { proxyKeys, shellAssignments } from './configs.js'
import { configurationState, readAllConfigs, safeValue } from './safety.js'
import type { ConfigContent, ConfigurationState } from './safety.js'
import { NoRepairChangesError, RepairEngine } from './repairs.js'
import type { Storage } from './storage.js'
import type { SnapshotEngine } from './snapshots.js'

export type NodeOperation = (node: SetupNode) => Promise<string>
interface SequenceOptions {
  publish: () => Promise<void>
  wait?: (retries: number) => Promise<void>
}
// A successful write is never repeated because publishing progress failed.
export async function runSequence(
  job: SetupJob,
  operations: Partial<Record<SetupNodeId, NodeOperation>>,
  options: SequenceOptions,
) {
  for (const node of job.nodes) {
    if (!node.enabled) {
      node.status = 'skipped'
      node.message = node.note || '本次未选择此项'
      node.completedAt = new Date().toISOString()
      await options.publish()
      continue
    }
    for (let attempt = 1; attempt <= SETUP_MAX_RETRIES + 1; attempt++) {
      node.status = 'running'
      node.attempts = attempt
      node.retries = attempt - 1
      node.startedAt ??= new Date().toISOString()
      node.message = attempt === 1 ? '正在执行' : `正在进行第 ${attempt - 1} 次重试`
      await options.publish()
      let failure: unknown
      let succeeded = false
      try {
        const operation = operations[node.id]
        if (!operation) throw new Error('此配置节点没有执行方法')
        node.message = await operation(node)
        succeeded = true
      } catch (error) {
        failure = error
      }
      if (succeeded) {
        node.status = 'succeeded'
        node.completedAt = new Date().toISOString()
        node.history.push({
          at: node.completedAt,
          attempt,
          result: 'succeeded',
          message: node.message,
        })
        await options.publish()
        break
      }
      node.message = safeValue(
        failure instanceof Error ? failure.message : '配置未完成，请查看本机权限与配置格式',
        400,
      )
      node.history.push({
        at: new Date().toISOString(),
        attempt,
        result: 'failed',
        message: node.message,
      })
      if (attempt <= SETUP_MAX_RETRIES) {
        node.status = 'retrying'
        await options.publish()
        await (options.wait?.(attempt) ?? delay(Math.min(800 * attempt, 2400)))
      } else {
        node.status = 'skipped'
        node.message = `已重试 ${SETUP_MAX_RETRIES} 次仍未成功，跳过此节点。${node.message}`
        node.completedAt = new Date().toISOString()
        await options.publish()
      }
    }
  }
  job.status = 'complete'
  job.completedAt = new Date().toISOString()
  await options.publish()
}
interface PreparedSetup {
  preview: SetupPreview
  request: SetupRequest
  baselines: Map<string, ConfigurationState>
  jobId?: string
}
function matchesBaseline(file: ConfigContent, baseline?: ConfigurationState): boolean {
  const current = configurationState(file)
  return (
    baseline !== undefined &&
    baseline.contentHash === current.contentHash &&
    baseline.mode === current.mode &&
    baseline.editable === current.editable &&
    baseline.error === current.error
  )
}
const orderedFixes: FixId[] = [
  'shell-proxy',
  'npm-proxy',
  'git-proxy',
  'shell-endpoint',
  'claude-endpoint',
  'npm-tls',
  'claude-privacy',
]
function applies(id: FixId, relative: string) {
  const kind = configTargets.find((target) => target.relative === relative)!.kind
  return kind === 'shell'
    ? id.startsWith('shell-')
    : kind === 'npm'
      ? id === 'npm-proxy' || id === 'npm-tls'
      : kind === 'git'
        ? id === 'git-proxy'
        : id.startsWith('claude-')
}
export class SetupWorkflows {
  private previews = new Map<string, PreparedSetup>()
  private jobs: SetupJob[] = []
  constructor(
    private ctx: Context,
    private storage: Storage,
    private repairs: RepairEngine,
    private snapshots: SnapshotEngine,
  ) {}
  async init() {
    this.jobs = await this.storage.workflows()
    for (const job of this.jobs)
      if (job.status === 'running') {
        job.status = 'interrupted'
        job.error = '上次配置流程被中断。已完成的配置和备份保留，请重新预览后开始新流程。'
        job.completedAt = new Date().toISOString()
        for (const node of job.nodes)
          if (['pending', 'running', 'retrying'].includes(node.status)) {
            node.status = 'skipped'
            node.message = '流程中断，未继续执行'
            node.completedAt = job.completedAt
          }
      }
    await this.publish()
  }
  list() {
    return this.jobs
  }
  get(id: string) {
    return this.jobs.find((job) => job.id === id)
  }
  forPreview(id: string) {
    return this.jobs.find((job) => job.previewId === id)
  }
  private publish() {
    return this.storage.saveWorkflows(this.jobs)
  }
  private async checkShell(id: FixId) {
    if (!id.startsWith('shell-')) return
    for (const file of await readAllConfigs(this.ctx))
      if (applies(id, file.relative)) {
        const unsafe = shellAssignments(file.content ?? '').some(
          (item) =>
            !item.safe &&
            (id === 'shell-proxy' ? proxyKeys.test(item.key) : item.key === 'ANTHROPIC_BASE_URL'),
        )
        if (unsafe)
          throw new Error(
            `${file.display} 含条件、函数或复杂赋值，请手动处理相关配置后重新运行此节点`,
          )
      }
  }
  async preview(request: SetupRequest): Promise<SetupPreview> {
    if (request.preferences.expectedTimezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: request.preferences.expectedTimezone })
      } catch {
        throw new Error('期望时区不是有效的 IANA 时区')
      }
    }
    if (request.fixIds.some((id) => /-proxy$/.test(id)) && request.preferences.routeMode !== 'tun')
      throw new Error('只有 TUN 模式可选择移除代理配置')
    if (
      request.fixIds.some((id) => /-endpoint$/.test(id)) &&
      request.preferences.usageMode !== 'official'
    )
      throw new Error('只有官方默认 API 模式可选择恢复 API 地址')
    for (const [id, prepared] of this.previews)
      if (Date.parse(prepared.preview.expiresAt) < Date.now()) this.previews.delete(id)
    if (this.previews.size >= 30) throw new Error('配置预览过多，请完成现有流程或稍后重试')
    const files = await readAllConfigs(this.ctx)
    const baselines = new Map(files.map((file) => [file.relative, configurationState(file)]))
    const preview: SetupPreview = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      preferences: request.preferences,
      nodes: [
        {
          id: 'snapshot',
          title: '保存配置前快照',
          description: '记录可读取的本机配置与检测偏好，支持一次完整还原',
          enabled: true,
          files: [],
        },
        {
          id: 'preferences',
          title: '保存检测偏好',
          description: '记录网络模式、服务方式与隐私选择',
          enabled: true,
          files: [],
        },
        {
          id: 'inspect',
          title: '读取本机配置',
          description: '核对配置路径、读取权限和预览后的变化',
          enabled: true,
          files: [],
        },
      ],
      notes: [
        '每个节点首次执行失败后最多重试 3 次，仍未成功就跳过，继续下一个节点。',
        '每次写入前保存原始备份。密钥、Hooks、权限与其他未选字段会保留。',
        '终端环境变量需要重新打开终端才会生效。系统代理、TUN、DNS 和系统时区仍需在对应软件中配置。',
        '关闭使用指标会同时关闭功能旗标，Remote Control 可能不可用。已有隐私设置保留。',
      ],
    }
    for (const id of orderedFixes) {
      const node = {
        id,
        title: fixLabels[id],
        description: id === 'claude-privacy' ? '写入所选隐私设置' : '仅修改此次选择的配置字段',
        enabled: request.fixIds.includes(id),
        files: [],
        note: '',
      } as SetupPreview['nodes'][number]
      if (!node.enabled) node.note = '本次未选择；保留现有配置'
      else {
        try {
          await this.checkShell(id)
          const plan = await this.repairs.preview([id], request.preferences)
          node.files = plan.files
          this.repairs.discard(plan.id)
        } catch (error) {
          node.blocked = !(error instanceof NoRepairChangesError)
          node.note =
            error instanceof NoRepairChangesError
              ? '配置已符合所选目标，无需写入'
              : `执行时会重试；${safeValue((error as Error).message, 400)}`
        }
      }
      preview.nodes.push(node)
    }
    preview.nodes.push({
      id: 'verify',
      title: '复检并生成报告',
      description: '重新检测本机配置，保留仍需关注或人工确认的项目',
      enabled: true,
      files: [],
    })
    for (const file of await readAllConfigs(this.ctx))
      if (!matchesBaseline(file, baselines.get(file.relative)))
        throw new Error('配置在预览过程中发生变化，请重新生成预览')
    this.previews.set(preview.id, { preview, request, baselines })
    return preview
  }
  async create(id: string): Promise<SetupJob> {
    const existing = this.forPreview(id)
    if (existing) return existing
    const prepared = this.previews.get(id)
    if (!prepared || Date.parse(prepared.preview.expiresAt) < Date.now())
      throw new Error('配置预览已失效，请重新预览')
    for (const file of await readAllConfigs(this.ctx))
      if (!matchesBaseline(file, prepared.baselines.get(file.relative)))
        throw new Error(`${file.display} 在预览后发生变化，请重新预览`)
    const job: SetupJob = {
      id: randomUUID(),
      previewId: id,
      createdAt: new Date().toISOString(),
      status: 'running',
      preferences: prepared.request.preferences,
      nodes: prepared.preview.nodes.map((node) => ({
        ...node,
        status: 'pending',
        attempts: 0,
        retries: 0,
        message: '等待执行',
        history: [],
      })),
    }
    this.jobs = [job, ...this.jobs].slice(0, 20)
    try {
      await this.publish()
    } catch (error) {
      this.jobs = this.jobs.filter((item) => item.id !== job.id)
      throw error
    }
    prepared.jobId = job.id
    return job
  }
  async execute(job: SetupJob) {
    const prepared = this.previews.get(job.previewId)!
    const prefs = prepared.request.preferences
    const assertCurrent = async (id?: FixId) => {
      for (const file of await readAllConfigs(this.ctx))
        if (
          (!id || applies(id, file.relative)) &&
          !matchesBaseline(file, prepared.baselines.get(file.relative))
        )
          throw new Error(`${file.display} 被其他程序修改，请重新预览`)
    }
    const requireSnapshot = () => {
      if (!job.snapshotId) throw new Error('配置前快照尚未保存，无法继续修改本机配置')
    }
    const operations: Partial<Record<SetupNodeId, NodeOperation>> = {
      snapshot: async () => {
        await assertCurrent()
        const snapshot = await this.snapshots.capture('setup', '一键配置之前的完整快照')
        job.snapshotId = snapshot.id
        return `已保存 ${snapshot.files.length} 个配置位置与检测偏好${snapshot.excludedFiles.length ? `；${snapshot.excludedFiles.length} 个不可读文件已排除` : ''}`
      },
      preferences: async () => {
        requireSnapshot()
        await this.storage.savePreferences(prefs)
        return '检测偏好已保存'
      },
      inspect: async () => {
        await assertCurrent()
        const files = await readAllConfigs(this.ctx)
        return `已读取 ${files.length} 个配置位置；不可编辑的文件会在对应节点提示`
      },
      verify: async () => {
        const report = await runRepeatedDiagnostics(
          this.ctx,
          prefs,
          { network: false, passes: 3, browser: prepared.request.browser },
          () => {},
          (await this.storage.reports())[0],
        )
        await this.storage.saveReport(report)
        job.reportId = report.id
        return `复检完成：${report.counts.pass} 项通过，${report.counts.warn + report.counts.fail} 项需关注，${report.counts.manual + report.counts.skipped} 项待确认`
      },
    }
    for (const id of fixIds)
      operations[id] = async (node) => {
        requireSnapshot()
        await assertCurrent(id)
        await this.checkShell(id)
        let plan
        try {
          plan = await this.repairs.preview([id], prefs)
        } catch (error) {
          if (error instanceof NoRepairChangesError) return '配置已符合所选目标，无需写入'
          throw error
        }
        try {
          const { backup, files } = await this.repairs.applyWithState(plan.id, prefs)
          for (const file of files) prepared.baselines.set(file.relative, file.state)
          node.backupId = backup.id
          return `已修改 ${backup.files.length} 个配置文件，原始备份已保存`
        } finally {
          this.repairs.discard(plan.id)
        }
      }
    try {
      await runSequence(job, operations, { publish: () => this.publish() })
    } catch (error) {
      job.status = 'interrupted'
      job.completedAt = new Date().toISOString()
      job.error = `进度保存中断：${safeValue((error as Error).message, 400)}。已完成的写入和备份保留。`
      for (const node of job.nodes)
        if (['pending', 'running', 'retrying'].includes(node.status)) {
          node.status = 'skipped'
          node.message = '流程中断，请检查记录目录后重新预览'
          node.completedAt = job.completedAt
        }
      await this.publish().catch(() => {})
    }
  }
}
