import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { readBoundedText, fileReadMessage } from '../server/file-reading'
import { readConfig } from '../server/safety'
import { readProjectFiles } from '../server/project-files'
import { fixture } from './fixtures'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})
async function data() {
  const value = await fixture()
  cleanups.push(value.cleanup)
  return value
}

test('reads a bounded UTF-8 file and preserves captured file permissions', async () => {
  const item = await data()
  await item.write('.zshrc', '你好，配置\n')
  const result = await readConfig(item.ctx, '.zshrc')
  expect(result.content).toBe('你好，配置\n')
  expect(result.editable).toBe(true)
  if (process.platform !== 'win32') expect(result.mode).toBe(0o600)
})

test('empty files are readable at a zero-byte limit and content beyond the limit is rejected', async () => {
  const item = await data()
  const file = path.join(item.home, '.zshrc')
  await item.write('.zshrc', '')
  expect((await readBoundedText(file, 0)).text).toBe('')
  await item.write('.zshrc', '12345')
  await expect(readBoundedText(file, 4)).rejects.toThrow('读取上限')
})

test('actual bytes remain bounded when preflight metadata understates file size', async () => {
  const item = await data()
  await item.write('.zshrc', '12345678')
  const realOpen = fs.open.bind(fs)
  let closeSpy: ReturnType<typeof vi.spyOn> | undefined
  vi.spyOn(fs, 'open').mockImplementationOnce(async (...args: Parameters<typeof fs.open>) => {
    const handle = await realOpen(...args)
    const stat = await handle.stat({ bigint: true })
    vi.spyOn(handle, 'stat').mockResolvedValueOnce({
      ...stat,
      size: 0n,
      isFile: () => true,
    } as typeof stat)
    closeSpy = vi.spyOn(handle, 'close')
    return handle
  })
  await expect(readBoundedText(path.join(item.home, '.zshrc'), 4)).rejects.toThrow('读取上限')
  expect(closeSpy).toHaveBeenCalledOnce()
})

test('an observed change during read returns no mixed content and closes the descriptor', async () => {
  const item = await data()
  await item.write('.zshrc', 'original')
  const realOpen = fs.open.bind(fs)
  let closeSpy: ReturnType<typeof vi.spyOn> | undefined
  vi.spyOn(fs, 'open').mockImplementationOnce(async (...args: Parameters<typeof fs.open>) => {
    const handle = await realOpen(...args)
    const stat = await handle.stat({ bigint: true })
    vi.spyOn(handle, 'stat')
      .mockResolvedValueOnce(stat)
      .mockResolvedValueOnce({ ...stat, mtimeNs: stat.mtimeNs + 1n } as typeof stat)
    closeSpy = vi.spyOn(handle, 'close')
    return handle
  })
  await expect(readBoundedText(path.join(item.home, '.zshrc'), 1024)).rejects.toThrow(
    '读取期间变化',
  )
  expect(closeSpy).toHaveBeenCalledOnce()
})

test.skipIf(process.platform === 'win32')(
  'a leaf swapped to a symlink between path inspection and open is refused',
  async () => {
    const item = await data()
    await item.write('.zshrc', 'original')
    const outside = path.join(item.root, 'private-outside')
    const target = path.join(item.home, '.zshrc')
    await fs.writeFile(outside, 'PRIVATE_OUTSIDE_CONTENT')
    const realOpen = fs.open.bind(fs)
    vi.spyOn(fs, 'open').mockImplementationOnce(async (...args: Parameters<typeof fs.open>) => {
      await fs.unlink(target)
      await fs.symlink(outside, target)
      return realOpen(...args)
    })
    const result = await readConfig(item.ctx, '.zshrc')
    expect(result.editable).toBe(false)
    expect(result.content).toBeNull()
    expect(result.error).toContain('符号链接')
    expect(JSON.stringify(result)).not.toContain('PRIVATE_OUTSIDE_CONTENT')
  },
)

test('project lock and dotenv files are metadata only and never opened for content', async () => {
  const item = await data()
  await item.write('.env', 'PRIVATE_DOTENV')
  await item.write('bun.lock', 'LOCK_CONTENT'.repeat(100000))
  const spy = vi.spyOn(fs, 'open')
  const files = await readProjectFiles(item.home)
  expect(files.get('.env')).toEqual({ exists: true })
  expect(files.get('bun.lock')).toEqual({ exists: true })
  expect(
    spy.mock.calls.some(
      (call) => String(call[0]).endsWith('/.env') || String(call[0]).endsWith('/bun.lock'),
    ),
  ).toBe(false)
})

test('native filesystem diagnostics do not leak absolute home paths', () => {
  expect(
    fileReadMessage(
      Object.assign(new Error('EACCES /Users/PRIVATE_NAME/config'), { code: 'EACCES' }),
    ),
  ).toBe('文件无法读取，请核对权限')
  expect(fileReadMessage(new Error('unexpected /Users/PRIVATE_NAME/config'))).not.toContain(
    'PRIVATE_NAME',
  )
})

test.each([
  ['an invalid UTF-8 sequence', Buffer.from([0xc3, 0x28])],
  ['an incomplete UTF-8 sequence', Buffer.from([0xe4, 0xbd])],
  ['UTF-16 with a BOM', Buffer.from([0xff, 0xfe, 0x61, 0x00])],
  ['UTF-16 without a BOM', Buffer.from('export HTTPS_PROXY=x', 'utf16le')],
])('refuses %s encoding without exposing or changing bytes', async (_label, bytes) => {
  const item = await data()
  const target = path.join(item.home, '.zshrc')
  await fs.writeFile(target, bytes)
  const result = await readConfig(item.ctx, '.zshrc')
  expect(result.editable).toBe(false)
  expect(result.content).toBeNull()
  expect(result.error).toMatch(/UTF-8|NUL/)
  expect(await fs.readFile(target)).toEqual(bytes)
  await expect(readBoundedText(target, 1024)).rejects.toThrow(/UTF-8|NUL/)
})

test('preserves UTF-8 BOM, Chinese text and CRLF bytes when decoding', async () => {
  const item = await data()
  const original = Buffer.from('\ufeff# 中文配置\r\nexport NO_PROXY=localhost\r\n')
  await fs.writeFile(path.join(item.home, '.zshrc'), original)
  const result = await readConfig(item.ctx, '.zshrc')
  expect(result.editable).toBe(true)
  expect(Buffer.from(result.content!)).toEqual(original)
})

test('project encoding errors remain visible instead of returning replaced text', async () => {
  const item = await data()
  await item.write('.claude/settings.json', '{}')
  await fs.writeFile(path.join(item.home, '.claude/settings.json'), Buffer.from([0xc3, 0x28]))
  const files = await readProjectFiles(item.home)
  expect(files.get('.claude/settings.json')).toMatchObject({
    exists: true,
    error: expect.stringContaining('UTF-8'),
  })
  expect(files.get('.claude/settings.json')?.content).toBeUndefined()
})
