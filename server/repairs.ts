import { randomUUID } from 'node:crypto'
import type { FixId, Preferences, RepairPlan, BackupSummary } from '../shared/types.js'
import { fixLabels } from '../shared/types.js'
import { configTargets } from './context.js'
import type { Context } from './context.js'
import { hash, readAllConfigs, readConfig, writeConfig } from './safety.js'
import { transformConfig } from './configs.js'
import { Storage } from './storage.js'
import type { BackupManifest } from './storage.js'

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
  async preview(ids: FixId[], preferences: Preferences): Promise<RepairPlan> {
    for (const [id, plan] of this.plans)
      if (Date.parse(plan.preview.expiresAt) < Date.now()) this.plans.delete(id)
    if (this.plans.size >= 30) throw new Error('待处理的预览过多，请完成现有修复或稍后重试')
    const selected = [...new Set(ids)]
    if (
      selected.some((id) => /^(?:shell|npm|git)-proxy$/.test(id)) &&
      preferences.routeMode !== 'tun'
    )
      throw new Error('移除代理配置前，请在检测偏好中选择 TUN 模式')
    if (selected.some((id) => /endpoint$/.test(id)) && preferences.usageMode !== 'official')
      throw new Error('恢复默认 API 前，请在检测偏好中选择官方默认 API')
    const files = await readAllConfigs(this.ctx)
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
      preview.notes.push(
        '关闭使用指标会同时关闭功能旗标，Remote Control 可能不可用。已有的全部非必要流量设置会保留。',
      )
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
  discard(id: string) {
    this.plans.delete(id)
  }
  fingerprints(id: string) {
    const plan = this.plans.get(id)
    if (!plan) throw new Error('修复预览不存在，请重新生成')
    return plan.entries.map((entry) => ({ relative: entry.relative, afterHash: hash(entry.after) }))
  }
  async apply(id: string, preferences: Preferences): Promise<BackupSummary> {
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
      if (!current.editable || hash(current.content) !== entry.beforeHash)
        throw new Error(`~/${entry.relative} 在预览后发生变化，请重新预览`)
    }
    const manifest: BackupManifest = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      fixIds: plan.preview.fixIds,
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
    const written: PlannedFile[] = []
    try {
      for (const entry of plan.entries) {
        // Recheck immediately before each write, as other applications may edit configuration.
        const current = await readConfig(this.ctx, entry.relative)
        if (!current.editable || hash(current.content) !== entry.beforeHash)
          throw new Error(`~/${entry.relative} 已被其他程序修改`)
        await writeConfig(this.ctx, entry.relative, entry.after, entry.mode)
        written.push(entry)
      }
      manifest.status = 'applied'
      await this.storage.saveManifest(manifest)
      this.plans.delete(id)
      const { entries: _entries, ...summary } = manifest
      return summary
    } catch (error) {
      const rollbackFailures: string[] = []
      for (const entry of written.reverse()) {
        try {
          const current = await readConfig(this.ctx, entry.relative)
          if (!current.editable || hash(current.content) !== hash(entry.after))
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
      if (!current.editable || hash(current.content) !== entry.afterHash)
        throw new Error(
          `~/${entry.relative} 在修复后被修改，恢复会覆盖新内容，已停止。请手动对照备份。`,
        )
    }
    const restored: { entry: BackupManifest['entries'][number]; applied: string | null }[] = []
    try {
      for (const entry of manifest.entries) {
        const current = await readConfig(this.ctx, entry.relative)
        if (!current.editable || hash(current.content) !== entry.afterHash)
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
          if (!current.editable || hash(current.content) !== entry.beforeHash)
            throw new Error('文件再次改变')
          await writeConfig(this.ctx, entry.relative, applied, entry.mode)
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
