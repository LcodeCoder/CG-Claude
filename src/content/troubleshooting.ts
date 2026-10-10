import type { ManualReviewId } from '../../shared/types'
import type { DiagnosticCheckId } from '../../shared/diagnostic-checks'

type Guide = {
  id: string
  title: string
  codes: string
  meaning: string
  steps: string[]
  checks: { id: DiagnosticCheckId; label: string }[]
  source: string
  manual?: ManualReviewId
}
/** Curated help stays offline; it never submits credentials or reproduces API requests. */
export const troubleshootingGuides: Guide[] = [
  {
    id: 'installation',
    title: '找不到 Claude Code 或版本探测失败',
    codes: 'command not found · PATH · launch',
    meaning: '桌面应用与终端的 PATH 可能不同；探测失败需要结合安装方式核对。',
    steps: [
      '在新终端运行 claude --version，确认该终端是否能找到客户端。',
      '运行 claude doctor 核对实际安装位置与 PATH；原生安装候选文件存在，只能说明文件信息。',
      '按官方说明和实际安装方式处理。CG Claude 服务的 Node 版本不代表 Claude 客户端的运行要求。',
    ],
    checks: [{ id: 'claude-cli', label: '查看安装与版本证据' }],
    source: 'claude-setup',
  },
  {
    id: 'connection',
    title: '连接超时或断开',
    codes: 'timeout · ECONNRESET · DNS',
    meaning: '先核对客户端使用的连接路径，再结合服务状态排查。',
    steps: [
      '检查代理协议、变量优先顺序和 NO_PROXY；保存后重启 Claude Code，用 /status 核对。',
      '按需开启公网检测，对照当前浏览器与终端出口；DNS 实际出口在人工复核中确认。',
      '查看本人代理软件的连接日志，核对出错时间与目标主机；两侧公网 IP 一致仍不能证明具体 Claude 请求的路径。',
      '记录出错时间与具体错误。长请求的连接失败，也可能涉及网络的空闲连接处理。',
    ],
    checks: [
      { id: 'proxy-compatibility', label: '检查代理兼容性' },
      { id: 'route-consistency', label: '查看两侧出口' },
    ],
    source: 'api-errors',
    manual: 'fixed-route',
  },
  {
    id: 'authentication',
    title: '认证失败',
    codes: '401 · authentication_error · organization disabled',
    meaning: '认证错误可能来自凭据问题，也可能是当前会话使用了另一种认证路径。',
    steps: [
      '在 Claude Code /status 确认当前认证来源。',
      '核对 API Key、Bearer、apiKeyHelper 与订阅登录是否符合实际服务方式；变量存在只代表已声明。',
      '交互模式的 API Key 选择还受授权确认影响，可在 /config 查看 Use custom API key；非交互 -p 模式有不同选择规则，用 /status 与实际调用核对。',
      '若登录后提示 400 organization disabled，先核对 ANTHROPIC_API_KEY 是否让会话改用 API 路径；需要保留的 API 或网关凭据不要直接删除。',
      '通过官方客户端与账号入口重新确认凭据，保留错误中的 request ID 供支持人员定位。',
    ],
    checks: [{ id: 'auth-sources', label: '查看认证来源' }],
    source: 'claude-user-faq',
  },
  {
    id: 'permission',
    title: '资源权限被拒绝',
    codes: '403 · permission_error',
    meaning: 'Claude API 的这个错误表示当前凭据无权访问相应资源。',
    steps: [
      '核对组织、工作区和资源权限；登录后出现 403 时，确认管理员是否已启用 Claude Code，也核对企业代理的连接日志。',
      '确认实际服务方式与地区要求；网关或云平台应同时查看其自己的错误说明。',
      '结合完整 error.type 与官方账号页面复核，单次状态码不能确定账号限制原因。',
    ],
    checks: [{ id: 'auth-sources', label: '查看认证来源' }],
    source: 'api-errors',
    manual: 'regions',
  },
  {
    id: 'rate-limit',
    title: '请求过多或额度已达上限',
    codes: '429 · rate_limit_error',
    meaning: '429 可能涉及请求速率、月度额度或 Claude Code 工作区的支出限制。',
    steps: [
      '若响应带 retry-after，按该时间等待再尝试。',
      '在对应服务的用量页面核对额度与限制；达到支出上限时，重复重试可能持续失败。',
      '订阅与 API 用量分别核对，按照完整提示选择下一步。',
    ],
    checks: [{ id: 'auth-sources', label: '确认正在使用的认证' }],
    source: 'api-errors',
    manual: 'usage',
  },
  {
    id: 'billing',
    title: 'API 账单提示',
    codes: '402 · billing_error',
    meaning: 'Claude API 的这个错误涉及账单或支付信息。',
    steps: [
      '先确认正在使用 API、订阅还是云平台服务。',
      '在该服务的官方账单入口复核提示，云平台同时查看其市场账单。',
      'CG Claude 可辅助核对认证来源，账单状态需要你在官方页面确认。',
    ],
    checks: [{ id: 'auth-sources', label: '查看认证来源' }],
    source: 'api-errors',
    manual: 'billing',
  },
  {
    id: 'service',
    title: '服务繁忙或内部错误',
    codes: '500 · api_error / 529 · overloaded_error',
    meaning: 'Claude API 的这些错误可能来自服务内部异常或临时过载。',
    steps: [
      '打开官方状态页，核对对应产品与出错时间。',
      '对临时错误逐步延长等待时间，再尝试。',
      '持续失败时，保存 request ID 和错误时间，通过官方支持入口复核。',
    ],
    checks: [],
    source: 'claude-status',
  },
  {
    id: 'account-notice',
    title: '账号或组织复核提示',
    codes: 'verification · account notice',
    meaning: '以官网登录页和通知中的具体要求为准。环境检测不能确定账号处理原因。',
    steps: [
      '在官网登录页核对完整提示、时间与账号；网络错误和账号通知需要分别处理。',
      '若提示身份或企业验证，由本人在官方流程中完成；CG Claude 不收集这类资料。',
      '如果官方页面列出某个组织 on hold，使用该组织旁的 Request a review 请求复核；组织暂停不等于个人账号也被暂停。',
      '认为处理有误时，使用官方支持或申诉入口，附上完整提示与时间；申诉入口需要本人登录。',
    ],
    checks: [],
    source: 'claude-appeals',
    manual: 'account-notice',
  },
  {
    id: 'remote-control',
    title: 'Remote Control 不可用',
    codes: 'remote-control · eligibility · feature-flag',
    meaning: '可用性同时取决于版本、订阅登录、API 地址、隐私开关和组织策略。',
    steps: [
      '在 /status 核对版本与认证。Remote Control 支持 Pro、Max、Team、Enterprise 的 claude.ai 登录；API Key、自定义 API 网关与云平台不支持。',
      '2.1.283 起，仅 DISABLE_TELEMETRY / DO_NOT_TRACK 通常允许付费订阅使用。最少流量开关、DISABLE_GROWTHBOOK 或可信设备要求仍可能阻止；按自己的隐私需求选择。',
      '核对完整提示、Team / Enterprise 管理设置与可信设备要求。保留网关或隐私选项时，可继续本机会话。',
    ],
    checks: [
      { id: 'claude-cli', label: '查看客户端版本' },
      { id: 'auth-sources', label: '查看认证来源' },
      { id: 'claude-privacy', label: '查看隐私开关' },
    ],
    source: 'claude-remote-control',
    manual: 'auth-method',
  },
  {
    id: 'certificate',
    title: '证书或 TLS 握手错误',
    codes: 'certificate · TLS',
    meaning: '核对信任链、额外 CA 和客户端证书路径。',
    steps: [
      '检查 NODE_EXTRA_CA_CERTS 与 mTLS 证书、私钥是否按实际企业环境配置。',
      '保留证书验证。可信 CA 可在本机连接设置中配置，再由实际客户端核对加载结果。',
      '工具只检查文件元数据；证书内容和有效期需要在客户端或证书工具中确认。',
    ],
    checks: [
      { id: 'ca-configuration', label: '检查 CA 与客户端证书' },
      { id: 'tls-verification', label: '检查 TLS 验证设置' },
    ],
    source: 'claude-network',
  },
]
export const environmentTerms = [
  {
    term: 'TUN',
    definition: '虚拟网络接口。是否接管完整流量，还取决于路由、权限和代理客户端配置。',
  },
  { term: 'DNS', definition: '把域名解析为地址的服务。本机解析器地址与实际网络出口需要分别核对。' },
  { term: 'NO_PROXY', definition: '让指定主机绕过代理的规则；* 表示全部绕过。' },
  { term: 'CA', definition: '用于验证服务端证书的受信任证书机构。额外 CA 通常用于企业网络。' },
  { term: 'MCP', definition: '连接外部工具或数据源的协议。来源、凭据和权限需要逐项核对。' },
  {
    term: '配置快照',
    definition: '保存固定配置位置的完整内容、权限、缺失状态与检测偏好，用于还原。',
  },
]
