import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CheckStatus, ProjectFinding, ProjectReport } from '../shared/types.js'
import type { Context } from './context.js'
import { claudeEnv, parseClaude, npmAssignments, gitAssignments, proxyKeys } from './configs.js'
import { endpointValue, safeValue } from './safety.js'
import {
  isEnabledEnvironmentFlag,
  isNonEmptyEnvironmentValue,
} from '../shared/environment-values.js'
import { projectFiles, readProjectFiles } from './project-files.js'
import { credentialField, inspectMcp } from './mcp-diagnostics.js'

export async function scanProject(ctx: Context, supplied: string): Promise<ProjectReport> {
  const input = supplied.trim().replace(/^~(?=$|[\/\\])/, ctx.home)
  if (!path.isAbsolute(input)) throw new Error('请输入项目的绝对路径，或在桌面版中选择目录')
  const root = await fs.realpath(path.resolve(input)).catch(() => {
    throw new Error('项目目录不存在或无法读取')
  })
  if (!(await fs.stat(root)).isDirectory()) throw new Error('项目路径必须是文件夹')
  const files = await readProjectFiles(root)
  const findings: ProjectFinding[] = []
  const add = (
    id: string,
    title: string,
    status: CheckStatus,
    summary: string,
    recommendation: string,
    evidence: ProjectFinding['evidence'] = [],
  ) => findings.push({ id, title, status, summary, recommendation, evidence })
  const unavailable = [...files].filter(([, file]) => file.error)
  add(
    'project-readable',
    '配置文件读取范围',
    unavailable.length ? 'warn' : 'pass',
    unavailable.length ? `${unavailable.length} 个文件未能安全读取` : '已检查固定的项目配置位置',
    '只读取项目配置、Git 元数据和依赖清单，不执行项目脚本、Hooks 或安装依赖。',
    unavailable.map(([name, file]) => ({ label: name, value: file.error! })),
  )
  const env: Record<string, string> = {}
  let envIncomplete = false
  for (const relative of ['.claude/settings.json', '.claude/settings.local.json']) {
    const file = files.get(relative)!
    if (!file.exists) {
      add(relative, relative, 'skipped', '此项目未设置该文件', 'Claude 会继续使用其他配置层。')
      continue
    }
    try {
      if (file.error) throw new Error(file.error)
      const config = parseClaude(file.content ?? null)
      const settingsEnv = claudeEnv(config)
      const unresolvedKeys = Object.keys(settingsEnv).filter(
        (key) => typeof settingsEnv[key] !== 'string',
      )
      if (unresolvedKeys.length) envIncomplete = true
      Object.assign(
        env,
        Object.fromEntries(
          Object.entries(settingsEnv).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        ),
      )
      add(
        relative,
        `${relative} 格式`,
        unresolvedKeys.length ? 'manual' : 'pass',
        unresolvedKeys.length ? 'JSON 可读取，部分 env 不是字符串' : 'JSON 和 env 结构可读取',
        '全局、项目、本地、命令行与受管理策略可能存在优先级，仍需核对最终生效值。',
      )
      const permissions = config.permissions
      const invalidPermissions =
        permissions !== undefined &&
        (!permissions || typeof permissions !== 'object' || Array.isArray(permissions))
      const permissionObject =
        !invalidPermissions && permissions ? (permissions as Record<string, unknown>) : {}
      const invalidLists = ['allow', 'ask', 'deny'].some(
        (key) =>
          permissionObject[key] !== undefined &&
          (!Array.isArray(permissionObject[key]) ||
            !(permissionObject[key] as unknown[]).every((value) => typeof value === 'string')),
      )
      const mode = permissionObject.defaultMode
      const bypass = mode === 'bypassPermissions'
      const unknownMode =
        mode !== undefined &&
        ![
          'default',
          'manual',
          'auto',
          'acceptEdits',
          'plan',
          'dontAsk',
          'bypassPermissions',
        ].includes(String(mode))
      const broadRules = Array.isArray(permissionObject.allow)
        ? permissionObject.allow.filter(
            (rule) => typeof rule === 'string' && /^(?:Bash|PowerShell)(?:\(\*\))?$/.test(rule),
          )
        : []
      add(
        relative + '-permissions',
        '项目权限模式',
        invalidPermissions || invalidLists
          ? 'fail'
          : bypass
            ? 'warn'
            : unknownMode || broadRules.length
              ? 'manual'
              : 'pass',
        invalidPermissions || invalidLists
          ? '权限配置结构需要修正'
          : bypass
            ? '项目配置声明跳过权限提示'
            : broadRules.length
              ? '存在覆盖整个命令工具的 allow 规则'
              : unknownMode
                ? '权限模式需按客户端版本确认'
                : '未发现默认绕过权限模式',
        '在 Claude Code /permissions 核对来源和生效规则。deny、ask、allow 有优先顺序，组织策略也可能覆盖本地选择；bypassPermissions 只适合受隔离的环境。扫描不执行命令、不扩大或缩小权限。',
        [
          { label: '来源文件', value: relative },
          ...(broadRules.length
            ? [
                {
                  label: '工具级 allow 规则',
                  value:
                    String(broadRules.length) + ' 条；实际批准结果还受 ask/deny 和组织策略影响',
                },
              ]
            : []),
        ],
      )
      if (config.hooks !== undefined) {
        const validHooks =
          config.hooks && typeof config.hooks === 'object' && !Array.isArray(config.hooks)
        add(
          relative + '-hooks',
          '项目 Hooks',
          validHooks ? 'manual' : 'fail',
          validHooks
            ? '存在 ' + Object.keys(config.hooks as object).length + ' 类 Hooks，来源需复核'
            : 'hooks 必须是对象',
          'Hooks 可以执行命令或发起 HTTP 请求。在实际客户端核对来源、事件和权限；本工具不会执行、连接或展示完整命令。',
          [{ label: '来源文件', value: relative }],
        )
      }
      if (config.enableAllProjectMcpServers === true)
        add(
          relative + '-mcp-approval',
          '项目 MCP 自动启用',
          'manual',
          '项目配置声明自动启用全部项目 MCP 服务',
          '这项声明的生效还受客户端版本与工作区信任影响；在客户端逐项核对服务来源。本工具不会启动 MCP 服务。',
          [{ label: '来源文件', value: relative }],
        )
    } catch (error) {
      envIncomplete = true
      add(
        relative,
        `${relative} 格式`,
        'fail',
        safeValue((error as Error).message),
        '先手动修正 JSON 或文件权限，再扫描。',
      )
    }
  }
  const proxyEnv = Object.entries(env).filter(([key, value]) => proxyKeys.test(key) && value)
  add(
    'project-proxy',
    '项目代理覆盖',
    proxyEnv.length || envIncomplete ? 'manual' : 'pass',
    proxyEnv.length
      ? '项目配置设置了代理环境变量'
      : envIncomplete
        ? '项目 env 未完整读取，代理覆盖待确认'
        : '未在项目 env 中发现代理覆盖',
    '与网络模式对照；TUN 模式下检查是否存在重复代理。',
    proxyEnv.map(([key, value]) => ({ label: key, value: endpointValue(String(value)) })),
  )
  add(
    'project-endpoint',
    '项目 API 地址',
    env.ANTHROPIC_BASE_URL || envIncomplete ? 'manual' : 'pass',
    env.ANTHROPIC_BASE_URL
      ? '项目配置覆盖了 API 地址'
      : envIncomplete
        ? '项目 env 未完整读取，API 地址待确认'
        : '未发现项目 API 地址覆盖',
    '自定义网关或云平台可以是有意配置，官方模式请核对是否为残留。',
    env.ANTHROPIC_BASE_URL
      ? [{ label: 'ANTHROPIC_BASE_URL', value: endpointValue(String(env.ANTHROPIC_BASE_URL)) }]
      : [],
  )
  const privacyOverrides = [
    'DISABLE_TELEMETRY',
    'DISABLE_ERROR_REPORTING',
    'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  ].filter((key) => key in env && !isNonEmptyEnvironmentValue(env[key]))
  if ('DO_NOT_TRACK' in env && !isEnabledEnvironmentFlag(env.DO_NOT_TRACK))
    privacyOverrides.push('DO_NOT_TRACK')
  add(
    'project-privacy',
    '项目隐私覆盖',
    privacyOverrides.length || envIncomplete ? 'manual' : 'pass',
    privacyOverrides.length
      ? '项目配置包含未启用的隐私开关，需结合全局选择核对'
      : envIncomplete
        ? '项目 env 未完整读取，隐私覆盖待确认'
        : '未发现未启用的项目隐私开关',
    '非空 DISABLE_* / 非必要流量开关都表示关闭，0 也生效；DO_NOT_TRACK 使用布尔值。项目未启用某个开关不代表最终重新开启流量，其他层和总开关仍可能生效。全局修复不改写项目文件。',
    privacyOverrides.map((key) => ({ label: key, value: '项目值未启用此开关；值已隐藏' })),
  )
  const npm = files.get('.npmrc')!
  const git = files.get('.git/config')!
  const proxies = [...npmAssignments(npm.content ?? ''), ...gitAssignments(git.content ?? '')]
  add(
    'project-tool-proxy',
    '项目 npm / Git 代理',
    proxies.length || npm.error || git.error ? 'manual' : 'pass',
    proxies.length
      ? '项目工具配置含代理字段'
      : npm.error || git.error
        ? '项目工具配置未完整读取，代理待确认'
        : '未在已读取文件中发现代理字段',
    '项目层的代理不会随用户级配置修复移除。',
    proxies.map((item) => ({ label: item.key, value: endpointValue(item.value) })),
  )
  const tlsDisabled =
    String(env.NODE_TLS_REJECT_UNAUTHORIZED) === '0' ||
    /^\s*strict-ssl\s*=\s*(?:false|0)\s*(?:[#;].*)?$/im.test(npm.content ?? '')
  add(
    'project-tls',
    '项目 TLS 证书校验',
    tlsDisabled ? 'fail' : envIncomplete || npm.error ? 'manual' : 'pass',
    tlsDisabled
      ? '项目配置关闭了 TLS 证书校验'
      : envIncomplete || npm.error
        ? '项目配置未完整读取，证书校验待确认'
        : '未在已读取配置中发现关闭校验',
    '启用证书校验；企业代理可配置可信 CA，避免忽略证书错误。',
  )
  let mcpCredentials = false
  let mcpReferences = 0
  let mcpDynamic = 0
  let mcpIncomplete = false
  const mcp = files.get('.mcp.json')!
  if (!mcp.exists)
    add(
      'project-mcp',
      '项目 MCP 配置',
      'skipped',
      '未设置 .mcp.json',
      '按实际需求配置可信 MCP 服务。',
    )
  else
    try {
      if (mcp.error) throw new Error(mcp.error)
      const parsed = JSON.parse(mcp.content ?? '') as unknown
      const inspection = inspectMcp(parsed)
      mcpCredentials = inspection.credentials.literal > 0
      mcpReferences = inspection.credentials.reference
      mcpDynamic = inspection.credentials.dynamic
      mcpIncomplete = inspection.errors.length > 0
      add(
        'project-mcp',
        '项目 MCP 配置',
        mcpIncomplete ? 'fail' : inspection.serverCount ? 'manual' : 'pass',
        mcpIncomplete
          ? 'MCP 配置结构需要修正'
          : inspection.serverCount
            ? `配置了 ${inspection.serverCount} 个 MCP 服务`
            : '未声明 MCP 服务',
        '逐项复核来源、命令和权限；变量引用不展开，动态请求头命令不执行。扫描不会连接或启动 MCP 服务。',
        [
          ...inspection.errors.map((value) => ({ label: '结构检查', value })),
          ...inspection.notes.map((value) => ({ label: '待确认', value })),
          ...(mcpReferences
            ? [
                {
                  label: '凭据变量引用',
                  value: `${mcpReferences} 个字段；未解析变量值，不判断认证是否可用`,
                },
              ]
            : []),
          ...(inspection.credentials.literal
            ? [
                {
                  label: '字面凭据候选',
                  value: `${inspection.credentials.literal} 个非空字段；值已隐藏`,
                },
              ]
            : []),
          ...(mcpDynamic
            ? [{ label: '动态凭据表达式', value: `${mcpDynamic} 个字段无法静态判断；值已隐藏` }]
            : []),
        ],
      )
    } catch (error) {
      mcpIncomplete = true
      add(
        'project-mcp',
        '项目 MCP 配置',
        'fail',
        error instanceof SyntaxError
          ? 'MCP JSON 格式错误（内容已隐藏）'
          : safeValue((error as Error).message),
        '修正 MCP JSON 结构后再扫描。',
      )
    }
  const secretsPresent =
    mcpCredentials ||
    Object.entries(env).some(([key, value]) => credentialField.test(key) && value.trim()) ||
    /(?:_authToken|_password)\s*=/.test(npm.content ?? '')
  add(
    'project-secrets',
    '项目凭据存放',
    secretsPresent
      ? 'warn'
      : envIncomplete || mcpIncomplete || mcpReferences || mcpDynamic || npm.error
        ? 'manual'
        : 'pass',
    secretsPresent
      ? '项目配置含非空字面凭据字段，值已隐藏'
      : mcpDynamic
        ? 'MCP 凭据表达式无法静态判断，需要人工确认'
        : mcpReferences
          ? 'MCP 凭据使用变量引用，未读取变量值'
          : envIncomplete || mcpIncomplete || npm.error
            ? '项目配置未完整读取，凭据字段待确认'
            : '未在已读取项目配置中发现常见凭据字段',
    '不要把字面凭据提交到 Git。MCP 支持 ${VAR} / ${VAR:-default}，非空默认值仍保存在文件中；引用不代表变量已设置或认证可用。这里只检查常见字段，不能证明仓库没有其他密钥。',
    [{ label: '读取边界', value: '凭据值与变量值不展示；dotenv、登录凭据和秘密存储不读取' }],
  )
  const dotenv = ['.env', '.env.local'].filter((name) => files.get(name)!.exists)
  add(
    'project-dotenv',
    '环境文件与忽略规则',
    dotenv.length ? 'manual' : 'pass',
    dotenv.length ? '发现本地环境文件，需要核对 Git 忽略规则' : '未发现常见 dotenv 文件',
    '扫描不读取 dotenv 的内容；检查 .gitignore 与已跟踪文件，忽略规则无法删除已经提交的秘密。',
    dotenv.map((name) => ({ label: name, value: '存在；内容未读取' })),
  )
  const pkg = files.get('package.json')!
  if (pkg.exists)
    try {
      if (pkg.error) throw new Error(pkg.error)
      const parsed = JSON.parse(pkg.content ?? '')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('package.json 必须是对象')
      const locks = [
        'package-lock.json',
        'pnpm-lock.yaml',
        'yarn.lock',
        'bun.lock',
        'bun.lockb',
      ].filter((name) => files.get(name)!.exists)
      add(
        'project-dependencies',
        '依赖清单与锁文件',
        locks.length === 1 ? 'pass' : 'warn',
        locks.length === 1
          ? '存在一个包管理器锁文件'
          : locks.length
            ? '同时存在多个锁文件，请确认使用的包管理器'
            : '没有常见锁文件，依赖安装可能不一致',
        '锁文件只证明版本记录存在；漏洞检测与构建测试需要针对项目另行运行，不自动执行 package scripts。',
      )
    } catch (error) {
      add(
        'project-dependencies',
        '依赖清单与锁文件',
        'fail',
        error instanceof SyntaxError
          ? 'package.json 格式错误（内容已隐藏）'
          : safeValue((error as Error).message),
        '修正 package.json 后重新检测。',
      )
    }
  else
    add(
      'project-dependencies',
      '依赖清单与锁文件',
      'skipped',
      '未发现 Node.js 依赖清单',
      '其他语言的构建与依赖需要使用对应工具检测。',
    )
  const gitCommit = await ctx.run(
    'git',
    [
      '--no-optional-locks',
      '-c',
      'core.fsmonitor=false',
      '-C',
      root,
      'rev-parse',
      '--verify',
      'HEAD',
    ],
    3000,
  )
  const validGitCommit = gitCommit.ok && /^[a-f\d]{40,64}$/i.test(gitCommit.stdout.trim())
  add(
    'project-git',
    '本地 Git 提交备份',
    validGitCommit ? 'pass' : 'warn',
    validGitCommit ? '存在可读取的 Git 提交' : '未确认有效的 Git 提交备份',
    '原文 6.11 / 9：将代码保存并提交到本人控制的 Git 仓库。已有提交不代表工作区修改已提交，也不代表有异地备份。',
  )
  add(
    'project-instructions',
    '项目 Claude 指令',
    files.get('CLAUDE.md')!.exists ? 'manual' : 'skipped',
    files.get('CLAUDE.md')!.exists ? '项目包含 CLAUDE.md' : '未发现根目录 CLAUDE.md',
    '检查项目指令来源和目的；不会把其中的文字当作扫描工具的执行指令。',
  )
  const counts: Record<CheckStatus, number> = { pass: 0, warn: 0, fail: 0, manual: 0, skipped: 0 }
  findings.forEach((item) => counts[item.status]++)
  return {
    id: randomUUID(),
    root,
    createdAt: new Date().toISOString(),
    findings,
    counts,
    filesChecked: [...projectFiles],
  }
}
