import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import path from 'node:path'
import type { Machine } from '../shared/types.js'

const execFileAsync = promisify(execFile)
export interface CommandResult {
  ok: boolean
  stdout: string
  stderr: string
}
export interface Context {
  home: string
  dataDir: string
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  demo: boolean
  run: (command: string, args: string[], timeout?: number) => Promise<CommandResult>
}
export function createContext(overrides: Partial<Context> = {}): Context {
  const home = path.resolve(process.env.CG_HOME || os.homedir())
  const ctx: Context = {
    home,
    dataDir: path.resolve(process.env.CG_DATA_DIR || path.join(home, '.claude-guard')),
    platform: process.platform,
    env: { ...process.env },
    demo: process.env.CG_DEMO === '1',
    run: async (command, args, timeout = 5000) => {
      try {
        const result = await execFileAsync(command, args, {
          timeout,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
          env: { ...ctx.env, HOME: ctx.home, USERPROFILE: ctx.home },
          encoding: 'utf8',
        })
        return { ok: true, stdout: result.stdout.trim(), stderr: result.stderr.trim() }
      } catch (error) {
        const failure = error as { stdout?: string; stderr?: string; code?: string }
        return {
          ok: false,
          stdout: failure.stdout?.trim() ?? '',
          stderr: failure.code === 'ENOENT' ? '未安装此命令' : '命令未完成或没有权限',
        }
      }
    },
    ...overrides,
  }
  return ctx
}
export function machineInfo(ctx: Context): Machine {
  const names: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }
  return {
    platform: ctx.platform,
    platformName: names[ctx.platform] ?? ctx.platform,
    hostname: ctx.demo ? 'Guard-Test-Mac' : os.hostname(),
    arch: os.arch(),
    osVersion: os.release(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    nodeVersion: process.version,
  }
}
export interface ConfigTarget {
  id: string
  label: string
  relative: string
  kind: 'shell' | 'npm' | 'git' | 'claude'
}
export const configTargets: ConfigTarget[] = [
  { id: 'zshrc', label: 'Zsh 启动配置', relative: '.zshrc', kind: 'shell' },
  { id: 'zprofile', label: 'Zsh 登录配置', relative: '.zprofile', kind: 'shell' },
  { id: 'zshenv', label: 'Zsh 环境配置', relative: '.zshenv', kind: 'shell' },
  { id: 'bashrc', label: 'Bash 启动配置', relative: '.bashrc', kind: 'shell' },
  { id: 'bash_profile', label: 'Bash 登录配置', relative: '.bash_profile', kind: 'shell' },
  { id: 'profile', label: 'Shell 通用配置', relative: '.profile', kind: 'shell' },
  { id: 'npmrc', label: 'npm 用户配置', relative: '.npmrc', kind: 'npm' },
  { id: 'gitconfig', label: 'Git 用户配置', relative: '.gitconfig', kind: 'git' },
  { id: 'gitconfig-xdg', label: 'Git XDG 用户配置', relative: '.config/git/config', kind: 'git' },
  {
    id: 'claude-settings',
    label: 'Claude Code 全局配置',
    relative: '.claude/settings.json',
    kind: 'claude',
  },
]
export function configPath(ctx: Context, relative: string): string {
  if (!configTargets.some((target) => target.relative === relative))
    throw new Error('不允许修改此配置路径')
  return path.join(ctx.home, relative)
}
