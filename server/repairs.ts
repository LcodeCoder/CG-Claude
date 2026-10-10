import { privacyCompatibilityNote } from '../shared/privacy.js'
import { randomUUID } from 'node:crypto'
import type { FixId, Preferences, RepairPlan, BackupSummary } from '../shared/types.js'
import { fixLabels } from '../shared/types.js'
import { configTargets } from './context.js'
import type { Context } from './context.js'
import { hash, readAllConfigs, readConfig, writeConfig } from './safety.js'
import type { ConfigurationState } from './safety.js'
import { transformConfig } from './configs.js'
import { Storage } from './storage.js'
import type { BackupManifest } from './storage.js'

import { connectionRequestSchema } from '../shared/connections.js'
import type { ConnectionRequest } from '../shared/connections.js'
import { prepareConnectionEdit, validateConnectionFiles } from './connections.js'
import type { SnapshotEngine } from './snapshots.js'
import { claudeConfigurationScopeReason } from './configuration-scope.js'

export interface AppliedRepair {
  backup: BackupSummary
  files: { relative: string; state: ConfigurationState }[]
}
interface PlannedFile {
  relative: string
  before: string | null
  after: string
  mode: number
  beforeHash: string
}
interface InternalPlan {
  preview: RepairPlan
  entries: PlannedFile[]
  preferencesHash: string
  connectionChanges?: ConnectionRequest
}
export class NoRepairChangesError extends Error {
  constructor() {
    super('没有可自动修改的配置；可能已修复，或需要手动处理')
  }
}
export class RepairEngine {
  private plans = new Map<string, InternalPlan>()
  constructor(
    readonly ctx: Context,
    readonly storage: Storage,
  ) {}
  private checkPlanCapacity() {
    for (const [id, plan] of this.plans)
      if (Date.parse(plan.preview.expiresAt) < Date.now()) this.plans.delete(id)
    if (this.plans.size >= 30) throw new Error('待处理的预览过多，请完成现有修复或稍后重试')
  }
  async preview(ids: FixId[], preferences: Preferences): Promise<RepairPlan> {
    this.checkPlanCapacity()
    const selected = [...new Set(ids)]
    if (
      selected.some((id) => /^(?:shell|npm|git)-proxy$/.test(id)) &&
      preferences.routeMode !== 'tun'
    )
      throw new Error('移除代理配置前，请在检测偏好中选择 TUN 模式')
    if (selected.some((id) => /endpoint$/.test(id)) && preferences.usageMode !== 'official')
      throw new Error('恢复默认 API 前，请在检测偏好中选择官方默认 API')
    const files = await readAllConfigs(this.ctx)
    if (selected.some((id) => id.startsWith('claude-'))) {
      const reason = claudeConfigurationScopeReason(
        this.ctx,
        files.find((file) => file.relative === '.claude/settings.json'),
      )
      if (reason) throw new Error(reason)
    }
    const entries: PlannedFile[] = []
    const preview: RepairPlan = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      fixIds: selected,
      files: [],
      notes: [
        '执行前备份原文件，修改后可在「备份恢复」中还原。',
        '已打开的终端仍保留旧环境变量，请关闭并重新启动终端与本工具。',
      ],
    }
    if (selected.includes('claude-privacy'))
      preview.notes.push(`${privacyCompatibilityNote} 已有的全部非必要流量设置会保留。`)
    for (const file of files) {
      const kind = configTargets.find((target) => target.relative === file.relative)!.kind
      const applies =
        kind === 'shell'
          ? selected.some((id) => id.startsWith('shell-'))
          : kind === 'npm'
            ? selected.some((id) => id === 'npm-proxy' || id === 'npm-tls')
            : kind === 'git'
              ? selected.includes('git-proxy')
              : selected.some((id) => id.startsWith('claude-'))
      if (!applies) continue
      const transformed = transformConfig(file, selected, preferences)
      if (!transformed) continue
      entries.push({
        relative: file.relative,
        before: file.content,
        after: transformed.after,
        mode: file.mode,
        beforeHash: hash(file.content),
      })
      preview.files.push({ path: file.display, changes: transformed.changes, exists: file.exists })
    }
    if (!entries.length) throw new NoRepairChangesError()
    this.plans.set(preview.id, {
      preview,
      entries,
      preferencesHash: hash(JSON.stringify(preferences)),
    })
    return preview
  }
  async previewConnection(
    request: ConnectionRequest,
    preferences: Preferences,
  ): Promise<RepairPlan> {
    this.checkPlanCapacity()
    const edit = await prepareConnectionEdit(this.ctx, connectionRequestSchema.parse(request))
    if (!edit.changes.length) throw new Error('所选连接设置与此文件当前值一致，无需修改')
    const preview: RepairPlan = {
      id: randomUUID(),
      kind: 'connection',
      label: '保存 Claude Code 用户连接设置',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      fixIds: [],
      files: [{ path: edit.file.display, exists: edit.file.exists, changes: edit.changes }],
      notes: edit.notes,
    }
    this.plans.set(preview.id, {
      preview,
      connectionChanges: request,
      preferencesHash: hash(JSON.stringify(preferences)),
      entries: [
        {
          relative: edit.file.relative,
          before: edit.file.content,
          after: edit.after,
          mode: edit.file.mode,
          beforeHash: hash(edit.file.content),
        },
      ],
    })
    return preview
  }
  discard(id: string) {
    this.plans.delete(id)
  }
  async apply(id: string, preferences: Preferences): Promise<BackupSummary> {
    return (await this.applyWithState(id, preferences)).backup
  }
  /** Carry the known written state forward without accepting a new filesystem baseline. */
  async applyWithState(id: string, preferences: Preferences): Promise<AppliedRepair> {
    if (this.plans.get(id)?.preview.kind === 'connection')
      throw new Error('连接设置请通过连接预览保存，以便保留完整快照')
    return this.applyPlan(id, preferences)
  }
  async applyConnection(
    id: string,
    preferences: Preferences,
    snapshots: SnapshotEngine,
  ): Promise<BackupSummary> {
    if (this.plans.get(id)?.preview.kind !== 'connection')
      throw new Error('连接设置预览不存在，请重新预览')
    return (
      await this.applyPlan(
        id,
        preferences,
        async () => (await snapshots.capture('connection', '连接设置修改前的完整配置')).id,
      )
    ).backup
  }
  private async applyPlan(
    id: string,
    preferences: Preferences,
    capture?: () => Promise<string>,
  ): Promise<AppliedRepair> {
    const plan = this.plans.get(id)
    if (!plan) throw new Error('修复预览不存在，请重新生成')
    if (Date.parse(plan.preview.expiresAt) < Date.now()) {
      this.plans.delete(id)
      throw new Error('修复预览已过期，请重新生成')
    }
    if (plan.preferencesHash !== hash(JSON.stringify(preferences)))
      throw new Error('检测偏好已变化，请重新预览修复')
    for (const entry of plan.entries) {
      const current = await readConfig(this.ctx, entry.relative)
      if (entry.relative === '.claude/settings.json') {
        const reason = claudeConfigurationScopeReason(this.ctx, current)
        if (reason) throw new Error(reason)
      }
      if (
        !current.editable ||
        hash(current.content) !== entry.beforeHash ||
        current.mode !== entry.mode
      )
        throw new Error(`~/${entry.relative} 在预览后发生变化，请重新预览`)
    }
    if (plan.connectionChanges) await validateConnectionFiles(plan.connectionChanges)
    const snapshotId = capture ? await capture() : undefined
    const manifest: BackupManifest = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      fixIds: plan.preview.fixIds,
      label: plan.preview.label,
      snapshotId,
      files: plan.entries.map((entry) => '~/' + entry.relative),
      status: 'failed',
      entries: plan.entries.map((entry) => ({
        relative: entry.relative,
        original: entry.before,
        mode: entry.mode,
        beforeHash: entry.beforeHash,
        afterHash: hash(entry.after),
      })),
    }
    await this.storage.saveManifest(manifest)
    const written: { entry: PlannedFile; afterMode: number }[] = []
    try {
      for (const entry of plan.entries) {
        // Recheck immediately before each write, as other applications may edit configuration.
        const current = await readConfig(this.ctx, entry.relative)
        if (entry.relative === '.claude/settings.json') {
          const reason = claudeConfigurationScopeReason(this.ctx, current)
          if (reason) throw new Error(reason)
        }
        if (
          !current.editable ||
          hash(current.content) !== entry.beforeHash ||
          current.mode !== entry.mode
        )
          throw new Error(`~/${entry.relative} 已被其他程序修改`)
        const afterMode = await writeConfig(this.ctx, entry.relative, entry.after, entry.mode)
        manifest.entries.find((file) => file.relative === entry.relative)!.afterMode = afterMode
        written.push({ entry, afterMode })
      }
      manifest.status = 'applied'
      await this.storage.saveManifest(manifest)
      this.plans.delete(id)
      const { entries, ...summary } = manifest
      return {
        backup: summary,
        files: entries.map((entry) => ({
          relative: entry.relative,
          state: {
            contentHash: entry.afterHash,
            mode: entry.afterMode ?? entry.mode,
            editable: true,
            error: null,
          },
        })),
      }
    } catch (error) {
      const rollbackFailures: string[] = []
      for (const { entry, afterMode } of written.reverse()) {
        try {
          const current = await readConfig(this.ctx, entry.relative)
          if (
            !current.editable ||
            hash(current.content) !== hash(entry.after) ||
            current.mode !== afterMode
          )
            throw new Error('内容又发生变化')
          await writeConfig(this.ctx, entry.relative, entry.before, entry.mode)
        } catch {
          rollbackFailures.push('~/' + entry.relative)
        }
      }
      manifest.status = 'failed'
      await this.storage.saveManifest(manifest)
      throw new Error(
        rollbackFailures.length
          ? `修复中断；${rollbackFailures.join('、')} 无法自动回退，原内容已保存在本机备份。`
          : `修复中断，已回退本次修改：${(error as Error).message}`,
      )
    }
  }
  async restore(id: string): Promise<BackupSummary> {
    const manifest = (await this.storage.manifests()).find((item) => item.id === id)
    if (!manifest || manifest.status !== 'applied') throw new Error('此备份不处于可恢复状态')
    for (const entry of manifest.entries) {
      const current = await readConfig(this.ctx, entry.relative)
      if (
        !current.editable ||
        hash(current.content) !== entry.afterHash ||
        current.mode !== (entry.afterMode ?? entry.mode)
      )
        throw new Error(
          `~/${entry.relative} 在修复后被修改，恢复会覆盖新内容，已停止。请手动对照备份。`,
        )
    }
    const restored: { entry: BackupManifest['entries'][number]; applied: string | null }[] = []
    try {
      for (const entry of manifest.entries) {
        const current = await readConfig(this.ctx, entry.relative)
        if (
          !current.editable ||
          hash(current.content) !== entry.afterHash ||
          current.mode !== (entry.afterMode ?? entry.mode)
        )
          throw new Error(`~/${entry.relative} 已变化`)
        await writeConfig(this.ctx, entry.relative, entry.original, entry.mode)
        restored.push({ entry, applied: current.content })
      }
      manifest.status = 'restored'
      manifest.restoredAt = new Date().toISOString()
      await this.storage.saveManifest(manifest)
      const { entries: _entries, ...summary } = manifest
      return summary
    } catch (error) {
      const failed: string[] = []
      for (const { entry, applied } of restored.reverse()) {
        try {
          const current = await readConfig(this.ctx, entry.relative)
          if (
            !current.editable ||
            hash(current.content) !== entry.beforeHash ||
            current.mode !== entry.mode
          )
            throw new Error('文件再次改变')
          await writeConfig(this.ctx, entry.relative, applied, entry.afterMode ?? entry.mode)
        } catch {
          failed.push('~/' + entry.relative)
        }
      }
      throw new Error(
        failed.length
          ? `恢复中断，部分文件需手动处理：${failed.join('、')}。原始备份仍保留。`
          : `恢复中断，已撤销本次恢复：${(error as Error).message}`,
      )
    }
  }
}
export function repairDescription(ids: FixId[]) {
  return ids.map((id) => fixLabels[id]).join('、')
}
