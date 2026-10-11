import { z } from 'zod'

export const translationProtocols = ['openai-compatible', 'anthropic'] as const
export type TranslationProtocol = (typeof translationProtocols)[number]
export function translationEndpoint(baseUrl: string, protocol: TranslationProtocol): string {
  const url = new URL(baseUrl)
  const suffix = protocol === 'anthropic' ? '/messages' : '/chat/completions'
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = path.endsWith(suffix) ? path : `${path || '/v1'}${suffix}`
  return url.href
}
function validEndpoint(value: string) {
  try {
    const url = new URL(value)
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    return (
      (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}
export const translationSettingsSchema = z.object({
  protocol: z.enum(translationProtocols),
  baseUrl: z.string().trim().min(1).max(2048).refine(validEndpoint, {
    message: '使用 HTTPS 地址，或本机 HTTP 地址；地址中不要包含密钥、查询参数或账号密码',
  }),
  model: z
    .string()
    .trim()
    .min(1, '请填写模型名称')
    .max(200)
    .regex(/^[^\x00-\x1f\x7f]+$/),
  auth: z.enum(['api-key', 'none']),
  tokenLimitParameter: z.enum(['max_tokens', 'max_completion_tokens']).default('max_tokens'),
  timeoutSeconds: z.number().int().min(5).max(60).default(20),
})
export const translationRequestSchema = translationSettingsSchema
  .extend({
    // An omitted key preserves a saved key only for the identical protocol and endpoint.
    apiKey: z
      .string()
      .trim()
      .min(1)
      .max(4096)
      .regex(/^[^\s\x00-\x1f\x7f]+$/)
      .optional(),
  })
  .strict()
export type TranslationSettings = z.infer<typeof translationSettingsSchema>
export type TranslationRequest = z.infer<typeof translationRequestSchema>
export interface TranslationConfiguration {
  settings?: TranslationSettings
  hasApiKey: boolean
  savedAt?: string
}
export interface TranslationTestResult {
  testedAt: string
  durationMs: number
  samples: { direction: 'zh-en' | 'en-zh'; source: string; translated: string }[]
}
export const translationSamples = [
  { direction: 'zh-en' as const, source: '请检查这个项目，并修复测试。' },
  { direction: 'en-zh' as const, source: 'I will inspect the project and fix the failing tests.' },
]
