import { promises as fs } from 'node:fs'
import os from 'node:os'
import type { Context, CommandResult } from './context.js'
import type { SystemTimezone } from './system-timezone.js'
import { readLocationTimezone } from './timezone-automation.js'
import { safeValue } from './safety.js'

export interface SystemSnapshot {
  proxy: CommandResult
  dns: CommandResult
  automaticTimezone?: boolean
  locationTimezone: string
  timezone: SystemTimezone
  interfaces: { name: string; family: string; address: string; internal: boolean }[]
}
export async function systemSnapshot(ctx: Context): Promise<SystemSnapshot> {
  const unsupported: CommandResult = { ok: false, stdout: '', stderr: '此平台需手动核对' }
  let proxyTask: Promise<CommandResult> = Promise.resolve(unsupported)
  let dnsTask: Promise<CommandResult> = Promise.resolve(unsupported)
  if (ctx.platform === 'darwin') {
    proxyTask = ctx.run('scutil', ['--proxy'])
    dnsTask = ctx.run('scutil', ['--dns'])
  } else if (ctx.platform === 'win32') {
    proxyTask = ctx.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" | Select-Object ProxyEnable,ProxyServer,AutoConfigURL | ConvertTo-Json -Compress',
    ])
    dnsTask = ctx.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-DnsClientServerAddress | Select-Object -ExpandProperty ServerAddresses',
    ])
  } else if (ctx.platform === 'linux') {
    proxyTask = ctx.run('gsettings', ['get', 'org.gnome.system.proxy', 'mode'])
    dnsTask = fs.readFile('/etc/resolv.conf', 'utf8').then(
      (stdout) => ({ ok: true, stdout, stderr: '' }),
      () => unsupported,
    )
  }
  const results = await Promise.allSettled([
    proxyTask,
    dnsTask,
    ctx.readSystemTimezone(),
    ctx.readAutomaticTimezone(),
    readLocationTimezone(ctx),
  ])
  const interfaces = Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? []).map((address) => ({
      name,
      family: address.family,
      address: address.address,
      internal: address.internal,
    })),
  )
  return {
    automaticTimezone:
      results[3]?.status === 'fulfilled' ? (results[3].value as boolean | undefined) : undefined,
    locationTimezone:
      results[4]?.status === 'fulfilled' ? (results[4].value as string) : '未读取到定位时区开关',
    proxy: results[0]?.status === 'fulfilled' ? (results[0].value as CommandResult) : unsupported,
    dns: results[1]?.status === 'fulfilled' ? (results[1].value as CommandResult) : unsupported,
    timezone:
      results[2]?.status === 'fulfilled'
        ? (results[2].value as SystemTimezone)
        : { source: '系统时区读取', error: '系统时区读取失败，需手动核对' },
    interfaces,
  }
}
export function parseSystemProxy(ctx: Context, result: CommandResult) {
  if (!result.ok)
    return { known: false, enabled: false, values: [] as { label: string; value: string }[] }
  if (ctx.platform === 'darwin') {
    const matches = [
      ...result.stdout.matchAll(
        /\b(HTTPEnable|HTTPSEnable|SOCKSEnable|ProxyAutoConfigEnable|ProxyAutoDiscoveryEnable)\s*:\s*(\d+)/g,
      ),
    ]
    return {
      known: matches.length > 0 || /<dictionary>/.test(result.stdout),
      enabled: matches.some((match) => match[2] === '1'),
      values: matches.map((match) => ({
        label: match[1]!,
        value: match[2] === '1' ? '已开启' : '已关闭',
      })),
    }
  }
  if (ctx.platform === 'win32') {
    try {
      const value = JSON.parse(result.stdout) as {
        ProxyEnable?: number
        ProxyServer?: string
        AutoConfigURL?: string
      }
      return {
        known: true,
        enabled: value.ProxyEnable === 1 || Boolean(value.AutoConfigURL),
        values: [
          { label: '系统代理', value: value.ProxyEnable === 1 ? '已开启' : '已关闭' },
          { label: '自动代理脚本', value: value.AutoConfigURL ? '已配置（地址已隐藏）' : '未配置' },
        ],
      }
    } catch {
      return { known: false, enabled: false, values: [] }
    }
  }
  return {
    known: /'?(none|manual|auto)'?/.test(result.stdout),
    enabled: !/none/.test(result.stdout),
    values: [{ label: 'GNOME 代理模式', value: safeValue(result.stdout) }],
  }
}
