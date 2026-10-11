import { samePreferences } from '../shared/types.js'
import { randomUUID } from 'node:crypto'
import type { Preferences, SnapshotSummary, SnapshotPreview } from '../shared/types.js'
import type { Context } from './context.js'
import { hash, readAllConfigs, readConfig, writeConfig } from './safety.js'
import {
  captureTimezoneState,
  restoreTimezoneState,
  rollbackTimezoneState,
  timezoneChanges,
  timezoneStateSchema,
} from './timezone-settings.js'
import type { TimezoneState } from './timezone-settings.js'
import type { Storage } from './storage.js'
import { snapshotIntegrity } from './record-validation.js'
interface SnapshotEntry {
  relative: string
  original: string | null
  mode: number
  hash: string
}
export interface SnapshotRecord extends SnapshotSummary {
  entries: SnapshotEntry[]
  integrityHash?: string
  preferences: Preferences
  timezoneState?: { state: TimezoneState; hash: string }
}
interface RestorePlan {
  preview: SnapshotPreview
  record: SnapshotRecord
  hashes: Map<string, string>
  preferencesHash: string
  timezoneHash?: string
}
export class SnapshotEngine {
  private plans = new Map<string, RestorePlan>()
  constructor(
    private ctx: Context,
    private storage: Storage,
  ) {}
  async list(): Promise<SnapshotSummary[]> {
    // Updating an old restore record must not move it ahead of a newer capture.
    return (await this.storage.snapshots())
      .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
      .map(
        ({
          entries: _entries,
          preferences: _preferences,
          timezoneState: _timezone,
          integrityHash: _integrity,
          ...summary
        }) => summary,
      )
  }
  async capture(
    purpose: SnapshotSummary['purpose'] = 'manual',
    label = '手动保存的配置快照',
  ): Promise<SnapshotSummary> {
    const preferences = await this.storage.preferences()
    const files = await readAllConfigs(this.ctx)
    const timezone = await captureTimezoneState(this.ctx)
    const record: SnapshotRecord = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      label,
      purpose,
      status: 'ready',
      files: files.filter((file) => file.editable).map((file) => file.display),
      excludedFiles: files.filter((file) => !file.editable).map((file) => file.display),
      preferences,
      timezone: { system: timezone.system, terminal: true, user: timezone.user !== undefined },
      timezoneState: { state: timezone, hash: hash(JSON.stringify(timezone)) },
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
    if (hash(JSON.stringify(await captureTimezoneState(this.ctx))) !== record.timezoneState!.hash)
      throw new Error('时区在保存快照时发生变化，请重试')
    record.integrityHash = snapshotIntegrity(record)
    await this.storage.saveSnapshot(record)
    const {
      entries: _entries,
      preferences: _preferences,
      timezoneState: _timezone,
      integrityHash: _integrity,
      ...summary
    } = record
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
      preferencesChanged: !samePreferences(preferences, record.preferences),
      notes: [
        '还原文件的完整内容和原权限；快照之后新增的配置字段也会恢复到当时状态。',
        '还原前会另外保存当前配置快照，可再次恢复到还原前。',
        '快照里不存在的文件会恢复为不存在，终端需要重新打开才会生效。',
        ...(record.excludedFiles.length
          ? [`此快照不包含当时无法读取的文件：${record.excludedFiles.join('、')}`]
          : []),
      ],
    }
    let timezoneHash: string | undefined
    if (record.timezoneState) {
      const state = timezoneStateSchema.parse(record.timezoneState.state)
      if (hash(JSON.stringify(record.timezoneState.state)) !== record.timezoneState.hash)
        throw new Error('快照时区完整性校验未通过')
      if (state.platform !== this.ctx.platform) throw new Error('快照平台与本机不同，不能还原时区')
      const timezone = await captureTimezoneState(this.ctx)
      if (state.system && !timezone.system) throw new Error('无法读取当前系统时区，不能安全还原')
      if (state.user !== undefined && timezone.user === undefined)
        throw new Error('无法读取当前 Windows 用户 TZ，不能安全还原')
      timezoneHash = hash(JSON.stringify(timezone))
      preview.timezoneChanges = timezoneChanges(timezone, state)
      if (!state.system) preview.notes.push('此快照未读取系统时区，该项保留当前设置。')
      if (state.platform === 'win32' && state.user === undefined)
        preview.notes.push('此快照未读取 Windows 用户 TZ，该项保留当前设置。')
      if (preview.timezoneChanges.some((change) => change.key === '系统时区'))
        preview.notes.push('还原系统时区可能需要管理员授权。')
    } else preview.notes.push('旧快照未记录系统时区与进程 TZ，仅还原文件和检测偏好。')
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
      timezoneHash,
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
    const currentTimezone = await captureTimezoneState(this.ctx)
    if (plan.timezoneHash && hash(JSON.stringify(currentTimezone)) !== plan.timezoneHash)
      throw new Error('时区在还原预览后发生变化，请重新预览')
    await this.capture('before-restore', '还原快照之前的配置')
    const written: { entry: SnapshotEntry; afterMode: number }[] = []
    let timezoneAttempted = false
    let preferencesAttempted = false
    try {
      if (plan.record.timezoneState) {
        if (hash(JSON.stringify(await captureTimezoneState(this.ctx))) !== plan.timezoneHash)
          throw new Error('时区被其他程序修改，请重新预览')
        timezoneAttempted = true
        await restoreTimezoneState(this.ctx, plan.record.timezoneState.state)
      }
      for (const entry of plan.record.entries) {
        const file = await readConfig(this.ctx, entry.relative)
        if (
          !file.editable ||
          `${hash(file.content)}:${file.mode}` !== plan.hashes.get(entry.relative)
        )
          throw new Error(`${file.display} 被其他程序修改`)
        if (hash(file.content) === entry.hash && file.mode === entry.mode) continue
        const afterMode = await writeConfig(this.ctx, entry.relative, entry.original, entry.mode)
        written.push({ entry, afterMode })
      }
      if (hash(JSON.stringify(await this.storage.preferences())) !== plan.preferencesHash)
        throw new Error('检测偏好被其他程序修改，请重新预览')
      preferencesAttempted = true
      await this.storage.savePreferences(plan.record.preferences)
      const restoredRecord: SnapshotRecord = {
        ...plan.record,
        status: 'restored',
        restoredAt: new Date().toISOString(),
      }
      await this.storage.saveSnapshot(restoredRecord)
      this.plans.delete(id)
      const {
        entries: _entries,
        preferences: _preferences,
        timezoneState: _timezone,
        integrityHash: _integrity,
        ...summary
      } = restoredRecord
      return summary
    } catch (error) {
      const failures: string[] = []
      for (const { entry, afterMode } of written.reverse())
        try {
          const file = await readConfig(this.ctx, entry.relative)
          if (!file.editable || hash(file.content) !== entry.hash || file.mode !== afterMode)
            throw new Error('文件又被其他程序修改')
          const original = current.find((item) => item.relative === entry.relative)!
          await writeConfig(this.ctx, entry.relative, original.content, original.mode)
        } catch {
          failures.push('~/' + entry.relative)
        }
      if (timezoneAttempted)
        await rollbackTimezoneState(
          this.ctx,
          currentTimezone,
          plan.record.timezoneState!.state,
        ).catch(() => failures.push('系统时区 / TZ'))
      if (preferencesAttempted)
        try {
          const latestHash = hash(JSON.stringify(await this.storage.preferences()))
          if (latestHash !== plan.preferencesHash) {
            if (latestHash !== hash(JSON.stringify(plan.record.preferences)))
              throw new Error('检测偏好又被其他程序修改')
            await this.storage.savePreferences(currentPreferences)
          }
        } catch {
          failures.push('检测偏好')
        }
      throw new Error(
        failures.length
          ? `还原中断，以下内容需手动处理：${failures.join('、')}。还原前的快照仍保留。`
          : `还原中断，已撤销本次还原：${(error as Error).message}`,
      )
    }
  }
}
