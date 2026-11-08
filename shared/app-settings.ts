import { z } from 'zod'
import { detectUiLanguage, uiLanguageSchema } from './ui-language.js'

/** Application appearance is separate from diagnostic preferences and configuration snapshots. */
export const appSettingsSchema = z
  .object({
    language: uiLanguageSchema.default('en'),
    theme: z.enum(['light', 'eye-care', 'dark']).default('light'),
    reduceMotion: z.boolean().default(false),
  })
  .strict()
export type AppSettings = z.infer<typeof appSettingsSchema>
export const defaultAppSettings: AppSettings = appSettingsSchema.parse({})

/**
 * First-run settings, before `app-settings.json` exists. A saved language in
 * that record always wins; this only supplies the initial default.
 */
export function defaultAppSettingsForEnv(env: Record<string, string | undefined>): AppSettings {
  return { ...defaultAppSettings, language: detectUiLanguage(env) }
}
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
