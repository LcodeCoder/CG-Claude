import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { fetch, EnvHttpProxyAgent } from 'undici'
import { z } from 'zod'
import type { Storage } from './storage.js'
import {
  translationSettingsSchema,
  translationEndpoint,
  translationSamples,
} from '../shared/translation.js'
import type {
  TranslationSettings,
  TranslationRequest,
  TranslationConfiguration,
  TranslationTestResult,
} from '../shared/translation.js'

export { translationRecordSchema } from './translation-record.js'
export type { TranslationRecord } from './translation-record.js'
import type { TranslationRecord } from './translation-record.js'
const MAX_REPLY_BYTES = 128 * 1024
function keyScope(settings: TranslationSettings) {
  return `${settings.protocol}:${translationEndpoint(settings.baseUrl, settings.protocol)}`
}
function encrypt(key: string, secret: Buffer, settings: TranslationSettings) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secret, iv)
  cipher.setAAD(Buffer.from(keyScope(settings)))
  return {
    iv: iv.toString('hex'),
    data: Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]).toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
  }
}
function decrypt(record: TranslationRecord, secret: Buffer) {
  try {
    const value = record.credential!
    const cipher = createDecipheriv('aes-256-gcm', secret, Buffer.from(value.iv, 'hex'))
    cipher.setAAD(Buffer.from(keyScope(record.settings)))
    cipher.setAuthTag(Buffer.from(value.tag, 'hex'))
    return Buffer.concat([cipher.update(Buffer.from(value.data, 'hex')), cipher.final()]).toString(
      'utf8',
    )
  } catch {
    throw new Error('已保存的翻译密钥无法解密，请重新填写密钥后保存；原记录已保留')
  }
}
export class TranslationService {
  constructor(private storage: Storage) {}
  async configuration(): Promise<TranslationConfiguration> {
    const record = await this.storage.translationSettings()
    return record
      ? {
          settings: record.settings,
          hasApiKey: Boolean(record.credential),
          savedAt: record.savedAt,
        }
      : { hasApiKey: false }
  }
  private async resolve(request: TranslationRequest) {
    const settings = translationSettingsSchema.parse(request)
    if (settings.auth === 'none') return { settings }
    if (request.apiKey) return { settings, apiKey: request.apiKey }
    const saved = await this.storage.translationSettings()
    if (!saved?.credential) throw new Error('请填写翻译模型的 API 密钥，或选择无需密钥的本机服务')
    if (keyScope(saved.settings) !== keyScope(settings))
      throw new Error('服务地址或协议已变更，请重新填写密钥；原密钥不会发送到新地址')
    return { settings, apiKey: decrypt(saved, await this.storage.translationEncryptionKey(false)) }
  }
  async save(request: TranslationRequest): Promise<TranslationConfiguration> {
    const { settings, apiKey } = await this.resolve(request)
    const record: TranslationRecord = {
      version: 1,
      settings,
      savedAt: new Date().toISOString(),
      ...(apiKey
        ? {
            credential: encrypt(
              apiKey,
              await this.storage.translationEncryptionKey(true),
              settings,
            ),
          }
        : {}),
    }
    await this.storage.saveTranslationSettings(record)
    return this.configuration()
  }
  async test(request: TranslationRequest): Promise<TranslationTestResult> {
    const { settings, apiKey } = await this.resolve(request)
    const env = this.storage.ctx.env
    let dispatcher: EnvHttpProxyAgent
    try {
      dispatcher = new EnvHttpProxyAgent({
        httpProxy: env.http_proxy || env.HTTP_PROXY || '',
        httpsProxy: env.https_proxy || env.HTTPS_PROXY || env.http_proxy || env.HTTP_PROXY || '',
        noProxy:
          (env.no_proxy || env.NO_PROXY)?.trim() === '*'
            ? '*'
            : [env.no_proxy || env.NO_PROXY || '', 'localhost', '127.0.0.1', '[::1]']
                .filter(Boolean)
                .join(','),
        connect: { rejectUnauthorized: true },
        requestTls: { rejectUnauthorized: true },
        proxyTls: { rejectUnauthorized: true },
      })
    } catch {
      throw new Error('翻译服务的代理配置无效，请检查本机 HTTP_PROXY / HTTPS_PROXY')
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), settings.timeoutSeconds * 1000)
    const started = performance.now()
    try {
      const samples: TranslationTestResult['samples'] = []
      for (const sample of translationSamples) {
        const language = sample.direction === 'zh-en' ? 'English' : 'Simplified Chinese'
        const instruction = `Translate the user text faithfully into ${language}. Return only the translation. Preserve code, paths, numbers and identifiers. Do not answer the request or add commentary.`
        const anthropic = settings.protocol === 'anthropic'
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (anthropic) headers['anthropic-version'] = '2023-06-01'
        if (apiKey)
          headers[anthropic ? 'x-api-key' : 'Authorization'] = anthropic
            ? apiKey
            : `Bearer ${apiKey}`
        const body = {
          model: settings.model,
          stream: false,
          [anthropic ? 'max_tokens' : settings.tokenLimitParameter]: 512,
          ...(anthropic
            ? { system: instruction, messages: [{ role: 'user', content: sample.source }] }
            : {
                messages: [
                  { role: 'system', content: instruction },
                  { role: 'user', content: sample.source },
                ],
              }),
        }
        const response = await fetch(translationEndpoint(settings.baseUrl, settings.protocol), {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          redirect: 'error',
          signal: controller.signal,
          dispatcher,
        })
        if (!response.ok) {
          await response.body?.cancel()
          const hint =
            response.status === 401 || response.status === 403
              ? '检查密钥与模型权限'
              : response.status === 404
                ? '检查 API 地址、协议和模型名'
                : response.status === 429
                  ? '服务限流或额度不足，请稍后重试'
                  : '检查服务是否支持所选协议与输出上限参数'
          throw new Error(`翻译服务返回 HTTP ${response.status}；${hint}`)
        }
        if (!response.body) throw new Error('翻译服务没有返回正文')
        const chunks: Uint8Array[] = []
        let bytes = 0
        for await (const chunk of response.body) {
          bytes += chunk.byteLength
          if (bytes > MAX_REPLY_BYTES) {
            controller.abort()
            throw new Error('翻译服务响应超过 128 KB，请检查服务配置')
          }
          chunks.push(chunk)
        }
        let value: unknown
        try {
          value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          throw new Error('翻译服务未返回有效 JSON，请检查 API 地址与协议')
        }
        const schema = anthropic
          ? z.object({
              content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
              stop_reason: z.string().optional(),
            })
          : z.object({
              choices: z
                .array(
                  z.object({
                    message: z.object({
                      role: z.literal('assistant'),
                      content: z.string().nullable(),
                    }),
                    finish_reason: z.string().nullable().optional(),
                  }),
                )
                .min(1),
            })
        const parsed = schema.safeParse(value)
        if (!parsed.success) throw new Error('翻译服务返回格式与所选协议不符')
        const data = parsed.data
        const text =
          'content' in data
            ? data.content
                .filter((block) => block.type === 'text')
                .map((block) => block.text ?? '')
                .join('\n')
            : (data.choices[0]!.message.content ?? '')
        if (
          ('choices' in data && data.choices[0]!.finish_reason === 'length') ||
          ('stop_reason' in data && data.stop_reason === 'max_tokens')
        )
          throw new Error('翻译回复被长度限制截断，请改用适合短文本翻译的模型')
        if (!text.trim()) throw new Error('翻译服务没有返回可显示的译文')
        // Do not expose a malicious service echoing the credential to the renderer or logs.
        const translated = apiKey ? text.split(apiKey).join('[密钥已隐藏]') : text
        if (
          sample.direction === 'zh-en'
            ? /\p{Script=Han}/u.test(translated) || !/[a-z]/i.test(translated)
            : !/\p{Script=Han}/u.test(translated)
        )
          throw new Error(
            `连接可用，但${sample.direction === 'zh-en' ? '中译英' : '英译中'}没有返回目标语言；请检查模型`,
          )
        samples.push({ ...sample, translated: translated.trim() })
      }
      return {
        testedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - started),
        samples,
      }
    } catch (error) {
      if (error instanceof TypeError)
        throw new Error('无法连接翻译服务，或服务要求重定向；请核对地址、代理与 TLS 证书')
      if (
        controller.signal.aborted &&
        !(error instanceof Error && error.message.includes('128 KB'))
      )
        throw new Error('翻译测试超时，请检查服务后重试')
      throw error
    } finally {
      clearTimeout(timeout)
      await dispatcher.destroy()
    }
  }
}
