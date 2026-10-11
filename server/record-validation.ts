import { z } from 'zod'
import { configTargets } from './context.js'
import { preferencesSchema, fixIds } from '../shared/types.js'
import type { ScanReport, SetupJob } from '../shared/types.js'
import type { BackupManifest } from './storage.js'
import type { SnapshotRecord } from './snapshots.js'
import { timezoneStateSchema } from './timezone-settings.js'
import { hash } from './safety.js'

const id = z.string().min(1).max(100)
const date = z.string().datetime()
const text = z.string().max(8192)
const digest = z.string().regex(/^[a-f\d]{64}$/)
const mode = z.number().int().min(0).max(0o777)
const configPath = z.enum(configTargets.map((target) => target.relative))
const original = z
  .string()
  .refine((value) => Buffer.byteLength(value) <= 1024 * 1024)
  .nullable()
const paths = z.array(text).max(configTargets.length)
const status = z.enum(['pass', 'warn', 'fail', 'manual', 'skipped'])
const counts = z.object({
  pass: z.number().int().nonnegative(),
  warn: z.number().int().nonnegative(),
  fail: z.number().int().nonnegative(),
  manual: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
})
const evidence = z.array(z.object({ label: text, value: text })).max(1000)
const change = z.object({ key: text, before: text, after: text })
const files = z
  .array(z.object({ path: text, changes: z.array(change).max(1000), exists: z.boolean() }))
  .max(configTargets.length)
const uniquePaths = (entries: { relative: string }[]) =>
  new Set(entries.map((entry) => entry.relative)).size === entries.length

export const backupRecordsSchema: z.ZodType<BackupManifest[]> = z.array(
  z.object({
    id,
    createdAt: date,
    restoredAt: date.optional(),
    label: text.optional(),
    snapshotId: id.optional(),
    fixIds: z.array(z.enum(fixIds)).max(fixIds.length),
    files: paths,
    status: z.enum(['applied', 'restored', 'failed']),
    integrityHash: digest.optional(),
    entries: z
      .array(
        z.object({
          relative: configPath,
          original,
          mode,
          beforeHash: digest,
          afterHash: digest,
          afterMode: mode.optional(),
        }),
      )
      .min(1)
      .max(configTargets.length)
      .refine(uniquePaths),
  }),
)

export const snapshotRecordsSchema: z.ZodType<SnapshotRecord[]> = z.array(
  z.object({
    id,
    createdAt: date,
    restoredAt: date.optional(),
    label: text,
    purpose: z.enum(['manual', 'setup', 'connection', 'before-restore']),
    status: z.enum(['ready', 'restored']),
    files: paths,
    excludedFiles: paths,
    preferences: preferencesSchema,
    timezone: z
      .object({
        system: text.optional(),
        terminal: z.boolean(),
        user: z.boolean(),
        automatic: z.boolean().optional(),
      })
      .optional(),
    timezoneState: z.object({ state: timezoneStateSchema, hash: digest }).optional(),
    integrityHash: digest.optional(),
    entries: z
      .array(z.object({ relative: configPath, original, mode, hash: digest }))
      .min(1)
      .max(configTargets.length)
      .refine(uniquePaths),
  }),
)

export const reportRecordsSchema: z.ZodType<ScanReport[]> = z
  .array(
    z.object({
      id,
      createdAt: date,
      completedAt: date,
      ruleset: text.optional(),
      configurationFingerprint: digest.optional(),
      preferences: preferencesSchema,
      networkEnabled: z.boolean(),
      counts,
      machine: z.object({
        platform: text,
        platformName: text,
        hostname: text,
        arch: text,
        osVersion: text,
        timezone: text,
        runtimeTimezone: text.optional(),
        nodeVersion: text,
      }),
      network: z
        .object({
          ip: text,
          country: text.optional(),
          city: text.optional(),
          org: text.optional(),
          timezone: text.optional(),
          browserIp: text.optional(),
        })
        .optional(),
      verification: z
        .object({ passes: z.number().int().min(1).max(3), unstableCheckIds: z.array(id).max(1000) })
        .optional(),
      checks: z
        .array(
          z.object({
            id,
            category: z.enum(['network', 'browser', 'system', 'terminal', 'claude']),
            title: text,
            description: text,
            status,
            summary: text,
            evidence,
            recommendation: text,
            fixIds: z.array(z.enum(fixIds)).max(fixIds.length),
            source: z.enum(['official', 'system', 'community']),
            sourceUrl: text.optional(),
          }),
        )
        .max(1000),
    }),
  )
  .max(30)

export const workflowRecordsSchema: z.ZodType<SetupJob[]> = z
  .array(
    z.object({
      id,
      previewId: id,
      createdAt: date,
      completedAt: date.optional(),
      status: z.enum(['running', 'complete', 'interrupted']),
      preferences: preferencesSchema,
      reportId: id.optional(),
      snapshotId: id.optional(),
      browserProbeId: id.optional(),
      error: text.optional(),
      nodes: z
        .array(
          z.object({
            id: z.enum([
              'snapshot',
              'preferences',
              'inspect',
              'system-timezone',
              'terminal-timezone',
              'verify',
              ...fixIds,
            ]),
            title: text,
            description: text,
            enabled: z.boolean(),
            files,
            blocked: z.boolean().optional(),
            note: text.optional(),
            status: z.enum(['pending', 'running', 'retrying', 'succeeded', 'skipped']),
            attempts: z.number().int().min(0).max(4),
            retries: z.number().int().min(0).max(3),
            message: text,
            backupId: id.optional(),
            startedAt: date.optional(),
            completedAt: date.optional(),
            history: z
              .array(
                z.object({
                  at: date,
                  attempt: z.number().int().min(1).max(4),
                  result: z.enum(['succeeded', 'failed']),
                  message: text,
                }),
              )
              .max(4),
          }),
        )
        .max(13),
    }),
  )
  .max(20)

/** Sort object keys while retaining arrays and configuration text byte-for-byte. */
function recordHash(value: unknown): string {
  return hash(
    JSON.stringify(value, (_key, item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, item[key]]),
          )
        : item,
    ),
  )
}

/** Cover restoration inputs together, including paths, permissions and preferences. */
export function snapshotIntegrity(record: SnapshotRecord): string {
  return recordHash({
    entries: record.entries,
    preferences: record.preferences,
    ...(record.timezoneState ? { timezoneState: record.timezoneState } : {}),
  })
}
export function backupIntegrity(record: BackupManifest): string {
  return recordHash(record.entries)
}

/** Integrity is checked on the persisted shape before legacy preference normalization. */
export function verifyRecordIntegrity(name: string, value: unknown) {
  if (!Array.isArray(value)) return
  for (const item of value) {
    if (!item || typeof item !== 'object' || !('integrityHash' in item)) continue
    if (
      name === 'snapshots.json' &&
      snapshotIntegrity(item as SnapshotRecord) !== item.integrityHash
    )
      throw new Error('本机记录 snapshots.json 的完整性校验未通过；原记录已保留')
    if (name === 'backups.json' && backupIntegrity(item as BackupManifest) !== item.integrityHash)
      throw new Error('本机记录 backups.json 的完整性校验未通过；原记录已保留')
  }
}

/** Reseal only after the persisted record has passed integrity and shape checks. */
export function normalizeRecordIntegrity(name: string, value: unknown): void {
  if (!Array.isArray(value)) return
  if (name === 'snapshots.json')
    for (const record of value as SnapshotRecord[])
      if (record.integrityHash) record.integrityHash = snapshotIntegrity(record)
  if (name === 'backups.json')
    for (const record of value as BackupManifest[])
      if (record.integrityHash) record.integrityHash = backupIntegrity(record)
}
