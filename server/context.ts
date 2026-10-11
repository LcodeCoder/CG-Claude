import os from 'node:os'
import path from 'node:path'
import type { Machine } from '../shared/types.js'
import { runSystemCommand } from './commands.js'
import { readSystemTimezone } from './system-timezone.js'
import { setSystemTimezone, readUserTimezone, setUserTimezone } from './timezone-settings.js'
import type { SystemTimezone } from './system-timezone.js'

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
  readSystemTimezone: () => Promise<SystemTimezone>
  readRuntimeTimezone: () => string
  setSystemTimezone: (timezone: string) => Promise<void>
  setRuntimeTimezone: (timezone: string | null) => void
  readUserTimezone: () => Promise<string | null>
  setUserTimezone: (timezone: string | null) => Promise<void>
}
export function createContext(overrides: Partial<Context> = {}): Context {
  const home = path.resolve(process.env.CG_HOME || os.homedir())
  let demoTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  let demoUserTimezone: string | null = null
  const ctx: Context = {
    home,
    dataDir: path.resolve(process.env.CG_DATA_DIR || path.join(home, '.claude-guard')),
    platform: process.platform,
    env: { ...process.env },
    demo: process.env.CG_DEMO === '1',
    run: (command, args, timeout) => runSystemCommand(ctx, command, args, timeout),
    readSystemTimezone: () =>
      ctx.demo
        ? Promise.resolve({ timezone: demoTimezone, source: '隔离环境模拟系统时区' })
        : readSystemTimezone(ctx),
    readRuntimeTimezone: () =>
      ctx.demo ? ctx.env.TZ || demoTimezone : Intl.DateTimeFormat().resolvedOptions().timeZone,
    setSystemTimezone: async (timezone) => {
      if (ctx.demo) demoTimezone = timezone
      else await setSystemTimezone(ctx, timezone)
    },
    setRuntimeTimezone: (timezone) => {
      if (timezone === null) {
        delete ctx.env.TZ
        if (!ctx.demo) delete process.env.TZ
      } else {
        ctx.env.TZ = timezone
        if (!ctx.demo) process.env.TZ = timezone
      }
    },
    readUserTimezone: () => (ctx.demo ? Promise.resolve(demoUserTimezone) : readUserTimezone(ctx)),
    setUserTimezone: async (timezone) => {
      if (ctx.demo) demoUserTimezone = timezone
      else await setUserTimezone(ctx, timezone)
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
    timezone: ctx.readRuntimeTimezone(),
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
  { id: 'bash_login', label: 'Bash 备用登录配置', relative: '.bash_login', kind: 'shell' },
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
