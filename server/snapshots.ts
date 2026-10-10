import { randomUUID } from 'node:crypto'
import type { Preferences, SnapshotSummary, SnapshotPreview } from '../shared/types.js'
import type { Context } from './context.js'
import { hash, readAllConfigs, readConfig, writeConfig } from './safety.js'
import type { Storage } from './storage.js'
interface SnapshotEntry {
  relative: string
  original: string | null
  mode: number
  hash: string
}
export interface SnapshotRecord extends SnapshotSummary {
  entries: SnapshotEntry[]
  preferences: Preferences
}
interface RestorePlan {
  preview: SnapshotPreview
  record: SnapshotRecord
  hashes: Map<string, string>
  preferencesHash: string
}
export class SnapshotEngine {
  private plans = new Map<string, RestorePlan>()
  constructor(
    private ctx: Context,
    private storage: Storage,
  ) {}
  async list(): Promise<SnapshotSummary[]> {
    return (await this.storage.snapshots()).map(
      ({ entries: _entries, preferences: _preferences, ...summary }) => summary,
    )
  }
  async capture(
    purpose: SnapshotSummary['purpose'] = 'manual',
    label = '手动保存的配置快照',
  ): Promise<SnapshotSummary> {
    const preferences = await this.storage.preferences()
    const files = await readAllConfigs(this.ctx)
    const record: SnapshotRecord = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      label,
      purpose,
      status: 'ready',
      files: files.filter((file) => file.editable).map((file) => file.display),
      excludedFiles: files.filter((file) => !file.editable).map((file) => file.display),
      preferences,
      entries: files
        .filter((file) => file.editable)
        .map((file) => ({
          relative: file.relative,
          original: file.content,
          mode: file.mode,
          hash: hash(file.content),
        })),
    }
    if (!record.entries.length) throw new Error('配置均无法读取，无法保存快照，请检查权限')
    // Recheck after reading so a changing file cannot silently become a baseline.
    for (const entry of record.entries) {
      const current = await readConfig(this.ctx, entry.relative)
      if (!current.editable || hash(current.content) !== entry.hash || current.mode !== entry.mode)
        throw new Error(`${current.display} 在保存快照时发生变化，请重试`)
    }
    await this.storage.saveSnapshot(record)
    const { entries: _entries, preferences: _preferences, ...summary } = record
    return summary
  }
  async preview(id: string): Promise<SnapshotPreview> {
    for (const [key, plan] of this.plans)
      if (Date.parse(plan.preview.expiresAt) < Date.now()) this.plans.delete(key)
    if (this.plans.size >= 30) throw new Error('快照预览过多，请完成现有还原或稍后重试')
    const record = (await this.storage.snapshots()).find((item) => item.id === id)
    if (!record) throw new Error('配置快照不存在')
    const preferences = await this.storage.preferences()
    const preview: SnapshotPreview = {
      id: randomUUID(),
      snapshotId: id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      files: [],
      preferences: record.preferences,
      preferencesChanged: JSON.stringify(preferences) !== JSON.stringify(record.preferences),
      notes: [
        '还原文件的完整内容和原权限；快照之后新增的配置字段也会恢复到当时状态。',
        '还原前会另外保存当前配置快照，可再次恢复到还原前。',
        '快照里不存在的文件会恢复为不存在，终端需要重新打开才会生效。',
        ...(record.excludedFiles.length
          ? [`此快照不包含当时无法读取的文件：${record.excludedFiles.join('、')}`]
          : []),
      ],
    }
    const hashes = new Map<string, string>()
    for (const entry of record.entries) {
      if (hash(entry.original) !== entry.hash)
        throw new Error('快照内容完整性校验未通过，请检查记录文件')
      const current = await readConfig(this.ctx, entry.relative)
      if (!current.editable)
        throw new Error(`${current.display}：${current.error || '无法安全还原'}`)
      hashes.set(entry.relative, `${hash(current.content)}:${current.mode}`)
      if (hash(current.content) !== entry.hash || current.mode !== entry.mode)
        preview.files.push({
          path: current.display,
          exists: current.exists,
          changes: [
            {
              key: '完整配置与文件权限',
              before: current.exists ? '当前文件（内容已隐藏）' : '文件不存在',
              after: entry.original === null ? '恢复为文件不存在' : '恢复快照原文（内容已隐藏）',
            },
          ],
        })
    }
    this.plans.set(preview.id, {
      preview,
      record,
      hashes,
      preferencesHash: hash(JSON.stringify(preferences)),
    })
    return preview
  }
  async restore(id: string): Promise<SnapshotSummary> {
    const plan = this.plans.get(id)
    if (!plan || Date.parse(plan.preview.expiresAt) < Date.now())
      throw new Error('快照预览已失效，请重新预览')
    const currentPreferences = await this.storage.preferences()
    if (hash(JSON.stringify(currentPreferences)) !== plan.preferencesHash)
      throw new Error('检测偏好在预览后发生变化，请重新预览')
    const current = await readAllConfigs(this.ctx)
    for (const entry of plan.record.entries) {
      const file = current.find((item) => item.relative === entry.relative)!
      if (
        !file.editable ||
        `${hash(file.content)}:${file.mode}` !== plan.hashes.get(entry.relative)
      )
        throw new Error(`${file.display} 在还原预览后发生变化，请重新预览`)
    }
    await this.capture('before-restore', '还原快照之前的配置')
    const written: SnapshotEntry[] = []
    try {
      for (const entry of plan.record.entries) {
        const file = await readConfig(this.ctx, entry.relative)
        if (
          !file.editable ||
          `${hash(file.content)}:${file.mode}` !== plan.hashes.get(entry.relative)
        )
          throw new Error(`${file.display} 被其他程序修改`)
        if (hash(file.content) === entry.hash && file.mode === entry.mode) continue
        await writeConfig(this.ctx, entry.relative, entry.original, entry.mode)
        written.push(entry)
      }
      await this.storage.savePreferences(plan.record.preferences)
      plan.record.status = 'restored'
      plan.record.restoredAt = new Date().toISOString()
      await this.storage.saveSnapshot(plan.record)
      this.plans.delete(id)
      const { entries: _entries, preferences: _preferences, ...summary } = plan.record
      return summary
    } catch (error) {
      const failures: string[] = []
      for (const entry of written.reverse())
        try {
          const file = await readConfig(this.ctx, entry.relative)
          if (!file.editable || hash(file.content) !== entry.hash)
            throw new Error('文件又被其他程序修改')
          const original = current.find((item) => item.relative === entry.relative)!
          await writeConfig(this.ctx, entry.relative, original.content, original.mode)
        } catch {
          failures.push('~/' + entry.relative)
        }
      await this.storage.savePreferences(currentPreferences).catch(() => failures.push('检测偏好'))
      throw new Error(
        failures.length
          ? `还原中断，以下内容需手动处理：${failures.join('、')}。还原前的快照仍保留。`
          : `还原中断，已撤销本次还原：${(error as Error).message}`,
      )
    }
  }
}
