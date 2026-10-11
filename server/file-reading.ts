import { constants, promises as fs } from 'node:fs'
import type { BigIntStats } from 'node:fs'
import { TextDecoder } from 'node:util'

export class FileReadError extends Error {}

/** Preserve UTF-8 bytes, including a BOM; never replace invalid input with characters. */
function decodeText(bytes: Buffer): string {
  if (bytes.includes(0))
    throw new FileReadError('配置含 NUL 字节，可能为 UTF-16 或非文本，请手动核对编码')
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    throw new FileReadError('配置不是有效的 UTF-8 文本，请手动核对编码')
  }
}

function assertRegularFile(stat: BigIntStats): void {
  if (stat.isSymbolicLink()) throw new FileReadError('含符号链接，未读取链接目标')
  if (!stat.isFile()) throw new FileReadError('不是普通文件，请手动检查')
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

async function inspectOpenedPath(target: string): Promise<BigIntStats> {
  const stat = await fs.lstat(target, { bigint: true }).catch(() => {
    throw new FileReadError('文件在读取期间变化，请重新检测')
  })
  assertRegularFile(stat)
  return stat
}

/** Bound actual bytes and verify the opened file and path on every platform. */
export async function readBoundedText(
  target: string,
  limit: number,
): Promise<{ text: string; mode: number }> {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new FileReadError('读取上限无效')
  const inspected = await fs.lstat(target, { bigint: true })
  assertRegularFile(inspected)
  const flags =
    constants.O_RDONLY |
    (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK)
  const handle = await fs.open(target, flags)
  try {
    const before = await handle.stat({ bigint: true })
    if (!before.isFile()) throw new FileReadError('不是普通文件，请手动检查')
    // Windows cannot rely on O_NOFOLLOW; inspect the path again before reading bytes.
    const openedPath = await inspectOpenedPath(target)
    if (!sameFile(inspected, before) || !sameFile(before, openedPath))
      throw new FileReadError('文件在读取期间变化，请重新检测')
    if (before.size > BigInt(limit)) throw new FileReadError('配置超过读取上限，请手动检查')
    const chunks: Buffer[] = []
    let total = 0
    while (total <= limit) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, limit + 1 - total))
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, total)
      if (!bytesRead) break
      total += bytesRead
      if (total > limit) throw new FileReadError('配置超过读取上限，请手动检查')
      chunks.push(chunk.subarray(0, bytesRead))
    }
    const after = await handle.stat({ bigint: true })
    const currentPath = await inspectOpenedPath(target)
    if (
      !sameFile(after, currentPath) ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    )
      throw new FileReadError('文件在读取期间变化，请重新检测')
    return {
      text: decodeText(Buffer.concat(chunks, total)),
      mode: Number(before.mode & 0o777n),
    }
  } finally {
    await handle.close()
  }
}

/** Native filesystem messages can contain absolute home paths; report only useful codes. */
export function fileReadMessage(error: unknown): string {
  if (error instanceof FileReadError) return error.message
  const code = (error as NodeJS.ErrnoException)?.code
  if (code === 'ELOOP') return '含符号链接，未读取链接目标'
  if (code === 'EACCES' || code === 'EPERM') return '文件无法读取，请核对权限'
  if (code === 'ENOTDIR' || code === 'EISDIR') return '配置路径不是普通文件，请手动检查'
  return code && /^[A-Z_0-9]+$/.test(code) ? `文件读取失败（${code}）` : '文件读取失败，请手动检查'
}
