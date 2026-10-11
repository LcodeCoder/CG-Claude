import { z } from 'zod'
import { browserLanguageTargets } from './browser-language.js'
export const browserIds = ['chrome', 'edge', 'brave', 'chromium'] as const
export const browserLanguageRequestSchema = z
  .object({
    profileId: z.string().regex(/^[a-f\d]{24}$/),
    language: z.enum(browserLanguageTargets),
    appLanguage: z.boolean().default(false),
  })
  .strict()
export type BrowserLanguageRequest = z.infer<typeof browserLanguageRequestSchema>
export interface BrowserProfile {
  id: string
  title: string
  selected: string
  effective: string
  file: string
  appLanguageSupported: boolean
  problem?: string
}
export interface BrowserLanguagePreview {
  id: string
  profile: BrowserProfile
  language: BrowserLanguageRequest['language']
  appLanguage: boolean
  before: string
  after: string
  expiresAt: string
}
export interface BrowserLanguageBackupSummary {
  id: string
  title: string
  createdAt: string
  status: 'prepared' | 'applied' | 'restored'
  language: string
  appLanguage: boolean
}
export interface BrowserLanguageConfiguration {
  profiles: BrowserProfile[]
  backups: BrowserLanguageBackupSummary[]
  problems: string[]
}
const languages = z
  .array(z.string().regex(/^[A-Za-z]{2,8}(?:-[A-Za-z\d]{1,8})*$/))
  .min(1)
  .max(30)
export const browserLanguageBackupSchema = z
  .object({
    id: z.string().uuid(),
    browserId: z.enum(browserIds),
    profile: z.string().regex(/^(?:Default|Profile \d{1,4})$/),
    title: z.string().max(200),
    createdAt: z.string().datetime(),
    status: z.enum(['prepared', 'applied', 'restored']),
    language: z.enum(browserLanguageTargets),
    appLanguage: z.boolean(),
    beforeSelected: z.string().max(1600).nullable(),
    beforeAccepted: z.string().max(1600).nullable(),
    afterSelected: z.string().max(1600),
    beforeAppLanguages: languages.nullable().optional(),
    afterAppLanguages: languages.optional(),
    integrity: z.string().regex(/^[a-f\d]{64}$/),
  })
  .superRefine((record, ctx) => {
    if (
      record.appLanguage &&
      (record.beforeAppLanguages === undefined || !record.afterAppLanguages)
    )
      ctx.addIssue({ code: 'custom', message: '浏览器应用语言备份不完整' })
    if (
      !record.appLanguage &&
      (record.beforeAppLanguages !== undefined || record.afterAppLanguages !== undefined)
    )
      ctx.addIssue({ code: 'custom', message: '浏览器语言备份作用域不一致' })
  })
export type BrowserLanguageBackup = z.infer<typeof browserLanguageBackupSchema>
