import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { CheckResult } from '../shared/types.js'
import type { CommandResult, Context } from './context.js'

/** A version result is evidence of this probe, never proof of login or account access. */
export async function cliInstallation(
  ctx: Context,
  command: CommandResult,
  serviceNodeVersion: string,
): Promise<CheckResult> {
  const version = command.ok
    ? command.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => /^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?(?: \(Claude Code\))?$/.test(line))
    : undefined
  const result: CheckResult = {
    id: 'claude-cli',
    category: 'claude',
    title: 'Claude Code 安装',
    description:
      '只运行 claude --version。未获得版本时，只核对固定原生安装路径的文件信息，不执行该候选文件。',
    status: version ? 'pass' : 'manual',
    summary: version || '当前服务未检测到可用的 Claude Code 版本',
    evidence: [{ label: 'CG Claude 服务运行时', value: `Node.js ${serviceNodeVersion}` }],
    recommendation: version
      ? '版本探测成功。如遇版本问题，使用对应安装方式的官方更新入口；登录与权限仍在实际客户端核对。'
      : '在新终端运行 claude --version 与 claude doctor，核对安装位置和 PATH。桌面进程与终端的环境可能不同；浏览器使用者可跳过。',
    fixIds: [],
    source: 'official',
    sourceUrl: 'https://code.claude.com/docs/en/setup',
  }
  if (version) return result
  if (command.ok)
    result.evidence.push({
      label: '版本探测',
      value: '指令已完成，但未返回可识别的版本号，原输出已隐藏',
    })
  if (!['darwin', 'linux', 'win32'].includes(ctx.platform)) return result

  const filename = ctx.platform === 'win32' ? 'claude.exe' : 'claude'
  const relative = `.local/bin/${filename}`
  const target = path.join(ctx.home, '.local', 'bin', filename)
  try {
    const launcher = await fs.lstat(target)
    const metadata = launcher.isSymbolicLink() ? await fs.stat(target) : launcher
    result.evidence.push({ label: '固定原生安装路径', value: `~/${relative}` })
    if (!metadata.isFile()) {
      result.summary = '原生安装候选路径不是普通文件，需确认安装'
      result.evidence.push({ label: '文件信息', value: '路径不是普通文件；未读取或执行' })
    } else if (metadata.size === 0) {
      result.summary = '原生安装候选文件为空，需确认安装'
      result.evidence.push({ label: '文件信息', value: '文件大小为 0；未读取或执行' })
    } else {
      result.summary = '发现原生安装候选，但当前版本探测未完成'
      result.evidence.push({
        label: '文件信息',
        value: `${launcher.isSymbolicLink() ? '符号链接指向普通文件' : '存在普通文件'}；仅核对元数据，未运行此文件`,
      })
      if (ctx.platform !== 'win32' && !(metadata.mode & 0o111))
        result.evidence.push({
          label: '执行权限',
          value: '候选文件未声明 POSIX 执行位，需人工确认',
        })
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    result.evidence.push({
      label: '固定原生安装路径',
      value:
        code === 'ENOENT'
          ? `~/${relative} 未找到可用文件；其他安装方式或位置仍需核对`
          : '候选文件信息无法读取，需核对权限或链接；原始错误已隐藏',
    })
  }
  return result
}
