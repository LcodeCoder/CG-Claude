import { z } from 'zod'
import { translationSettingsSchema } from '../shared/translation.js'

const encryptedKeySchema = z.object({
  iv: z.string().regex(/^[a-f\d]{24}$/),
  tag: z.string().regex(/^[a-f\d]{32}$/),
  data: z
    .string()
    .regex(/^[a-f\d]+$/)
    .max(32768),
})
export const translationRecordSchema = z.object({
  version: z.literal(1),
  settings: translationSettingsSchema,
  savedAt: z.iso.datetime(),
  credential: encryptedKeySchema.optional(),
})
export type TranslationRecord = z.infer<typeof translationRecordSchema>
