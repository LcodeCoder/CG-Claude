import { z } from 'zod'

/** Application appearance is separate from diagnostic preferences and configuration snapshots. */
export const appSettingsSchema = z
  .object({
    language: z.enum(['zh-CN', 'en']).default('zh-CN'),
    theme: z.enum(['light', 'eye-care', 'dark']).default('light'),
    reduceMotion: z.boolean().default(false),
  })
  .strict()
export type AppSettings = z.infer<typeof appSettingsSchema>
export const defaultAppSettings: AppSettings = appSettingsSchema.parse({})
export const PROJECT_URL = 'https://github.com/LcodeCoder/CG-Claude'
export interface StartupStatus {
  supported: boolean
  enabled: boolean
  reason?: 'browser' | 'development' | 'platform' | 'approval' | 'unconfirmed'
}
export interface VersionCheck {
  currentVersion: string
  checkedAt: string
  status: 'available' | 'current' | 'ahead' | 'unpublished'
  latestVersion?: string
  releaseUrl?: string
  publishedAt?: string
}
