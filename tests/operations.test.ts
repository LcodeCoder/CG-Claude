import { expect, test } from 'vitest'
import { OperationCoordinator } from '../server/operations'
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
test('serializes operations and safely waits for the active operation during shutdown', async () => {
  const operations = new OperationCoordinator()
  const gate = deferred<string>()
  const active = operations.run({ kind: 'mutation', label: '保存' }, () => gate.promise)
  await expect(
    operations.run({ kind: 'scan', label: '检测' }, async () => 'unexpected'),
  ).rejects.toMatchObject({ status: 409 })
  let closed = false
  const closing = operations.close().then(() => {
    closed = true
  })
  expect(operations.status().closing).toBe(true)
  await expect(
    operations.run({ kind: 'mutation', label: '保存' }, async () => 'unexpected'),
  ).rejects.toMatchObject({ status: 503 })
  expect(closed).toBe(false)
  gate.resolve('saved')
  expect(await active).toBe('saved')
  await closing
  expect(closed).toBe(true)
  expect(operations.busy).toBe(false)
})
test('background tasks return the prepared ID but retain exclusive ownership through execution', async () => {
  const operations = new OperationCoordinator()
  const gate = deferred<void>()
  const task = await operations.start(
    { kind: 'scan', label: '检测' },
    async () => ({ id: 'scan-id' }),
    () => gate.promise,
    () => {
      throw new Error('unexpected')
    },
  )
  expect(task.id).toBe('scan-id')
  expect(operations.busy).toBe(true)
  const closing = operations.close()
  gate.resolve()
  await closing
  expect(operations.busy).toBe(false)
})
test('failed preparation and execution release ownership and record task failure', async () => {
  const operations = new OperationCoordinator()
  await expect(
    operations.start(
      { kind: 'setup', label: '配置' },
      async () => {
        throw new Error('prepare-failed')
      },
      async () => {},
      () => {},
    ),
  ).rejects.toThrow('prepare-failed')
  expect(operations.busy).toBe(false)
  const gate = deferred<void>()
  const task = await operations.start(
    { kind: 'setup', label: '配置' },
    async () => ({ status: 'running' }),
    () => gate.promise,
    (value) => {
      value.status = 'failed'
    },
  )
  gate.reject(new Error('execute-failed'))
  await operations.close()
  expect(task.status).toBe('failed')
  expect(operations.busy).toBe(false)
})
