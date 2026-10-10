import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CheckStatus, ProjectFinding, ProjectReport } from '../shared/types.js'
import type { Context } from './context.js'
import { claudeEnv, parseClaude, npmAssignments, gitAssignments, proxyKeys } from './configs.js'
import { endpointValue, safeValue } from './safety.js'

const projectFiles = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.mcp.json',
  '.npmrc',
  '.git/config',
  '.gitignore',
  'CLAUDE.md',
  '.env',
  '.env.local',
] as const
interface FileState {
  exists: boolean
  content?: string
  error?: string
}
export async function scanProject(ctx: Context, supplied: string): Promise<ProjectReport> {
  const input = supplied.trim().replace(/^~(?=$|[\/\\])/, ctx.home)
  if (!path.isAbsolute(input)) throw new Error('请输入项目的绝对路径，或在桌面版中选择目录')
  const root = await fs.realpath(path.resolve(input)).catch(() => {
    throw new Error('项目目录不存在或无法读取')
  })
  if (!(await fs.stat(root)).isDirectory()) throw new Error('项目路径必须是文件夹')
  const files = new Map<string, FileState>()
  for (const relative of projectFiles) {
    let current = root
    try {
      for (const part of relative.split('/')) {
        current = path.join(current, part)
        const stat = await fs.lstat(current)
        if (stat.isSymbolicLink()) throw new Error('含符号链接，未读取链接目标')
      }
      const stat = await fs.lstat(current)
      // Lock files and dotenv files only need presence checks; never load their secrets.
      const metadataOnly = /(?:lock|\.env)/.test(relative)
      if (!stat.isFile() || (!metadataOnly && stat.size > 1024 * 1024))
        throw new Error('不是普通文件或需读取的配置超过 1 MB，请手动检查')
      files.set(relative, {
        exists: true,
        content: metadataOnly ? undefined : await fs.readFile(current, 'utf8'),
      })
    } catch (error) {
      files.set(
        relative,
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? { exists: false }
          : { exists: true, error: safeValue((error as Error).message) },
      )
    }
  }
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
  const env: Record<string, unknown> = {}
  for (const relative of ['.claude/settings.json', '.claude/settings.local.json']) {
    const file = files.get(relative)!
    if (!file.exists) {
      add(relative, relative, 'skipped', '此项目未设置该文件', 'Claude 会继续使用其他配置层。')
      continue
    }
    try {
      if (file.error) throw new Error(file.error)
      const config = parseClaude(file.content ?? null)
      Object.assign(env, claudeEnv(config))
      add(
        relative,
        `${relative} 格式`,
        'pass',
        'JSON 和 env 结构可读取',
        '全局、项目、本地、命令行与受管理策略可能存在优先级，仍需核对最终生效值。',
      )
      const permissions = config.permissions as Record<string, unknown> | undefined
      const bypass = permissions?.defaultMode === 'bypassPermissions'
      add(
        relative + '-permissions',
        '项目权限模式',
        bypass ? 'warn' : 'pass',
        bypass ? '项目默认跳过权限检查' : '未发现默认绕过权限模式',
        '按项目需要复核 permissions，不自动扩大或缩小权限。',
      )
      if (config.hooks && typeof config.hooks === 'object')
        add(
          relative + '-hooks',
          '项目 Hooks',
          'manual',
          `存在 ${Object.keys(config.hooks).length} 类 Hooks`,
          '检查命令来源、用途和权限；扫描不会执行 Hook，也不会展示完整命令。',
        )
    } catch (error) {
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
    proxyEnv.length ? 'manual' : 'pass',
    proxyEnv.length ? '项目配置设置了代理环境变量' : '未在项目 env 中发现代理覆盖',
    '与网络模式对照；TUN 模式下检查是否存在重复代理。',
    proxyEnv.map(([key, value]) => ({ label: key, value: endpointValue(String(value)) })),
  )
  add(
    'project-endpoint',
    '项目 API 地址',
    env.ANTHROPIC_BASE_URL ? 'manual' : 'pass',
    env.ANTHROPIC_BASE_URL ? '项目配置覆盖了 API 地址' : '未发现项目 API 地址覆盖',
    '自定义网关或云平台可以是有意配置，官方模式请核对是否为残留。',
    env.ANTHROPIC_BASE_URL
      ? [{ label: 'ANTHROPIC_BASE_URL', value: endpointValue(String(env.ANTHROPIC_BASE_URL)) }]
      : [],
  )
  const privacyOverrides = [
    'DISABLE_TELEMETRY',
    'DISABLE_ERROR_REPORTING',
    'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  ].filter((key) => key in env && String(env[key]) !== '1')
  add(
    'project-privacy',
    '项目隐私覆盖',
    privacyOverrides.length ? 'warn' : 'pass',
    privacyOverrides.length
      ? '项目配置可能重新启用全局已关闭的非必要流量'
      : '未发现重新启用隐私流量的项目覆盖',
    '全局修复不会重写项目文件，在项目配置中核对这些字段。',
    privacyOverrides.map((key) => ({ label: key, value: '[非 1 值；已隐藏]' })),
  )
  const npm = files.get('.npmrc')!
  const git = files.get('.git/config')!
  const proxies = [...npmAssignments(npm.content ?? ''), ...gitAssignments(git.content ?? '')]
  add(
    'project-tool-proxy',
    '项目 npm / Git 代理',
    proxies.length ? 'manual' : 'pass',
    proxies.length ? '项目工具配置含代理字段' : '未在已读取文件中发现代理字段',
    '项目层的代理不会随用户级配置修复移除。',
    proxies.map((item) => ({ label: item.key, value: endpointValue(item.value) })),
  )
  const tlsDisabled =
    String(env.NODE_TLS_REJECT_UNAUTHORIZED) === '0' ||
    /^\s*strict-ssl\s*=\s*(?:false|0)\s*(?:[#;].*)?$/im.test(npm.content ?? '')
  add(
    'project-tls',
    '项目 TLS 证书校验',
    tlsDisabled ? 'fail' : 'pass',
    tlsDisabled ? '项目配置关闭了 TLS 证书校验' : '未在已读取配置中发现关闭校验',
    '启用证书校验；企业代理可配置可信 CA，避免忽略证书错误。',
  )
  let mcpCredentials = false
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
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('.mcp.json 必须是 JSON 对象')
      const servers = (parsed as Record<string, unknown>).mcpServers
      if (
        servers !== undefined &&
        (!servers || typeof servers !== 'object' || Array.isArray(servers))
      )
        throw new Error('mcpServers 必须是对象')
      mcpCredentials = Object.values(servers ?? {}).some((server) => {
        if (!server || typeof server !== 'object' || Array.isArray(server)) return false
        const fields = server as Record<string, unknown>
        return ['env', 'headers'].some((field) => {
          const values = fields[field]
          return (
            values &&
            typeof values === 'object' &&
            !Array.isArray(values) &&
            Object.keys(values).some((key) =>
              /(?:TOKEN|API_KEY|PASSWORD|SECRET|AUTHORIZATION)/i.test(key),
            )
          )
        })
      })
      add(
        'project-mcp',
        '项目 MCP 配置',
        'manual',
        `配置了 ${Object.keys(servers ?? {}).length} 个 MCP 服务`,
        '逐项复核来源、命令和权限；扫描不会连接或启动 MCP 服务。',
      )
    } catch (error) {
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
    Object.keys(env).some((key) => /(?:API_KEY|AUTH_TOKEN|PASSWORD|SECRET)/i.test(key)) ||
    /(?:_authToken|_password)\s*=/.test(npm.content ?? '')
  add(
    'project-secrets',
    '项目凭据存放',
    secretsPresent ? 'warn' : 'pass',
    secretsPresent ? '项目配置含凭据字段，值已隐藏' : '未在已读取项目配置中发现常见凭据字段',
    '凭据留在本地未提交的设置或受管理的秘密存储中，不提交到 Git。这里只检查常见字段，不能证明仓库没有其他密钥。',
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
      const locks = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'].filter(
        (name) => files.get(name)!.exists,
      )
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
  add(
    'project-git',
    '本地 Git 提交备份',
    gitCommit.ok && /^[a-f\d]{40,64}$/i.test(gitCommit.stdout) ? 'pass' : 'warn',
    gitCommit.ok ? '存在可读取的 Git 提交' : '未确认有效的 Git 提交备份',
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
