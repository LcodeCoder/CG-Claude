import { z } from 'zod'
import type { ChangePreview } from '../shared/types.js'
import { normalizeTimezone, sameTimezone } from '../shared/timezones.js'
import type { Context } from './context.js'
import { windowsZones } from './system-timezone.js'

export function requireTimezone(value: string): string {
  const timezone = normalizeTimezone(value)
  if (!timezone || !/^[A-Za-z0-9_+\-/]+$/.test(timezone) || timezone.includes('..'))
    throw new Error('需要有效的 IANA 时区，例如 Asia/Taipei')
  return timezone
}
export function systemTimezoneSupport(platform: NodeJS.Platform, timezone: string) {
  const target = requireTimezone(timezone)
  if (!['darwin', 'linux', 'win32'].includes(platform))
    throw new Error('此系统暂不支持自动设置时区')
  if (
    platform === 'win32' &&
    !Object.values(windowsZones).some((zone) => sameTimezone(zone, target))
  )
    throw new Error('此目标尚无 Windows 时区映射，请改选支持的时区或在系统设置中配置')
  return target
}
function encoded(script: string) {
  return [
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64'),
  ]
}

/** Only called by an explicitly selected application operation. No clock/NTP settings are changed. */
export async function setSystemTimezone(ctx: Pick<Context, 'platform' | 'run'>, value: string) {
  const timezone = systemTimezoneSupport(ctx.platform, value)
  let result
  if (ctx.platform === 'darwin') {
    const command = `/usr/sbin/systemsetup -settimezone '${timezone}'`
    result = await ctx.run(
      '/usr/bin/osascript',
      ['-e', `do shell script ${JSON.stringify(command)} with administrator privileges`],
      120000,
    )
  } else if (ctx.platform === 'linux') {
    result = await ctx.run('timedatectl', ['set-timezone', timezone], 120000)
  } else {
    const id = Object.entries(windowsZones).find(([, zone]) => sameTimezone(zone, timezone))![0]
    const action = encoded(
      `$ErrorActionPreference='Stop'; try { Set-TimeZone -Id '${id}'; exit 0 } catch { exit 1 }`,
    )
    // Use a fixed elevated child; propagate denial and its actual exit status.
    const script = `$ErrorActionPreference='Stop'; $p=Start-Process -FilePath "$PSHOME\\powershell.exe" -ArgumentList '${action.join(' ')}' -Verb RunAs -Wait -PassThru; exit $p.ExitCode`
    result = await ctx.run('powershell.exe', encoded(script), 120000)
  }
  if (!result.ok) throw new Error('系统时区设置未完成：管理员授权被取消、权限不足或系统命令不可用')
}
export async function readUserTimezone(
  ctx: Pick<Context, 'platform' | 'run'>,
): Promise<string | null> {
  if (ctx.platform !== 'win32') return null
  const result = await ctx.run(
    'powershell.exe',
    encoded(
      "$ErrorActionPreference='Stop'; [Environment]::GetEnvironmentVariable('TZ','User') | ConvertTo-Json -Compress",
    ),
  )
  if (result.ok) {
    try {
      const value: unknown = JSON.parse(result.stdout || 'null')
      if (value === null || typeof value === 'string') return value
    } catch {
      /* Never invent an absent value after a failed read. */
    }
  }
  throw new Error('无法读取 Windows 用户 TZ；请检查 PowerShell 权限后重试')
}
export async function setUserTimezone(
  ctx: Pick<Context, 'platform' | 'run'>,
  value: string | null,
) {
  if (ctx.platform !== 'win32') return
  // Encode the original value too: restoring an arbitrary old string must never turn it into code.
  const literal =
    value === null
      ? '$null'
      : `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(value).toString('base64')}'))`
  const result = await ctx.run(
    'powershell.exe',
    encoded(
      `$ErrorActionPreference='Stop'; [Environment]::SetEnvironmentVariable('TZ',${literal},'User')`,
    ),
  )
  if (!result.ok) throw new Error('Windows 用户 TZ 写入失败，请检查用户配置权限')
}

export const timezoneStateSchema = z.object({
  platform: z.enum([
    'darwin',
    'linux',
    'win32',
    'aix',
    'android',
    'freebsd',
    'haiku',
    'openbsd',
    'sunos',
    'cygwin',
    'netbsd',
  ]),
  system: z.string().max(150).optional(),
  runtime: z.string().max(4096).nullable(),
  user: z.string().max(4096).nullable().optional(),
})
export type TimezoneState = z.infer<typeof timezoneStateSchema>
export async function captureTimezoneState(ctx: Context): Promise<TimezoneState> {
  const system = await ctx.readSystemTimezone().catch(() => undefined)
  const user =
    ctx.platform === 'win32' ? await ctx.readUserTimezone().catch(() => undefined) : undefined
  return {
    platform: ctx.platform,
    system: normalizeTimezone(system?.timezone),
    runtime: ctx.env.TZ ?? null,
    ...(user !== undefined ? { user } : {}),
  }
}
export function timezoneChanges(before: TimezoneState, after: TimezoneState): ChangePreview[] {
  const display = (value: string | null | undefined) =>
    value == null ? '未设置' : (normalizeTimezone(value) ?? '原值（已隐藏）')
  return [
    ...(after.system !== undefined && !sameTimezone(before.system, after.system)
      ? [{ key: '系统时区', before: display(before.system), after: display(after.system) }]
      : []),
    ...(before.runtime !== after.runtime
      ? [{ key: '本工具进程 TZ', before: display(before.runtime), after: display(after.runtime) }]
      : []),
    ...(after.user !== undefined && before.user !== after.user
      ? [{ key: 'Windows 用户 TZ', before: display(before.user), after: display(after.user) }]
      : []),
  ]
}
/** Each write is reread. Restoring a snapshot uses the same adapters as one-click setup. */
export async function restoreTimezoneState(ctx: Context, state: TimezoneState) {
  if (state.platform !== ctx.platform) throw new Error('快照平台与本机不同，不能还原系统时区')
  if (
    state.system !== undefined &&
    !sameTimezone((await ctx.readSystemTimezone()).timezone, state.system)
  ) {
    await ctx.setSystemTimezone(requireTimezone(state.system))
    if (!sameTimezone((await ctx.readSystemTimezone()).timezone, state.system))
      throw new Error('系统时区写入后复核失败')
  }
  if (state.user !== undefined && (await ctx.readUserTimezone()) !== state.user) {
    await ctx.setUserTimezone(state.user)
    if ((await ctx.readUserTimezone()) !== state.user)
      throw new Error('Windows 用户 TZ 写入后复核失败')
  }
  ctx.setRuntimeTimezone(state.runtime)
  if ((ctx.env.TZ ?? null) !== state.runtime) throw new Error('本工具进程 TZ 写入后复核失败')
}

/** Do not undo a third party's timezone edit when a transaction fails. */
export async function rollbackTimezoneState(
  ctx: Context,
  original: TimezoneState,
  attempted: TimezoneState,
) {
  const current = await captureTimezoneState(ctx)
  if (
    original.system &&
    !sameTimezone(current.system, original.system) &&
    !sameTimezone(current.system, attempted.system)
  )
    throw new Error('系统时区又被其他程序修改，无法自动回退')
  if (current.runtime !== original.runtime && current.runtime !== attempted.runtime)
    throw new Error('进程 TZ 又被其他程序修改，无法自动回退')
  if (
    original.user !== undefined &&
    current.user !== original.user &&
    current.user !== attempted.user
  )
    throw new Error('Windows 用户 TZ 又被其他程序修改，无法自动回退')
  await restoreTimezoneState(ctx, original)
}
