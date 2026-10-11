import { manualItems, samePreferences } from './types.js'
import type {
  ManualReviewId,
  ManualReview,
  ScanReport,
  SetupJob,
  CheckResult,
  Preferences,
} from './types.js'
import type { LocalActionId } from './local-actions.js'
import { ARTICLE_TIMEZONE, normalizeTimezone } from './timezones.js'

/** Resolve instructions from a report made with the same target preferences. */
export function guidanceTimezone(preferences: Preferences, report?: ScanReport): string {
  const observed = samePreferences(preferences, report?.preferences)
    ? report?.checks
        .find((check) => check.id === 'timezone')
        ?.evidence.find((item) => item.label === '目标时区')?.value
    : undefined
  return (
    normalizeTimezone(observed) ??
    (preferences.timezoneMode === 'article'
      ? ARTICLE_TIMEZONE
      : preferences.timezoneMode === 'manual'
        ? normalizeTimezone(preferences.expectedTimezone)
        : undefined) ??
    '尚未解析的目标时区（请先复检）'
  )
}

/** Rechecks supersede the setup report only when they use the same preferences. */
export function setupFollowupReport(job: SetupJob, reports: ScanReport[]): ScanReport | undefined {
  const matching = reports.filter((report) => samePreferences(job.preferences, report.preferences))
  return (
    matching
      .filter((report) => Date.parse(report.createdAt) >= Date.parse(job.createdAt))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ??
    matching.find((report) => report.id === job.reportId)
  )
}

export interface GuidanceCommand {
  title: string
  text: string
  expected: string
}
export interface ManualGuidance {
  section: string
  steps: string[]
  action?: LocalActionId
  actionLabel?: string
  commands?: GuidanceCommand[]
  links?: { title: string; url: string }[]
  note?: string
}
const nodeTimezone: GuidanceCommand = {
  title: 'Node 进程时区',
  text: 'node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"',
  expected: '应输出本次所选目标时区；未安装 Node 可跳过此命令。',
}
/** Instructions are shared by the persistent checklist and the post-setup result. */
export function manualGuidance(
  id: ManualReviewId,
  platform: string,
  timezone = ARTICLE_TIMEZONE,
): ManualGuidance {
  const mac = platform === 'darwin'
  const windows = platform === 'win32'
  switch (id) {
    case 'timezone-auto':
      return {
        section: '2.2 / 6.1 / 9',
        action: 'date-time',
        actionLabel: '打开日期与时间',
        steps: [
          mac
            ? '系统设置 → 通用 → 日期与时间。'
            : windows
              ? '设置 → 时间和语言 → 日期和时间。'
              : '打开系统的日期与时间设置。',
          '关闭“使用当前位置自动设定时区”或“自动设置时区”。',
          `核对系统时区为 ${timezone}；原文的默认目标是 Asia/Taipei。`,
        ],
        note: '自动校时（NTP）与自动选择时区是不同设置。保留自动校时即可。',
        commands: mac
          ? [
              {
                title: '系统时区',
                text: 'readlink /etc/localtime',
                expected: `路径应以 ${timezone} 结尾。`,
              },
            ]
          : windows
            ? [
                {
                  title: '系统时区',
                  text: 'Get-TimeZone | Select-Object Id,DisplayName',
                  expected: '核对 Windows 时区名称；台北对应 Taipei Standard Time。',
                },
              ]
            : [
                {
                  title: '系统时区',
                  text: 'timedatectl show --property=Timezone --value',
                  expected: `应输出 ${timezone}。`,
                },
              ],
      }
    case 'location-timezone':
      return {
        section: '2.2',
        action: 'location-services',
        actionLabel: '打开定位服务',
        steps: mac
          ? [
              '系统设置 → 隐私与安全性 → 定位服务。',
              '滚动到底部，点击“系统服务”旁的“详细信息”。',
              '关闭“设定时区”，然后点击“完成”。',
              '回到日期与时间，确认自动设定时区关闭、目标时区仍正确。',
            ]
          : [
              '打开系统定位服务设置，核对自动时区选项。',
              'Windows 的自动设置时区位于日期和时间；没有 macOS 的“系统服务”开关。',
            ],
        note: '按原文单独核对，避免定位重新选择时区。跳转通常打开定位服务页，“系统服务”弹窗仍需手动点开；不要关闭所有定位服务。',
      }
    case 'phone-timezone':
      return {
        section: '2.2 / 6.1 / 9',
        steps: [
          `iPhone：设置 → 通用 → 日期与时间，关闭“自动设置”，选择 ${timezone} 对应城市。`,
          '设置 → 隐私与安全性 → 定位服务 → 系统服务，关闭“设定时区”。',
          'Android：在日期与时间关闭自动选择时区，核对所选城市；具体名称由设备厂商决定。',
          '只核对实际登录 Claude 的手机；不用手机端时，在备注中说明。',
        ],
        note: '电脑不能直接跳转另一台手机的设置。',
      }
    case 'terminal-session':
      return {
        section: '2.2 / 2.5⑤',
        action: 'terminal',
        actionLabel: '打开终端',
        steps: [
          '新建终端窗口，旧窗口仍可能保留原来的环境。',
          '逐条执行下方命令，再重新启动 Claude Code。',
          '代理变量只显示名称，避免把密钥打印到屏幕；复杂 shell 条件需在对应配置文件核对。',
        ],
        commands: [
          nodeTimezone,
          {
            title: '进程 TZ 与残留变量名称',
            text: windows
              ? 'Get-ChildItem Env: | Where-Object Name -Match "proxy|anthropic|claude|^TZ$" | Select-Object Name'
              : 'printf \'TZ=%s\\n\' "${TZ:-<unset>}"\nenv | awk -F= \'tolower($1) ~ /proxy|anthropic|claude/ {print $1 "=<set>"}\'',
            expected: `Node 应为 ${timezone}；TUN 模式检查是否仍有代理，官方模式检查 ANTHROPIC_BASE_URL。变量存在不一定有问题，按所选连接方式判断。`,
          },
          {
            title: 'npm / Git 有效代理',
            text: 'npm config get proxy\nnpm config get https-proxy\ngit config --global --get http.proxy\ngit config --global --get https.proxy',
            expected:
              'TUN 模式：npm 应为 null 或空，Git 缺少该 key 通常为空并返回退出码 1。其他代理模式按本人配置核对。',
          },
        ],
      }
    case 'fixed-route':
      return {
        section: '2.3 / 2.4 / 2.5 / 6.2–4',
        steps: [
          'Clash Verge Rev：导入并选中本人订阅，先确认网络能连接。',
          '设置 → 服务模式，按客户端提示安装；启用 TUN（Surge 为增强模式）。',
          '关闭系统代理，代理页选择全局模式与固定节点，关闭自动选择 / 延迟切换。',
          '在代理配置核对 DNS 已开启，dns-hijack 生效；新开终端，再对照浏览器与终端出口。',
          '核对节点是否独享，以及出口的国家、城市和组织；不要以客户端名称或虚拟网卡存在代替验证。',
        ],
        note: '这些是原文的 TUN 路线。选择系统代理或自定义路由时保留自己的路由方案，差异会单独列出。虚拟网卡存在不代表所有流量被接管。',
        links: [
          { title: 'Clash Verge Rev 文档', url: 'https://www.clashverge.dev/guide/term.html' },
        ],
      }
    case 'dns':
      return {
        section: '2.5③ / 6.4',
        steps: [
          '在实际用于 Claude 的浏览器资料中打开 DNS 测试。',
          '等待测试完成，核对解析服务器的国家与网络组织。',
          '结果不符合预期时，回到代理客户端检查 DNS 和 dns-hijack，再重新测试。',
        ],
        note: '本机 DNS 地址只是设置证据；局域网、fake-ip 与真实 DNS 出口需要分开判断。',
      }
    case 'webrtc':
      return {
        section: '2.5② / 6.4',
        steps: [
          '在实际登录 Claude 的浏览器中运行 WebRTC 测试。',
          '与同一浏览器访问 ipinfo.io 的公网出口对照，核对额外公网地址。',
          '确认泄漏后，Chrome 可使用 Google WebRTC Network Limiter，并选择 Use my proxy server (if present)。',
          'Firefox 可在 about:config 将 media.peerconnection.enabled 设为 false；这会影响浏览器通话功能。',
        ],
        note: '禁用 WebRTC 会影响通话。先确认泄漏再调整；CG 内置窗口的样本不代表外部 Chrome。',
        links: [
          {
            title: 'WebRTC Network Limiter',
            url: 'https://chromewebstore.google.com/detail/webrtc-network-limiter/npeicpdbkakmehahjeeohfdhnlpdklia',
          },
        ],
      }
    case 'asn':
      return {
        section: '2.3 / 2.5① / 6.2',
        steps: [
          '打开 IP 查询，记录 country、city、org 和可核验的 ASN 类型。',
          '与上次实际出口对照，核对是否有变化。',
          'ISP / Residential、Hosting 与独享程度分开核实；组织名称或“纯净度”评分不等于 ASN 证明。',
        ],
        commands: [
          {
            title: '终端出口采样',
            text: windows
              ? 'curl.exe --fail --max-time 8 https://ipinfo.io/json'
              : 'curl --fail --max-time 8 https://ipinfo.io/json',
            expected: '核对国家、城市与组织。此查询会连接 ipinfo.io，输出仅在本机核对。',
          },
        ],
      }
    case 'browser-profile':
      return {
        section: '2.6 / 3.1 / 6.6',
        action: 'terminal',
        actionLabel: '打开终端',
        steps: [
          'Chrome 右上角头像 → 添加，创建用于本人 Claude 账号的资料。',
          '在该资料中检查网页语言、时区与网络出口；CG 内置 Chromium 与 Chrome 是不同目标。',
          '需要受控授权时，运行下方命令，将授权链接复制到专用资料中打开；验证邮件也在同一资料中打开。',
        ],
        commands: [
          {
            title: '手动选择授权浏览器',
            text: windows ? '$env:BROWSER="false"; claude' : 'BROWSER=false claude',
            expected: '此命令会启动 Claude Code，请由本人执行；仅用于选择授权链接的打开位置。',
          },
        ],
      }
    case 'sessions':
      return {
        section: '2.6 / 6.9 / 9',
        steps: [
          'Claude → Settings → Account → Active sessions。',
          '核对设备、时间和位置；不认识的会话点击 ⋮ → Terminate。',
          '本工具不能读取账号会话，完成后只保存本人的复核记录。',
        ],
      }
    case 'regions':
      return {
        section: '0 / 1',
        steps: [
          '打开官方支持地区列表，核对实际所在地和所用服务。',
          '使用 Bedrock / Vertex 等云平台时，另外核对该平台区域与服务条件。',
        ],
      }
    case 'client':
      return {
        section: '0 / 4 / 5 / 6.10',
        steps: [
          '核对实际使用的是官方网页、桌面端、Claude Code，或本人授权的 API / 云平台入口。',
          'Claude Code 执行 /status 核对认证来源；订阅登录与 API key 不同。',
          '核对是否误把个人订阅凭据填入其他工具。',
        ],
      }
    case 'auth-method':
      return {
        section: '4 / 5（认证扩展）',
        steps: [
          '在实际 Claude Code 会话输入 /status。',
          '核对 Login method / Login / Profile 与自己选择的订阅、API、云平台模式一致。',
        ],
        note: '/status 是 Claude Code 内部命令，应在 Claude Code 中输入。',
      }
    case 'backup':
      return {
        section: '2.6 / 6.11 / 9',
        steps: [
          '在“项目扫描”中选择实际项目，查看 Git、未提交修改与远端检查。',
          '由本人确认重要代码已经提交，并备份到自己控制的仓库或存储。',
          '重要会话另行导出；CG 的配置快照不包含项目代码、钥匙串或全部会话。',
        ],
        commands: [
          {
            title: '项目工作区状态',
            text: 'git status --short\ngit log -1 --oneline',
            expected: '请先在终端进入实际项目目录。未提交修改和最后一次提交均需本人确认。',
          },
        ],
      }
    case 'cloud-privacy':
      return {
        section: '3.4',
        steps: [
          '打开 Claude 的 Data privacy controls。',
          '按个人意愿选择是否帮助改进模型并保存。',
          '网页隐私选择与 settings.json 本地遥测开关独立。',
        ],
      }
    case 'usage':
      return {
        section: '3.2 / 4 / 6.7 / 9',
        steps: [
          'Settings → Usage 查看五小时和每周额度及重置时间。',
          '达到额度后等到重置；不要把限额提示当作本机配置故障。',
          '文章给出的社区节奏：第 1–3 天正常使用 Free，第 4–7 天按需 Pro，第 2–3 周确有需要再 Max；这不是官方安全保证。',
          '不要把持续高并发或耗尽额度当作配置验证；按真实工作量使用。',
        ],
      }
    case 'contact':
      return {
        section: '3.1',
        steps: ['确认邮箱和手机号由本人长期控制。', '验证邮件在预期网络与专用浏览器资料内打开。'],
      }
    case 'account-ownership':
      return {
        section: '1 / 2.6 / 4 / 9',
        steps: [
          '核对账号、密钥和授权只由本人保管与使用。',
          '检查设备与第三方工具授权；不要将凭据填入本工具备注。',
        ],
      }
    case 'account-export':
      return {
        section: '7',
        steps: [
          '仅在受限或需要备份时，用受限账号登录 claude.ai，在受限页面查看申诉与数据导出入口。',
          '先导出需要的数据，再决定后续操作。',
          '申诉记录账号邮箱、提示原文、发生时间（带时区）以及网页 / Claude Code / API 类型；只写可核对的事实。',
        ],
        note: '这是遇到账号问题时的处理流程，不是日常配置必须执行的步骤。',
      }
    case 'billing':
      return {
        section: '3.3 / 7',
        steps: [
          '根据实际付款渠道查看订单与退款条件。',
          'App Store：打开 Apple 退款入口；官网订阅：头像 → Get help → Send us a message → Claude Refund Request。',
          'Google Play：先核对订单日期，再按官方退款规则处理；礼品订阅按购买渠道规则核对。',
          '退款申请与取消续费分别核对。',
        ],
        links: [
          { title: 'Apple 退款入口', url: 'https://reportaproblem.apple.com/' },
          {
            title: 'Google Play 退款说明',
            url: 'https://support.google.com/googleplay/answer/2479637',
          },
        ],
      }
    case 'service-status':
      return {
        section: '7',
        steps: [
          '遇到连接或服务繁忙时，先查看官方状态页。',
          '按产品、事件时间与本机错误核对；没有事件不等于本机一定正常。',
        ],
      }
    case 'account-notice':
      return {
        section: '1 / 7 / 8',
        steps: [
          '出现验证或警告时，在官网登录页核对完整提示。',
          '仅通过官方流程处理；身份验证使用本人的真实证件。只有警告而尚未受限时，原文提供 usersafety@anthropic.com 联系方式，由本人核对后处理。',
          '本机环境报告不能确定账号限制的原因；不要用新号绕过限制。',
        ],
      }
  }
}

/** Read-only commands and explicit settings paths for unresolved automatic checks. */
export function checkGuidance(
  check: CheckResult,
  platform: string,
  timezone: string,
  preferences: Preferences,
): ManualGuidance {
  const mac = platform === 'darwin'
  const windows = platform === 'win32'
  const manual = checkManual[check.id]
  if (manual) return manualGuidance(manual, platform, timezone)
  switch (check.id) {
    case 'timezone':
      return manualGuidance('timezone-auto', platform, timezone)
    case 'browser-timezone':
      return {
        section: '2.2（浏览器采样扩展）',
        steps: [
          '先核对系统时区，完全退出并重开需要检测的浏览器。',
          '在实际使用的浏览器中重新打开 CG Claude 并复检；CG 内置 Chromium 的结果只代表内置窗口。',
        ],
        action: 'date-time',
        actionLabel: '打开日期与时间',
      }
    case 'system-proxy':
      return {
        section: '2.4 / 2.5④ / 6.5',
        action: 'network-settings',
        actionLabel: '打开网络设置',
        steps: [
          preferences.routeMode === 'tun'
            ? '先确认 TUN / 增强模式可以正常连接，再在代理客户端关闭系统代理。'
            : '按当前所选网络模式核对系统代理，不要直接清除正常使用的路由。',
          mac
            ? '系统设置 → 网络 → 当前网络服务 → 详细信息 → 代理，核对 HTTP、HTTPS、SOCKS 与自动代理。'
            : windows
              ? '设置 → 网络和 Internet → 代理，核对自动配置与手动代理。'
              : '在当前桌面环境的网络设置中核对代理。',
          '修改后重新检测；代理客户端可能重新启用系统代理，也需核对它的开关。',
        ],
        ...(mac
          ? {
              commands: [
                {
                  title: '系统代理状态',
                  text: 'scutil --proxy | grep -E "HTTPEnable|HTTPSEnable|SOCKSEnable|ProxyAutoConfigEnable|ProxyAutoDiscoveryEnable"',
                  expected:
                    'TUN 路线期望所有已显示 Enable 值为 0；字段缺省也可能表示关闭，结合本工具详情核对。',
                },
              ],
            }
          : {}),
      }
    case 'ipv6':
      return {
        section: '2.5（可选 IPv6 加固）',
        action: 'network-settings',
        actionLabel: '打开网络设置',
        steps: [
          '先核对代理是否已覆盖 IPv6，并运行实际浏览器出口测试。链路本地地址不等于公网泄漏。',
          '仅在确认代理无法覆盖且网络允许时考虑关闭 IPv6；这是可选项。',
          ...(mac
            ? [
                '先列出网络服务名称，再把示例中的 Wi-Fi 换成实际服务名；有线连接可能叫 Ethernet。关闭与恢复可能需要管理员授权。',
              ]
            : ['在当前系统与代理客户端中按实际网络需求调整。']),
        ],
        ...(mac
          ? {
              commands: [
                {
                  title: '列出网络服务',
                  text: 'networksetup -listallnetworkservices',
                  expected: '先找到正在使用的服务；名称前的星号表示该服务已停用。',
                },
                {
                  title: '核对 IPv6 设置',
                  text: 'networksetup -getinfo "Wi-Fi"',
                  expected: '将 Wi-Fi 替换为实际服务名称，核对当前 IPv6 设置并记录以便恢复。',
                },
                {
                  title: '可选关闭 IPv6',
                  text: 'sudo networksetup -setv6off "Wi-Fi"',
                  expected:
                    '只在确认需要时执行；密码在系统终端中输入。会改变该网络服务的 IPv6 配置。',
                },
                {
                  title: '恢复自动 IPv6',
                  text: 'sudo networksetup -setv6automatic "Wi-Fi"',
                  expected: '适用于原先为自动配置的服务；如果原先手动配置，请按已记录的参数恢复。',
                },
              ],
            }
          : {}),
        note: '这些命令由本人执行，不包含在 CG 配置快照中。不要关闭全部定位服务或网络服务。',
        links: [{ title: '浏览器出口测试', url: 'https://browserleaks.com/ip' }],
      }
    case 'claude-cli':
      return {
        section: '4 / 5（命令路径扩展）',
        action: 'terminal',
        actionLabel: '打开终端',
        steps: [
          '新开终端，核对实际 Claude Code 命令路径与版本。',
          '应用与终端的 PATH 可能不同；找不到命令不一定表示未安装。安装或修复后重开 CG Claude。',
        ],
        commands: [
          {
            title: 'Claude Code 路径与版本',
            text: windows
              ? 'Get-Command claude | Select-Object Source\nclaude --version'
              : 'command -v claude\nclaude --version',
            expected: '应指向你实际安装的官方 Claude Code。不要仅凭版本字符串判断二进制来源。',
          },
        ],
        links: [{ title: '官方安装说明', url: 'https://code.claude.com/docs/en/setup' }],
      }
    case 'shell-proxy':
    case 'shell-endpoint':
    case 'runtime-endpoint':
      return {
        section: '2.5⑤ / 5 / 6.5',
        action: 'terminal',
        actionLabel: '打开终端',
        steps: [
          '根据检测详情中的文件与行号，在自己的编辑器中核对变量赋值、source 文件、函数及条件分支。',
          '优先使用 CG 可预览的修复。复杂表达式不自动删除，避免损坏 shell 启动配置。',
          preferences.usageMode === 'official'
            ? '官方默认地址模式核对 ANTHROPIC_BASE_URL；TUN 路线另外核对 proxy 变量。保留密钥与无关设置。'
            : '保留所选自定义或云平台需要的地址与认证，仅处理已确认的错误配置。',
          '修改前备份，保存后新开终端，再启动 Claude Code 并复检。',
        ],
        commands: manualGuidance('terminal-session', platform, timezone).commands,
        note: '正文排版中的 ANTHROPICBASEURL 对应真实配置键 ANTHROPIC_BASE_URL；不要把全部 env 或 settings.json 粘贴到公开位置。',
      }
    case 'npm-effective-proxy':
    case 'npm-proxy':
      return {
        section: '2.5⑤ / 6.5',
        action: 'terminal',
        actionLabel: '打开终端',
        steps: [
          '在实际项目目录执行查询，核对用户、项目与环境变量覆盖。',
          'TUN 路线只移除已确认多余的 proxy / https-proxy；保留 registry、认证令牌与其他设置。',
          '用户级安全字段可在 CG 预览修复；项目级与动态来源需在检测详情指出的位置处理。',
        ],
        commands: [
          {
            title: 'npm 生效代理',
            text: 'npm config get proxy\nnpm config get https-proxy',
            expected: 'TUN 路线通常应为 null。结果可能含代理认证信息，仅在本机查看。',
          },
        ],
      }
    case 'git-effective-proxy':
    case 'git-proxy':
      return {
        section: '2.5⑤ / 6.5',
        action: 'terminal',
        actionLabel: '打开终端',
        steps: [
          '在实际项目目录核对全局、项目、include 与 URL 专用代理配置。',
          '按报告中指出的作用域处理，修改前备份；不要清空整个 Git 配置。',
        ],
        commands: [
          {
            title: 'Git 全局代理',
            text: 'git config --global --get http.proxy\ngit config --global --get https.proxy',
            expected: 'TUN 路线通常无输出；键不存在时退出码 1 正常。查询失败与键不存在不同。',
          },
        ],
      }
    case 'browser-language':
      return {
        section: '扩展 · 浏览器语言',
        steps: [
          '在 CG 的“检测偏好”找到“外部浏览器语言配置”，选择实际使用的浏览器资料。',
          '完全退出该浏览器后预览并保存，重开后在同一浏览器复检。',
          'CG 内置 Chromium 的语言与外部 Chrome 独立；网页首选语言与应用菜单语言也分别核对。',
        ],
        note: '这是用户要求的语言扩展。原文没有将英文或中文作为封禁判定条件。',
      }
    default:
      return { section: '扩展 / 复检报告', steps: [check.recommendation] }
  }
}

export interface SetupFollowup {
  id: string
  title: string
  reason: string
  category: string
  manualId?: ManualReviewId
  checkId?: string
  url?: string
  guidance: ManualGuidance
}
const checkManual: Partial<Record<string, ManualReviewId>> = {
  'automatic-timezone': 'timezone-auto',
  'location-timezone': 'location-timezone',
  'timezone-followup': 'phone-timezone',
  dns: 'dns',
  webrtc: 'webrtc',
  tun: 'fixed-route',
  'public-ip': 'asn',
  'route-consistency': 'fixed-route',
  'runtime-proxy': 'terminal-session',
  'timezone-env': 'terminal-session',
}
const conditional = new Set<ManualReviewId>(['account-export', 'service-status', 'account-notice'])
export function setupFollowups(
  job: SetupJob,
  report: ScanReport | undefined,
  reviews: ManualReview[],
  platform: string,
): SetupFollowup[] {
  const timezone = guidanceTimezone(job.preferences, report)
  const result: SetupFollowup[] = []
  const checks = report?.checks.filter((check) => check.status !== 'pass') ?? []
  const fresh = (id: ManualReviewId) =>
    reviews.some(
      (review) =>
        review.id === id &&
        review.checked &&
        review.checkedAt &&
        Date.parse(review.checkedAt) >= Date.parse(job.createdAt),
    )
  const order = [
    'location-timezone',
    'timezone-auto',
    'phone-timezone',
    'terminal-session',
    ...manualItems.map((item) => item.id),
  ] as ManualReviewId[]
  for (const id of new Set(order)) {
    if (conditional.has(id) || fresh(id) || (id === 'location-timezone' && platform !== 'darwin'))
      continue
    if (
      id === 'timezone-auto' &&
      report?.checks.find((check) => check.id === 'automatic-timezone')?.status === 'pass'
    )
      continue
    if (id === 'fixed-route' && job.preferences.routeMode !== 'tun') continue
    const item = manualItems.find((item) => item.id === id)!
    const check = checks.find((check) => checkManual[check.id] === id)
    result.push({
      id: 'manual:' + id,
      manualId: id,
      ...(check ? { checkId: check.id } : {}),
      title: item.title,
      category: item.category,
      reason: check?.summary ?? item.description,
      url: item.url,
      guidance: manualGuidance(id, platform, timezone),
    })
  }
  for (const check of checks) {
    const manualId = checkManual[check.id]
    if (
      manualId &&
      (result.some((item) => item.checkId === check.id) ||
        (['manual', 'skipped'].includes(check.status) &&
          (fresh(manualId) || result.some((item) => item.manualId === manualId))))
    )
      continue
    result.push({
      id: 'check:' + check.id,
      checkId: check.id,
      title: check.title,
      reason: check.summary,
      category: '复检待处理',
      url: check.sourceUrl,
      guidance: checkGuidance(check, platform, timezone, job.preferences),
    })
  }
  return result
}
