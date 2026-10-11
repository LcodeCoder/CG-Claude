import { setTimeout as delay } from 'node:timers/promises'
import type { Context } from './context.js'
import type { CheckResult } from '../shared/types.js'
const ARTICLE_URL = 'https://x.com/AYi_AInotes/status/2106639522586829094?s=46'
export async function readAutomaticTimezone(
  ctx: Pick<Context, 'platform' | 'run'>,
): Promise<boolean | undefined> {
  if (ctx.platform !== 'darwin') return
  const result = await ctx.run('/usr/bin/defaults', [
    'read',
    '/Library/Preferences/com.apple.timezone.auto',
    'Active',
  ])
  if (!result.ok) return
  if (result.stdout === '1' || result.stdout === 'true') return true
  if (result.stdout === '0' || result.stdout === 'false') return false
}
export async function setAutomaticTimezone(
  ctx: Pick<Context, 'platform' | 'run'>,
  enabled: boolean,
): Promise<void> {
  if (ctx.platform !== 'darwin') throw new Error('此平台的自动时区开关需要在系统设置中修改')
  const command = `/usr/bin/defaults write /Library/Preferences/com.apple.timezone.auto Active -bool ${enabled ? 'true' : 'false'}`
  const result = await ctx.run(
    '/usr/bin/osascript',
    ['-e', `do shell script ${JSON.stringify(command)} with administrator privileges`],
    120000,
  )
  if (!result.ok) throw new Error('自动时区设置未完成：请完成系统管理员授权后重试')
}
export async function verifyAutomaticTimezone(
  ctx: Pick<Context, 'readAutomaticTimezone'>,
  enabled: boolean,
): Promise<void> {
  for (let sample = 0; sample < 8; sample++) {
    try {
      if ((await ctx.readAutomaticTimezone()) === enabled) return
    } catch {
      /* A transient read is not proof of a failed write. */
    }
    if (sample < 7) await delay(250)
  }
  throw new Error('自动时区开关写入后复核失败')
}
export async function readLocationTimezone(ctx: Context): Promise<string> {
  if (ctx.platform !== 'darwin') return '此平台需在系统设置中核对'
  if (ctx.demo) return '隔离环境：未读取本机定位权限'
  const result = await ctx.run('/usr/bin/plutil', [
    '-convert',
    'json',
    '-o',
    '-',
    '/var/db/locationd/clients.plist',
  ])
  if (!result.ok) return '系统定位记录不可读；打开定位服务设置核对'
  try {
    const clients: unknown = JSON.parse(result.stdout)
    if (!clients || typeof clients !== 'object' || Array.isArray(clients))
      return '系统定位记录格式无法确认'
    const entries = Object.entries(clients).filter(([key]) => key.includes('/TimeZone.bundle'))
    if (entries.length) return '已找到时区定位服务记录；该记录不能证明设置开关已关闭'
  } catch {
    /* Do not infer authorization from malformed or obsolete private records. */
  }
  return '未获得可验证的时区定位开关；打开定位服务设置核对'
}
export function automaticTimezoneCheck(value?: boolean): CheckResult {
  return {
    id: 'automatic-timezone',
    category: 'system',
    title: '电脑自动设定时区',
    description: '独立读取 macOS 自动选择时区开关。网络校时（NTP）与此开关不同。',
    status: value === undefined ? 'manual' : value ? 'warn' : 'pass',
    summary:
      value === undefined
        ? '未获得可验证的自动时区开关'
        : value
          ? '已开启，可能覆盖手动设置的时区'
          : '自动设定时区已关闭',
    evidence: [
      {
        label: '自动设定时区',
        value: value === undefined ? '未读取；不从当前时区推断' : value ? '开启' : '关闭',
      },
    ],
    recommendation:
      '一键配置的系统时区步骤会关闭已读取的 macOS 自动时区开关，并保存原状态以便还原。定位服务中的设定时区与手机设置仍需分别核对。',
    fixIds: [],
    source: 'community',
    sourceUrl: ARTICLE_URL,
  }
}
