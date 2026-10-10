import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { acquireServiceLock } from '../server/lock'
import { fixture } from './fixtures'
let data: Awaited<ReturnType<typeof fixture>>
beforeEach(async () => {
  data = await fixture()
})
afterEach(async () => {
  await data.cleanup()
})
test('serializes concurrent stale-owner recovery and releases the data directory for the next service', async () => {
  await fs.writeFile(
    path.join(data.ctx.dataDir, 'service.lock'),
    JSON.stringify({ pid: 2147483647, id: 'crashed-service' }),
  )
  const attempts = await Promise.allSettled([
    acquireServiceLock(data.ctx),
    acquireServiceLock(data.ctx),
  ])
  const winner = attempts.filter((result) => result.status === 'fulfilled')
  expect(winner).toHaveLength(1)
  expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1)
  await winner[0]!.value()
  const release = await acquireServiceLock(data.ctx)
  await release()
  await expect(fs.stat(path.join(data.ctx.dataDir, 'service.lock'))).rejects.toMatchObject({
    code: 'ENOENT',
  })
})
