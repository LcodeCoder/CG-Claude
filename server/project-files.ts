import { promises as fs } from 'node:fs'
import path from 'node:path'
import { FileReadError, fileReadMessage, readBoundedText } from './file-reading.js'

export const projectFiles = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.mcp.json',
  '.npmrc',
  '.git/config',
  '.gitignore',
  'CLAUDE.md',
  '.env',
  '.env.local',
] as const
export interface ProjectFileState {
  exists: boolean
  content?: string
  error?: string
}
const metadataOnly = new Set<string>([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  '.env',
  '.env.local',
])
async function validatePath(root: string, relative: string): Promise<string> {
  let current = root
  const parts = relative.split('/')
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part)
    const stat = await fs.lstat(current)
    if (stat.isSymbolicLink()) throw new FileReadError('含符号链接，未读取链接目标')
    if (index < parts.length - 1 && !stat.isDirectory())
      throw new FileReadError('配置目录不是文件夹')
    if (index === parts.length - 1 && !stat.isFile())
      throw new FileReadError('不是普通文件，请手动检查')
  }
  return current
}
export async function readProjectFiles(root: string): Promise<Map<string, ProjectFileState>> {
  const results = await Promise.all(
    projectFiles.map(async (relative) => {
      try {
        const target = await validatePath(root, relative)
        if (metadataOnly.has(relative)) return [relative, { exists: true }] as const
        const { text } = await readBoundedText(target, 1024 * 1024)
        await validatePath(root, relative)
        return [relative, { exists: true, content: text }] as const
      } catch (error) {
        return [
          relative,
          (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? { exists: false }
            : { exists: true, error: fileReadMessage(error) },
        ] as const
      }
    }),
  )
  return new Map<string, ProjectFileState>(results)
}
