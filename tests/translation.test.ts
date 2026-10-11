import { createServer } from 'node:http'
import { createServer as createTlsServer } from 'node:https'
import { createConnection } from 'node:net'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { fixture } from './fixtures'
import { TranslationService } from '../server/translation'
import {
  translationEndpoint,
  translationRequestSchema,
  translationSamples,
} from '../shared/translation'
import type { TranslationRequest } from '../shared/translation'
import { createAppServer } from '../server/index'

let data: Awaited<ReturnType<typeof fixture>>
let service: TranslationService
let servers: ReturnType<typeof createServer>[]
let request: TranslationRequest
let received: {
  url?: string
  auth?: string
  key?: string
  version?: string
  body: Record<string, unknown>
}[]
let reply: (req: IncomingMessage, res: ServerResponse, body: Record<string, unknown>) => void
async function mockServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
) {
  const server = createServer((req, res) => {
    void handler(req, res)
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
beforeEach(async () => {
  data = await fixture()
  service = new TranslationService(data.storage)
  servers = []
  received = []
  reply = (_req, res, body) => {
    const english = JSON.stringify(body).includes('faithfully into English')
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: english
                ? 'Check this project and fix the tests.'
                : '我会检查项目并修复失败的测试。',
            },
            finish_reason: 'stop',
          },
        ],
      }),
    )
  }
  const baseUrl = await mockServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
    received.push({
      url: req.url,
      auth: req.headers.authorization,
      key: req.headers['x-api-key'] as string,
      version: req.headers['anthropic-version'] as string,
      body,
    })
    reply(req, res, body)
  })
  request = translationRequestSchema.parse({
    protocol: 'openai-compatible',
    baseUrl,
    model: 'fixture-translator',
    auth: 'api-key',
    apiKey: 'fixture-translation-key',
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const server of servers) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  await data.cleanup()
})
test('stores encrypted credentials, returns only metadata, and reuses them after a service restart', async () => {
  const config = await service.save(request)
  expect(config).toMatchObject({ hasApiKey: true, settings: { model: request.model } })
  const bytes = await fs.readFile(path.join(data.ctx.dataDir, 'translation-settings.json'), 'utf8')
  expect(bytes).not.toContain(request.apiKey)
  expect(JSON.stringify(config)).not.toContain(request.apiKey)
  if (process.platform !== 'win32') {
    for (const file of ['translation-settings.json', 'translation-key.json'])
      expect((await fs.stat(path.join(data.ctx.dataDir, file))).mode & 0o777).toBe(0o600)
  }
  const { apiKey: _key, ...withoutKey } = request
  const result = await new TranslationService(data.storage).test(withoutKey)
  expect(result.samples.map((sample) => sample.direction)).toEqual(['zh-en', 'en-zh'])
  expect(received).toHaveLength(2)
  for (let i = 0; i < received.length; i++) {
    expect(received[i]?.url).toBe('/v1/chat/completions')
    expect(received[i]?.auth).toBe('Bearer fixture-translation-key')
    expect(received[i]?.body).toMatchObject({
      model: request.model,
      stream: false,
      max_tokens: 512,
    })
    expect(received[i]?.body.messages).toEqual([
      expect.objectContaining({ role: 'system' }),
      { role: 'user', content: translationSamples[i]?.source },
    ])
  }
  expect(await service.configuration()).toEqual(config)
})
test('does not save draft connection tests or forward a stored credential to a changed endpoint', async () => {
  await service.test(request)
  expect(await service.configuration()).toEqual({ hasApiKey: false })
  await service.save(request)
  const { apiKey: _key, ...withoutKey } = request
  await expect(
    service.test({ ...withoutKey, baseUrl: request.baseUrl + '/another' }),
  ).rejects.toThrow('原密钥不会发送到新地址')
  await expect(service.save({ ...withoutKey, protocol: 'anthropic' })).rejects.toThrow(
    '原密钥不会发送到新地址',
  )
  expect(received).toHaveLength(2)
  const saved = await service.save({ ...withoutKey, model: 'another-fixture-model' })
  expect(saved.hasApiKey).toBe(true)
  await service.save({ ...withoutKey, auth: 'none' })
  expect((await service.configuration()).hasApiKey).toBe(false)
  await service.test({ ...withoutKey, auth: 'none' })
  expect(received.at(-1)?.auth).toBeUndefined()
})
test('uses Messages protocol and ignores non-text response blocks', async () => {
  reply = (_req, res, body) =>
    res.end(
      JSON.stringify({
        content: [
          { type: 'thinking', thinking: 'fixture internal text', signature: 'fixture signature' },
          {
            type: 'text',
            text: String(body.system).includes('into English')
              ? 'Check this project and fix the tests.'
              : '我会检查项目并修复失败的测试。',
          },
        ],
        stop_reason: 'end_turn',
      }),
    )
  const result = await service.test({ ...request, protocol: 'anthropic' })
  expect(received[0]).toMatchObject({
    url: '/v1/messages',
    key: request.apiKey,
    version: '2023-06-01',
    body: { max_tokens: 512 },
  })
  expect(received[0]?.body.messages).toEqual([
    { role: 'user', content: translationSamples[0]?.source },
  ])
  expect(JSON.stringify(result)).not.toContain('fixture internal text')
})
test('supports the current OpenAI token-limit parameter without silently retrying billable requests', async () => {
  await service.test({ ...request, tokenLimitParameter: 'max_completion_tokens' })
  expect(received[0]?.body.max_completion_tokens).toBe(512)
  expect(received[0]?.body.max_tokens).toBeUndefined()
  expect(received).toHaveLength(2)
})
test('rejects redirects before the credential can reach another endpoint', async () => {
  let leaked = false
  const destination = await mockServer((_req, res) => {
    leaked = true
    res.end('{}')
  })
  reply = (_req, res) => {
    res.writeHead(307, { Location: destination })
    res.end()
  }
  await expect(service.test(request)).rejects.toThrow('重定向')
  expect(leaked).toBe(false)
  expect(received).toHaveLength(1)
})
test.each([
  [401, '密钥与模型权限'],
  [404, 'API 地址'],
  [429, '服务限流'],
  [500, '所选协议'],
])(
  'reports HTTP %s without echoing upstream secrets or saving a tested draft',
  async (status, message) => {
    reply = (_req, res) => {
      res.statusCode = status
      res.end(JSON.stringify({ error: { message: request.apiKey } }))
    }
    const failure = await service.test(request).catch((error: Error) => error.message)
    expect(failure).toContain(message)
    expect(failure).not.toContain(request.apiKey)
    expect(received).toHaveLength(1)
    expect((await service.configuration()).settings).toBeUndefined()
  },
)
test.each([
  ['not JSON', '有效 JSON'],
  ['{}', '格式'],
  [
    JSON.stringify({ choices: [{ message: { role: 'assistant', content: '中文未翻译' } }] }),
    '目标语言',
  ],
  [JSON.stringify({ choices: [{ message: { role: 'assistant', content: '' } }] }), '可显示的译文'],
  [
    JSON.stringify({
      choices: [
        { message: { role: 'assistant', content: 'Partial translation' }, finish_reason: 'length' },
      ],
    }),
    '截断',
  ],
])('rejects unusable translation responses', async (body, message) => {
  reply = (_req, res) => {
    res.end(body)
  }
  await expect(service.test(request)).rejects.toThrow(message)
})
test('bounds actual response bytes and an overall test deadline', async () => {
  reply = (_req, res) => {
    res.end('x'.repeat(128 * 1024 + 1))
  }
  await expect(service.test(request)).rejects.toThrow('128 KB')
  reply = () => {}
  await expect(service.test({ ...request, timeoutSeconds: 5 })).rejects.toThrow('超时')
}, 10000)
test.each([
  'http://remote.example/v1',
  'https://user:secret@example.com/v1',
  'https://example.com/v1?key=secret',
  'file:///tmp/secret',
  'https://example.com/v1#secret',
])('rejects an unsafe endpoint before saving or requesting: %s', (baseUrl) => {
  expect(translationRequestSchema.safeParse({ ...request, baseUrl }).success).toBe(false)
  expect(received).toHaveLength(0)
})
test('normalizes base and full endpoint addresses consistently', () => {
  expect(translationEndpoint('https://api.example.com/v1/', 'openai-compatible')).toBe(
    'https://api.example.com/v1/chat/completions',
  )
  expect(
    translationEndpoint('https://api.example.com/v1/chat/completions', 'openai-compatible'),
  ).toBe('https://api.example.com/v1/chat/completions')
  expect(translationEndpoint('https://api.example.com', 'anthropic')).toBe(
    'https://api.example.com/v1/messages',
  )
})
test('preserves records on a missing or tampered encryption key and refuses linked secret files', async () => {
  await service.save(request)
  const target = path.join(data.ctx.dataDir, 'translation-key.json')
  const original = await fs.readFile(target)
  const { apiKey: _key, ...withoutKey } = request
  await fs.unlink(target)
  await expect(service.test(withoutKey)).rejects.toThrow('加密密钥缺失')
  await fs.writeFile(target, JSON.stringify('0'.repeat(64)), { mode: 0o600 })
  await expect(service.test(withoutKey)).rejects.toThrow('无法解密')
  await fs.unlink(target)
  const linked = path.join(data.root, 'linked-secret.json')
  await fs.writeFile(linked, original, { mode: 0o600 })
  await fs.link(linked, target)
  await expect(service.test(withoutKey)).rejects.toThrow('无法读取')
  expect(await fs.readFile(linked)).toEqual(original)
  expect(received).toHaveLength(0)
})

test.each(['http', 'https'])(
  'rejects untrusted certificates through an %s proxy even when global TLS checks are disabled',
  async (protocol) => {
    const tls = JSON.parse(
      await fs.readFile(new URL('./fixtures/translation-tls.json', import.meta.url), 'utf8'),
    ) as { key: string; cert: string }
    let originRequests = 0
    const origin = createTlsServer(tls, async (req, res) => {
      originRequests++
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk)
      reply(req, res, JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
    })
    servers.push(origin)
    await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve))
    const originPort = (origin.address() as { port: number }).port
    const proxy = protocol === 'https' ? createTlsServer(tls) : createServer()
    proxy.on('connect', (_req, client, head) => {
      const upstream = createConnection({ host: '127.0.0.1', port: originPort }, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        upstream.pipe(client)
        client.pipe(upstream)
      })
      const close = () => {
        client.destroy()
        upstream.destroy()
      }
      client.on('error', close)
      upstream.on('error', close)
      client.on('close', () => upstream.destroy())
      upstream.on('close', () => client.destroy())
    })
    servers.push(proxy)
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
    data.ctx.env = {
      HTTPS_PROXY: protocol + '://127.0.0.1:' + (proxy.address() as { port: number }).port,
      NO_PROXY: '',
    }
    vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', '0')
    try {
      await expect(
        service.test({ ...request, baseUrl: 'https://translation-test.invalid/v1' }),
      ).rejects.toThrow('TLS')
      expect(originRequests).toBe(0)
    } finally {
      vi.unstubAllEnvs()
    }
  },
)

test('protects translation API mutations and keeps credentials out of bootstrap and returned metadata', async () => {
  const app = await createAppServer({ ctx: data.ctx, port: 0 })
  const base = `http://127.0.0.1:${await app.listen()}`
  try {
    const bootstrapResponse = await fetch(base + '/api/bootstrap')
    expect(bootstrapResponse.status).toBe(200)
    const bootstrap = await bootstrapResponse.json()
    const send = (route: string, method: string, token = bootstrap.token) =>
      fetch(base + route, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-CG-Token': token },
        body: JSON.stringify(request),
      })
    expect((await send('/api/translation/settings', 'PUT', '')).status).toBe(403)
    expect((await send('/api/translation/test', 'POST', '')).status).toBe(403)
    const saved = await send('/api/translation/settings', 'PUT')
    expect(saved.status).toBe(200)
    expect(await saved.text()).not.toContain(request.apiKey)
    expect((await send('/api/translation/test', 'POST')).status).toBe(200)
    const state = await (await fetch(base + '/api/bootstrap')).text()
    expect(state).not.toContain(request.apiKey)
    expect(JSON.parse(state).translation.hasApiKey).toBe(true)
    expect(await (await fetch(base + '/api/translation/settings')).text()).not.toContain(
      request.apiKey,
    )
  } finally {
    await app.close()
  }
})
