import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
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
  private async read<T>(name: string, fallback: T): Promise<T> {
    try {
      const target = path.join(this.ctx.dataDir, name)
      const stat = await fs.lstat(target)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RECORD_BYTES)
        throw new Error('记录必须是小于 64 MB 的普通文件')
      return JSON.parse(await fs.readFile(target, 'utf8')) as T
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
      throw new Error(`本机记录 ${name} 无法读取，请检查 JSON 格式与权限`)
    }
  }
  private async write(name: string, value: unknown) {
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
      await fs.rename(temporary, target)
    } finally {
      await fs.unlink(temporary).catch(() => {})
    }
  }
  async preferences(): Promise<Preferences> {
    return preferencesSchema.parse(await this.read('preferences.json', defaultPreferences))
  }
  async savePreferences(prefs: Preferences) {
    await this.write('preferences.json', prefs)
  }
  async manualReviews(): Promise<ManualReview[]> {
    const saved = z.array(manualReviewSchema).parse(await this.read('manual-reviews.json', []))
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
    return this.read('reports.json', [])
  }
  async saveReport(report: ScanReport) {
    const reports = await this.reports()
    await this.write(
      'reports.json',
      [report, ...reports.filter((item) => item.id !== report.id)].slice(0, 30),
    )
  }
  async snapshots(): Promise<SnapshotRecord[]> {
    return this.read('snapshots.json', [])
  }
  async saveSnapshot(snapshot: SnapshotRecord) {
    const snapshots = await this.snapshots()
    await this.write('snapshots.json', [
      snapshot,
      ...snapshots.filter((item) => item.id !== snapshot.id),
    ])
  }
  async workflows(): Promise<SetupJob[]> {
    return this.read('workflows.json', [])
  }
  async saveWorkflows(jobs: SetupJob[]) {
    await this.write('workflows.json', jobs.slice(0, 20))
  }
  async manifests(): Promise<BackupManifest[]> {
    return this.read('backups.json', [])
  }
  async backups(): Promise<BackupSummary[]> {
    return (await this.manifests())
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map(({ entries: _entries, ...summary }) => summary)
  }
  async saveManifest(manifest: BackupManifest) {
    const manifests = await this.manifests()
    await this.write('backups.json', [
      manifest,
      ...manifests.filter((item) => item.id !== manifest.id),
    ])
  }
}
