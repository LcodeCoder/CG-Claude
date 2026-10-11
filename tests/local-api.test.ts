import { afterEach, expect, test, vi } from 'vitest'
import { createLocalApi } from '../src/lib/local-api'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
function fakeTimeouts() {
  vi.useFakeTimers()
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    const controller = new AbortController()
    setTimeout(
      () => controller.abort(new DOMException('fixture-timeout', 'TimeoutError')),
      milliseconds,
    )
    return controller.signal
  })
}
function delayedFetch(milliseconds: number): typeof fetch {
  return vi.fn(
    (_url, init) =>
      new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(Response.json({ saved: true })), milliseconds)
        init?.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            reject(init.signal?.reason)
          },
          { once: true },
        )
      }),
  )
}

test('allows native authorization to take longer than 20 seconds without reporting disconnection', async () => {
  fakeTimeouts()
  const connection = vi.fn()
  const api = createLocalApi({
    token: () => 'fixture-token',
    connection,
    fetch: delayedFetch(30_000),
  })
  const pending = api('/snapshot-plans/fixture/restore', { method: 'POST', body: '{}' })
  await vi.advanceTimersByTimeAsync(20_000)
  expect(connection).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(10_000)
  expect(await pending).toEqual({ saved: true })
  expect(connection).toHaveBeenLastCalledWith(true, '')
})

test('read requests still time out promptly', async () => {
  fakeTimeouts()
  const connection = vi.fn()
  const api = createLocalApi({ token: () => '', connection, fetch: delayedFetch(30_000) })
  const result = expect(api('/status')).rejects.toThrow('响应超时')
  await vi.advanceTimersByTimeAsync(20_000)
  await result
  expect(connection).toHaveBeenCalledWith(false, expect.stringContaining('响应超时'))
})

test('never describes a disconnected write as a confirmed failure or invites an immediate repeat', async () => {
  const connection = vi.fn()
  const api = createLocalApi({
    token: () => '',
    connection,
    fetch: vi.fn().mockRejectedValue(new TypeError('fixture-private-transport-detail')),
  })
  await expect(api('/preferences', { method: 'PUT', body: '{}' })).rejects.toThrow('核对进度与备份')
  expect(connection).toHaveBeenCalledWith(false, expect.not.stringContaining('fixture-private'))
})

test('rejects non-JSON or malformed responses and maintains connectivity for a valid rejection', async () => {
  const connection = vi.fn()
  const transport = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('<html>fixture</html>', { headers: { 'Content-Type': 'text/html' } }),
    )
    .mockResolvedValueOnce(
      new Response('{broken}', { headers: { 'Content-Type': 'application/json' } }),
    )
    .mockResolvedValueOnce(Response.json({ error: '配置在预览后发生变化' }, { status: 400 }))
  const api = createLocalApi({ token: () => 'fixture-token', connection, fetch: transport })
  await expect(api('/bootstrap')).rejects.toThrow('响应无法读取')
  await expect(api('/preferences', { method: 'PUT' })).rejects.toThrow('实际结果与备份')
  await expect(api('/repairs/fixture/apply', { method: 'POST' })).rejects.toThrow('预览后发生变化')
  expect(connection).toHaveBeenLastCalledWith(true, '')
  const headers = transport.mock.calls[2]![1].headers as Headers
  expect(headers.get('X-CG-Token')).toBe('fixture-token')
})
