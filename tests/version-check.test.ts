import { expect, test, vi } from 'vitest'
import { createContext } from '../server/context'
import { compareVersions, VersionChecker } from '../server/version-check'
import { PROJECT_URL } from '../shared/app-settings'
const ctx = createContext({ env: {}, demo: true })
const release = (tag = 'v1.2.10') => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  published_at: '2026-10-11T00:00:00Z',
  html_url: 'https://untrusted.example/download',
})

test('compares numeric version segments, not alphabetical order', () => {
  expect(compareVersions('1.2.10', 'v1.2.9')).toBe(1)
  expect(compareVersions('2.0.0', '1.99.99')).toBe(1)
  expect(compareVersions('1.2.5', '1.2.5')).toBe(0)
  expect(() => compareVersions('1.2.5-beta', '1.2.5')).toThrow()
})
test.each([
  ['v1.2.10', 'available'],
  ['v1.2.9', 'current'],
  ['v1.2.8', 'ahead'],
])('validates a stable release and rebuilds its link (%s)', async (tag, status) => {
  const checker = new VersionChecker(ctx, '1.2.9', async () => ({
    status: 200,
    value: release(tag),
  }))
  const result = await checker.check()
  expect(result.status).toBe(status)
  expect(result.releaseUrl).toBe(PROJECT_URL + '/releases/tag/' + tag)
})
test.each([
  { ...release(), draft: true },
  { ...release(), prerelease: true },
  release('v1.2.10/evil'),
  release('v1.2.10-beta'),
])('rejects unverified release records', async (value) => {
  await expect(
    new VersionChecker(ctx, '1.2.9', async () => ({ status: 200, value })).check(),
  ).rejects.toThrow(/无法验证/)
})
test('handles no published release without calling it up to date', async () => {
  const result = await new VersionChecker(ctx, '1.2.9', async () => ({ status: 404 })).check()
  expect(result.status).toBe('unpublished')
  expect(result.releaseUrl).toBeUndefined()
})
test('deduplicates concurrent requests and caches successful checks briefly', async () => {
  let resolve!: (value: { status: number; value: unknown }) => void
  const transport = vi.fn(
    () => new Promise<{ status: number; value: unknown }>((done) => (resolve = done)),
  )
  const checker = new VersionChecker(ctx, '1.2.9', transport)
  const a = checker.check(),
    b = checker.check()
  expect(transport).toHaveBeenCalledTimes(1)
  resolve({ status: 200, value: release() })
  expect(await a).toEqual(await b)
  await checker.check()
  expect(transport).toHaveBeenCalledTimes(1)
})
test('failed checks can be retried and rate limits remain distinct', async () => {
  const transport = vi
    .fn()
    .mockRejectedValueOnce(new Error('private detail'))
    .mockResolvedValueOnce({ status: 429 })
    .mockResolvedValueOnce({ status: 200, value: release() })
  const checker = new VersionChecker(ctx, '1.2.9', transport)
  await expect(checker.check()).rejects.toThrow(/检查网络/)
  await expect(checker.check()).rejects.toThrow(/请求受限/)
  expect((await checker.check()).status).toBe('available')
  expect(transport).toHaveBeenCalledTimes(3)
})
