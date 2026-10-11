import type { Context } from './context.js'
import type { Preferences, SetupNode, SetupPreview, SetupRequest } from '../shared/types.js'
import { sameTimezone } from '../shared/timezones.js'
import { NoRepairChangesError, RepairEngine } from './repairs.js'
import { requireTimezone, systemTimezoneSupport } from './timezone-settings.js'
import type { TimezoneState } from './timezone-settings.js'
import { safeValue } from './safety.js'

export async function timezoneSetupNodes(
  ctx: Context,
  repairs: RepairEngine,
  request: SetupRequest,
  timezoneState?: TimezoneState,
  timezoneTarget?: string,
) {
  const nodes: SetupPreview['nodes'] = []
  for (const id of ['system-timezone', 'terminal-timezone'] as const) {
    const enabled = Boolean(
      id === 'system-timezone' ? request.timezone?.system : request.timezone?.terminal,
    )
    const node: SetupPreview['nodes'][number] = {
      id,
      title: id === 'system-timezone' ? '设置系统时区' : '配置终端与 Claude Code TZ',
      description:
        id === 'system-timezone' ? '写入操作系统时区并复核' : '保存启动配置，更新本工具进程 TZ',
      enabled,
      files: [],
    }
    if (!enabled) node.note = '本次未选择；保留现有配置'
    else
      try {
        if (id === 'system-timezone') {
          systemTimezoneSupport(ctx.platform, timezoneTarget!)
          if (!timezoneState?.system) throw new Error('无法读取原系统时区，不能安全配置与还原')
          node.note = `${timezoneState.system} → ${timezoneTarget}；可能需要管理员授权${ctx.demo ? '（隔离模式：模拟系统写入）' : ''}`
        } else {
          if (ctx.platform === 'win32' && timezoneState?.user === undefined)
            throw new Error('无法读取原 Windows 用户 TZ，不能安全配置与还原')
          node.note = `TZ → ${timezoneTarget}；已有终端和 Claude Code 会话需重开`
          try {
            const plan = await repairs.previewTimezone(timezoneTarget!, request.preferences)
            node.files = plan.files
            repairs.discard(plan.id)
          } catch (error) {
            if (!(error instanceof NoRepairChangesError)) throw error
          }
        }
      } catch (error) {
        node.blocked = true
        node.note = `执行时会重试；${safeValue((error as Error).message, 400)}`
      }
    nodes.push(node)
  }
  return nodes
}
export async function applySystemTimezone(
  ctx: Context,
  state: TimezoneState,
  value: string,
): Promise<string> {
  const target = systemTimezoneSupport(ctx.platform, value)
  if (!state?.system) throw new Error('原系统时区未读取，不能安全配置与还原')
  if (sameTimezone(state.system, target)) return `系统时区已是 ${target}，无需写入`
  try {
    await ctx.setSystemTimezone(target)
  } finally {
    if (sameTimezone((await ctx.readSystemTimezone()).timezone, target)) state.system = target
  }
  if (!sameTimezone((await ctx.readSystemTimezone()).timezone, target))
    throw new Error('系统时区设置后复核失败')
  return `系统时区已设为 ${target}${ctx.demo ? '（隔离模拟）' : ''}`
}
export async function applyTerminalTimezone(
  ctx: Context,
  repairs: RepairEngine,
  prefs: Preferences,
  state: TimezoneState,
  value: string,
  node: SetupNode,
) {
  const target = requireTimezone(value)
  const before = state
  if (ctx.platform === 'win32' && before.user === undefined)
    throw new Error('原 Windows 用户 TZ 未读取，不能安全配置')
  let plan
  try {
    plan = await repairs.previewTimezone(target, prefs)
  } catch (error) {
    if (!(error instanceof NoRepairChangesError)) throw error
  }
  let applied: Awaited<ReturnType<RepairEngine['applyWithState']>> | undefined
  try {
    if (plan) {
      applied = await repairs.applyWithState(plan.id, prefs)
      node.backupId = applied.backup.id
    }
    if (ctx.platform === 'win32') {
      await ctx.setUserTimezone(target)
      if ((await ctx.readUserTimezone()) !== target)
        throw new Error('Windows 用户 TZ 写入后复核失败')
    }
    ctx.setRuntimeTimezone(target)
    if (ctx.env.TZ !== target || !sameTimezone(ctx.readRuntimeTimezone(), target))
      throw new Error('终端进程 TZ 更新后复核失败')
    const timezoneState = {
      ...before,
      runtime: target,
      ...(ctx.platform === 'win32' ? { user: target } : {}),
    }
    return {
      state: timezoneState,
      files: applied?.files ?? [],
      message: `已保存 ${applied?.backup.files.length ?? 0} 个配置文件；本工具 TZ 为 ${target}。重开终端与 Claude Code 后生效。`,
    }
  } catch (error) {
    const failures: string[] = []
    try {
      ctx.setRuntimeTimezone(before.runtime)
    } catch {
      failures.push('进程 TZ')
    }
    if (ctx.platform === 'win32')
      await ctx.setUserTimezone(before.user!).catch(() => failures.push('Windows 用户 TZ'))
    if (applied) await repairs.restore(applied.backup.id).catch(() => failures.push('启动配置'))
    throw new Error(
      failures.length
        ? `TZ 配置中断，${failures.join('、')} 回退失败；请使用配置前快照还原`
        : `TZ 配置未完成，已回退：${(error as Error).message}`,
    )
  } finally {
    if (plan) repairs.discard(plan.id)
  }
}
