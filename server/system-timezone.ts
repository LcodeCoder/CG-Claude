import { promises as fs } from 'node:fs'
import type { Context } from './context.js'
import { normalizeTimezone } from '../shared/timezones.js'

export interface SystemTimezone {
  timezone?: string
  source: string
  raw?: string
  error?: string
}
// These are Windows region identities, not offset guesses. Unmapped IDs remain unconfirmed.
const windowsZones: Record<string, string> = {
  'Taipei Standard Time': 'Asia/Taipei',
  'China Standard Time': 'Asia/Shanghai',
  'Singapore Standard Time': 'Asia/Singapore',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Eastern Standard Time': 'America/New_York',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  UTC: 'UTC',
}

/** Read the OS separately from Intl/TZ. Every command is a fixed, read-only probe. */
export async function readSystemTimezone(
  ctx: Pick<Context, 'platform' | 'run'>,
  readlink: (path: string) => Promise<string> = fs.readlink,
): Promise<SystemTimezone> {
  if (ctx.platform === 'win32') {
    const result = await ctx.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '(Get-TimeZone).Id | ConvertTo-Json -Compress',
    ])
    if (result.ok) {
      try {
        const id: unknown = JSON.parse(result.stdout)
        if (typeof id === 'string')
          return {
            timezone: windowsZones[id],
            source: 'Windows Get-TimeZone',
            raw: id,
            ...(windowsZones[id]
              ? {}
              : { error: '此 Windows 时区尚未映射为 IANA 名称，需手动核对' }),
          }
      } catch {
        /* An invalid response must not fall back to a process timezone. */
      }
    }
    return { source: 'Windows Get-TimeZone', error: '系统时区读取失败，需手动核对' }
  }
  try {
    const link = await readlink('/etc/localtime')
    const timezone = normalizeTimezone(
      link.split('/zoneinfo/')[1]?.replace(/^(?:posix|right)\//, ''),
    )
    if (timezone) return { timezone, source: '/etc/localtime', raw: link }
  } catch {
    /* Some systems store a regular tzfile rather than a symlink. */
  }
  if (ctx.platform === 'darwin') {
    const result = await ctx.run('/usr/sbin/systemsetup', ['-gettimezone'])
    const timezone = result.ok
      ? normalizeTimezone(result.stdout.replace(/^Time Zone:\s*/i, ''))
      : undefined
    if (timezone) return { timezone, source: 'macOS systemsetup -gettimezone' }
  } else if (ctx.platform === 'linux') {
    const result = await ctx.run('timedatectl', ['show', '--property=Timezone', '--value'])
    const timezone = result.ok ? normalizeTimezone(result.stdout) : undefined
    if (timezone) return { timezone, source: 'Linux timedatectl' }
  }
  return {
    source: '/etc/localtime / 系统命令',
    error: '未能读取系统时区；进程时区不能替代系统证据',
  }
}
