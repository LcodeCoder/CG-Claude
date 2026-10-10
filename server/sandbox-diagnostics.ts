import type { Evidence, ProjectFinding } from '../shared/types.js'

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
const scopeNote =
  '仅检查此文件声明，未合并用户、组织与命令行设置，也未启动沙箱。实际结果受版本、平台、依赖和配置优先级影响。'
const recommendation =
  '在实际 Claude Code 会话用 /sandbox 核对生效状态。按任务需要审查例外与隔离边界；组织策略可能覆盖项目声明。沙箱内命令隔离与工具权限审批不同，本工具不会执行或自动修改这些选项。'

/** Inspect declarations only; commands, paths, domains, and unknown values never enter evidence. */
export function sandboxFinding(relative: string, value: unknown): ProjectFinding {
  const evidence: Evidence[] = [{ label: '来源与范围', value: `${relative}；${scopeNote}` }]
  const result = (status: ProjectFinding['status'], summary: string): ProjectFinding => ({
    id: `${relative}-sandbox`,
    title: '项目命令沙箱声明',
    status,
    summary,
    recommendation,
    evidence,
  })
  if (value === undefined) return result('skipped', '此文件未声明沙箱配置，可由其他层提供')
  const sandbox = record(value)
  if (!sandbox) return result('fail', 'sandbox 必须是对象，原值已隐藏')

  const invalid: string[] = []
  const loosened: string[] = []
  const flags = new Map<string, boolean>()
  function inspectBoolean(
    object: Record<string, unknown>,
    key: string,
    prefix: string,
    impact?: string,
  ) {
    if (object[key] === undefined) return
    const name = prefix + key
    if (typeof object[key] !== 'boolean') {
      invalid.push(name)
      evidence.push({ label: name, value: '不是布尔值，原值已隐藏' })
      return
    }
    const enabled = object[key] as boolean
    flags.set(name, enabled)
    evidence.push({ label: name, value: enabled ? '声明为 true' : '声明为 false' })
    if (enabled && impact) loosened.push(`${name}：${impact}`)
  }
  for (const key of ['enabled', 'failIfUnavailable', 'allowUnsandboxedCommands'])
    inspectBoolean(sandbox, key, 'sandbox.')
  inspectBoolean(
    sandbox,
    'enableWeakerNestedSandbox',
    'sandbox.',
    '容器内使用较弱的嵌套隔离，需确认外层容器边界',
  )
  inspectBoolean(
    sandbox,
    'enableWeakerNetworkIsolation',
    'sandbox.',
    '放宽网络隔离，需核对平台与企业代理需求',
  )
  for (const [key, settings] of [
    ['filesystem', { disabled: '关闭文件系统隔离，保留网络层不等于保护本机文件' }],
    [
      'network',
      {
        allowAllUnixSockets: '允许全部 Unix 套接字，可能连接沙箱外服务',
        allowLocalBinding: '在适用平台允许本地端口与连接，需核对监听范围',
      },
    ],
  ] as const) {
    if (sandbox[key] === undefined) continue
    const nested = record(sandbox[key])
    if (!nested) {
      invalid.push(`sandbox.${key}`)
      evidence.push({ label: `sandbox.${key}`, value: '不是对象，原值已隐藏' })
      continue
    }
    for (const [flag, impact] of Object.entries(settings))
      inspectBoolean(nested, flag, `sandbox.${key}.`, impact)
  }

  let exclusions = 0
  if (sandbox.excludedCommands !== undefined) {
    if (
      !Array.isArray(sandbox.excludedCommands) ||
      !sandbox.excludedCommands.every((item) => typeof item === 'string')
    ) {
      invalid.push('sandbox.excludedCommands')
      evidence.push({ label: 'sandbox.excludedCommands', value: '必须是字符串数组，原值已隐藏' })
    } else {
      exclusions = sandbox.excludedCommands.length
      evidence.push({
        label: 'sandbox.excludedCommands',
        value: `${exclusions} 条沙箱外命令例外；命令内容不展示，不执行`,
      })
    }
  }
  evidence.push(...loosened.map((impact) => ({ label: '隔离边界', value: impact })))
  if (invalid.length) return result('fail', '部分已检查的沙箱字段结构需要修正')
  if (flags.get('sandbox.enabled') === false) return result('warn', '此文件声明关闭命令沙箱')
  if (loosened.length) return result('warn', `发现 ${loosened.length} 项放宽隔离的声明`)
  if (exclusions) return result('manual', `声明 ${exclusions} 条沙箱外命令例外，来源需复核`)
  if (flags.get('sandbox.enabled') !== true)
    return result('manual', '此文件未明确声明启用沙箱，需核对其他配置层')
  if (
    flags.get('sandbox.failIfUnavailable') !== true ||
    flags.get('sandbox.allowUnsandboxedCommands') !== false
  ) {
    evidence.push({
      label: '回退与例外',
      value:
        '未同时声明 failIfUnavailable=true 和 allowUnsandboxedCommands=false，需核对不可用时的回退与沙箱外重试',
    })
    return result('manual', '已声明启用，回退与例外路径需确认')
  }
  return result('pass', '已声明启用并限制不可用回退与沙箱外重试')
}
