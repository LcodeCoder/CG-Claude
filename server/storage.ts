import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID, randomBytes } from 'node:crypto'
import { z } from 'zod'
import {
  preferencesSchema,
  defaultPreferences,
  manualItems,
  manualReviewSchema,
} from '../shared/types.js'
import type {
  Preferences,
  ScanReport,
  BackupSummary,
  SetupJob,
  ManualReview,
  ManualReviewRequest,
} from '../shared/types.js'
import type { Context } from './context.js'
import type { SnapshotRecord } from './snapshots.js'
import { readBoundedText } from './file-reading.js'
import { translationRecordSchema } from './translation.js'
import { browserLanguageBackupSchema } from '../shared/browser-configuration.js'
import type { BrowserLanguageBackup } from '../shared/browser-configuration.js'
import { sealBrowserBackup } from './browser-configuration.js'
import type { TranslationRecord } from './translation.js'
import {
  backupRecordsSchema,
  snapshotRecordsSchema,
  reportRecordsSchema,
  workflowRecordsSchema,
  verifyRecordIntegrity,
  normalizeRecordIntegrity,
} from './record-validation.js'

export interface BackupFile {
  relative: string
  original: string | null
  mode: number
  beforeHash: string
  afterHash: string
  /** Observed permissions after the write; older backups used mode for both states. */
  afterMode?: number
}
export interface BackupManifest extends BackupSummary {
  entries: BackupFile[]
  integrityHash?: string
}
const MAX_RECORD_BYTES = 64 * 1024 * 1024
export class Storage {
  constructor(readonly ctx: Context) {}
  async init() {
    await fs.mkdir(this.ctx.dataDir, { recursive: true, mode: 0o700 })
    const stat = await fs.lstat(this.ctx.dataDir)
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error('工具数据目录必须是普通文件夹')
    await fs.chmod(this.ctx.dataDir, 0o700)
  }
  private async assertDirectory() {
    const stat = await fs.lstat(this.ctx.dataDir)
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error('工具数据目录已变化，请退出并检查原始记录目录')
  }
  private async read(name: string, fallback: unknown): Promise<unknown> {
    await this.assertDirectory()
    try {
      const target = path.join(this.ctx.dataDir, name)
      const { text } = await readBoundedText(target, MAX_RECORD_BYTES)
      await this.assertDirectory()
      return JSON.parse(text)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
      throw new Error(`本机记录 ${name} 无法读取，请检查 JSON 格式与权限；原记录已保留`)
    }
  }
  private async records<T>(name: string, schema: z.ZodType<T>, fallback: unknown = []): Promise<T> {
    const value = await this.read(name, fallback)
    verifyRecordIntegrity(name, value)
    const result = schema.safeParse(value)
    if (!result.success)
      throw new Error(`本机记录 ${name} 的数据结构无效，请检查该记录；原记录已保留`)
    normalizeRecordIntegrity(name, result.data)
    return result.data
  }
  private async write(name: string, value: unknown) {
    await this.assertDirectory()
    const target = path.join(this.ctx.dataDir, name)
    const temporary = `${target}.${randomUUID()}.tmp`
    const content = JSON.stringify(value, null, 2) + '\n'
    if (Buffer.byteLength(content) > MAX_RECORD_BYTES)
      throw new Error(`本机记录 ${name} 达到 64 MB 上限，请先另存并整理旧记录；原记录已保留`)
    try {
      await fs.writeFile(temporary, content, {
        mode: 0o600,
        flag: 'wx',
      })
      await this.assertDirectory()
      await fs.rename(temporary, target)
    } finally {
      await fs.unlink(temporary).catch(() => {})
    }
  }
  async browserLanguageBackups(): Promise<BrowserLanguageBackup[]> {
    const records = await this.records(
      'browser-language-backups.json',
      z.array(browserLanguageBackupSchema).max(1000),
    )
    if (records.some((record) => sealBrowserBackup(record) !== record.integrity))
      throw new Error('浏览器语言备份完整性校验失败；原记录已保留')
    return records
  }
  async saveBrowserLanguageBackup(record: BrowserLanguageBackup) {
    const records = await this.browserLanguageBackups()
    await this.write('browser-language-backups.json', [
      browserLanguageBackupSchema.parse(record),
      ...records.filter((item) => item.id !== record.id),
    ])
  }
  async translationSettings(): Promise<TranslationRecord | undefined> {
    return (
      (await this.records('translation-settings.json', translationRecordSchema.nullable(), null)) ??
      undefined
    )
  }
  async saveTranslationSettings(value: TranslationRecord) {
    await this.write('translation-settings.json', translationRecordSchema.parse(value))
  }
  /** The encryption key stays in the private local data directory, never in API responses. */
  async translationEncryptionKey(create: boolean): Promise<Buffer> {
    await this.assertDirectory()
    const target = path.join(this.ctx.dataDir, 'translation-key.json')
    const read = async () => {
      const stat = await fs.lstat(target)
      if (
        stat.isSymbolicLink() ||
        !stat.isFile() ||
        stat.nlink !== 1 ||
        (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)
      )
        throw new Error('翻译加密密钥文件需要是仅当前用户可读写的普通文件')
      const { text } = await readBoundedText(target, 1024)
      await this.assertDirectory()
      const value = z
        .string()
        .regex(/^[a-f\d]{64}$/)
        .parse(JSON.parse(text))
      return Buffer.from(value, 'hex')
    }
    try {
      return await read()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('本机翻译加密密钥无法读取，请检查记录目录与权限；原记录已保留')
      if (!create) throw new Error('本机翻译加密密钥缺失，请重新填写 API 密钥后保存')
    }
    const value = randomBytes(32).toString('hex')
    try {
      await fs.writeFile(target, JSON.stringify(value) + '\n', { mode: 0o600, flag: 'wx' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
        throw new Error('本机翻译加密密钥无法保存，请检查记录目录与权限')
    }
    return read()
  }
  async preferences(): Promise<Preferences> {
    return this.records('preferences.json', preferencesSchema, defaultPreferences)
  }
  async savePreferences(prefs: Preferences) {
    await this.write('preferences.json', prefs)
  }
  async manualReviews(): Promise<ManualReview[]> {
    const saved = await this.records('manual-reviews.json', z.array(manualReviewSchema))
    return saved.filter((review) => manualItems.some((item) => item.id === review.id))
  }
  async saveManualReview(request: ManualReviewRequest): Promise<ManualReview[]> {
    const reviews = await this.manualReviews()
    const previous = reviews.find((review) => review.id === request.id)
    const now = new Date().toISOString()
    const updated: ManualReview = {
      id: request.id,
      checked: request.checked,
      checkedAt: request.checked ? (previous?.checkedAt ?? now) : undefined,
      updatedAt: now,
      note: request.note.trim(),
      origin: 'manual',
    }
    const result = [...reviews.filter((review) => review.id !== request.id), updated]
    await this.write('manual-reviews.json', result)
    return result
  }
  async importManualReviews(ids: string[]): Promise<ManualReview[]> {
    const reviews = await this.manualReviews()
    const additions = [...new Set(ids)].filter((id) => !reviews.some((review) => review.id === id))
    if (!additions.length) return reviews
    const now = new Date().toISOString()
    const result: ManualReview[] = [
      ...reviews,
      ...additions.map((id) => ({
        id,
        checked: true,
        updatedAt: now,
        note: '',
        origin: 'legacy' as const,
      })),
    ]
    await this.write('manual-reviews.json', result)
    return result
  }
  async resetManualReviews(): Promise<ManualReview[]> {
    await this.write('manual-reviews.json', [])
    return []
  }
  async reports(): Promise<ScanReport[]> {
    return this.records('reports.json', reportRecordsSchema)
  }
  async saveReport(report: ScanReport) {
    const reports = await this.reports()
    await this.write(
      'reports.json',
      [report, ...reports.filter((item) => item.id !== report.id)].slice(0, 30),
    )
  }
  async snapshots(): Promise<SnapshotRecord[]> {
    return this.records('snapshots.json', snapshotRecordsSchema)
  }
  async saveSnapshot(snapshot: SnapshotRecord) {
    const snapshots = await this.snapshots()
    await this.write('snapshots.json', [
      snapshot,
      ...snapshots.filter((item) => item.id !== snapshot.id),
    ])
  }
  async workflows(): Promise<SetupJob[]> {
    return this.records('workflows.json', workflowRecordsSchema)
  }
  async saveWorkflows(jobs: SetupJob[]) {
    await this.write('workflows.json', jobs.slice(0, 20))
  }
  async manifests(): Promise<BackupManifest[]> {
    return this.records('backups.json', backupRecordsSchema)
  }
  async backups(): Promise<BackupSummary[]> {
    return (await this.manifests())
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map(({ entries: _entries, integrityHash: _integrity, ...summary }) => summary)
  }
  async saveManifest(manifest: BackupManifest) {
    const manifests = await this.manifests()
    await this.write('backups.json', [
      manifest,
      ...manifests.filter((item) => item.id !== manifest.id),
    ])
  }
}
