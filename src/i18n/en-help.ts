/** Offline troubleshooting and glossary copy shown on the Help page. */
export const englishHelp: Record<string, string> = {
  使用说明与来源: 'Help & sources',
  '最少流量模式会禁用 Remote Control，并减少自动更新等可选流量。Claude Code 2.1.283 起，付费订阅仅关闭遥测通常可保留 Remote Control；可信设备要求、组织策略与其他开关仍需核对。':
    'Minimal-traffic mode disables Remote Control and reduces optional traffic such as automatic updates. Starting with Claude Code 2.1.283, paid subscriptions that only disable telemetry can usually keep Remote Control; trusted-device requirements, organization policies and other switches still require review.',
  'English · 不限定地区': 'English · Any region',
  '打开 Chrome 设置 → 语言，在首选语言中添加目标英文。':
    'Open Chrome Settings → Languages and add the target English language to preferred languages.',
  '将目标英文移到网页语言列表的第一位；English 与 English (United States) 的地区标记不同。':
    'Move the target English language to the top of the web languages list. English and English (United States) have different region tags.',
  '重新打开浏览器，在原检测网站复检。macOS 的界面语言与网页语言可能分别设置。':
    'Reopen the browser and check again on the original test site. On macOS, the interface language and web language may be configured separately.',
  '打开 Edge 设置 → 语言，在首选语言中添加目标英文。':
    'Open Edge Settings → Languages and add the target English language to preferred languages.',
  '将目标英文移到首选语言列表顶部。':
    'Move the target English language to the top of the preferred languages list.',
  '重新打开 Edge，在原检测网站复检。': 'Reopen Edge and check again on the original test site.',
  '打开 Firefox 设置 → 常规 → 语言；新版也可从「语言 → 网站语言」进入。':
    'Open Firefox Settings → General → Language; newer versions also provide Languages → Website language.',
  '在网页内容的语言设置中添加目标英文，移到第一位并保存。':
    'Add the target English language under web content languages, move it to the first position and save.',
  '重新打开 Firefox，在原检测网站复检。':
    'Reopen Firefox and check again on the original test site.',
  '打开 macOS 系统设置 → 通用 → 语言与地区。':
    'Open macOS System Settings → General → Language & Region.',
  '核对首选语言与地区；Safari 的界面语言和网站收到的语言标记需分别确认。修改会影响系统中其他应用。':
    'Check preferred languages and region. Safari’s interface language and the language tag sent to websites must be checked separately. Changes affect other apps on the system.',
  '重新打开 Safari，在原检测网站复检。': 'Reopen Safari and check again on the original test site.',
  '本机 DNS 设置无法证明解析请求的实际出口，运行外部测试后核对。':
    'Local DNS settings cannot prove the actual egress used for resolution; verify with an external test.',
  '对照公网 IP，确认浏览器没有额外的公网出口。':
    'Compare the public IP to confirm the browser has no additional public egress.',
  '依据官方名单核对你的实际所在地与服务使用条件。':
    'Check your actual location and service eligibility against the official list.',
  '在 Claude 账号设置里核对活跃会话，处理不认识的登录。':
    'Review active sessions in Claude account settings and handle unrecognized sign-ins.',
  '核对官方客户端、API 或云平台的授权方式，凭据只由本人保管。':
    'Check whether authorization uses the official client, API or cloud platform; keep credentials under your own control.',
  '确认代码进入自己的 Git 仓库，重要会话另行导出。':
    'Confirm code is committed to your own Git repository, and export important conversations separately.',
  '日期与时间中关闭自动设定时区。macOS 可单独检测和配置；其他系统或读取失败时请在设置中核对。网络自动校时可以保持开启。':
    'Turn off automatic time zone selection in Date & Time. macOS can be checked and configured separately; on other systems or if reading fails, verify in Settings. Automatic network time synchronization can stay enabled.',
  'Mac：隐私与安全性 → 定位服务 → 系统服务（详细信息），关闭“设定时区”。这是独立开关，不能由当前时区或自动时区读数代替。':
    'Mac: Privacy & Security → Location Services → System Services (Details), then turn off Setting Time Zone. This is an independent switch and cannot be replaced by the current time zone or automatic time zone readings.',
  '在实际登录 Claude 的手机上核对日期与时间、自动设置及定位服务中的设定时区；不使用手机端也可备注说明。':
    'On the phone actually used to sign in to Claude, check Date & Time, automatic settings and the time zone setting under Location Services. If you do not use the mobile app, note that in the review.',
  '已打开的终端和 Claude Code 不会自动加载新配置。打开新窗口复核 TZ、代理和 API 地址，再重启 Claude Code。':
    'Open terminals and Claude Code do not reload new configuration automatically. Open a new window to verify TZ, proxy and API endpoint, then restart Claude Code.',
  '原文 2.3–2.5 / 6.2–4：核对固定节点并关闭自动切换、服务模式、TUN（或增强模式）、关闭系统代理、全局路由、DNS 和 dns-hijack；接口存在不能证明全部接管。':
    'Article 2.3–2.5 / 6.2–4: verify a fixed node and disable auto-switching, service mode, TUN (or enhanced mode), system proxy, global routing, DNS and dns-hijack; the presence of an interface does not prove full capture.',
  '原文 2.3 / 9：查询实际 ASN 类型和出口历史，组织名称与免费接口不足以证明住宅或机房属性。':
    'Article 2.3 / 9: check the actual ASN type and egress history; organization names and free APIs are not enough to prove residential or hosting characteristics.',
  '原文 2.6 / 6.6：使用独立浏览器资料。需要时在实际终端运行 BROWSER=false claude，将授权链接复制到该资料；验证邮件也在同一环境打开。本应用浏览器检测不代表该资料。':
    'Article 2.6 / 6.6: use a separate browser profile. If needed, run BROWSER=false claude in the actual terminal and copy the authorization link into that profile; open verification emails in the same environment. Browser checks in this app do not represent that profile.',
  '原文 3.4：网页端帮助改进 Claude 的设置独立于本地遥测，需要在账号页面自行选择。':
    'Article 3.4: web settings for helping improve Claude are separate from local telemetry and must be chosen on the account page.',
  '原文 3.2 / 4 / 6.7 / 9：检查实际额度、重置时间、授权和客户端使用方式。Free → Pro → Max 的按周节奏是社区经验，不能证明账号状态，也不会自动操作订阅。':
    'Article 3.2 / 4 / 6.7 / 9: check actual quota, reset time, authorization and client usage. The weekly Free → Pro → Max pattern is community experience; it cannot prove account status and will not change subscriptions.',
  '原文 3.1：核对邮箱、手机号是否由本人长期控制，验证邮件是否在预期的浏览器和网络中打开；不读取邮件、手机号或验证链接。':
    'Article 3.1: check that the email address and phone number are under your long-term control and that verification emails open in the expected browser and network; this tool does not read emails, phone numbers or verification links.',
  '原文 1 / 2.6 / 4 / 9：账号和凭据由本人使用与保管，核对设备、共享和第三方授权情况；本机扫描无法证明账号未共享。':
    'Article 1 / 2.6 / 4 / 9: use and keep accounts and credentials yourself, and review devices, sharing and third-party authorization; a local scan cannot prove an account is not shared.',
  '原文 7：需要时由本人在官网登录后导出数据，再决定是否删除；申诉记录事实、时间和时区。退款与取消续费分别处理，本工具不提交申诉或删除账号。':
    'Article 7: when needed, sign in on the official website to export data before deciding whether to delete it; appeals should record facts, time and time zone. Refunds and subscription cancellation are handled separately; this tool does not submit appeals or delete accounts.',
  '原文 3 / 7：核对本人订阅、账单和官方退款渠道；工具不会读取或修改支付信息。':
    'Article 3 / 7: check your subscription, billing and official refund channels; the tool does not read or modify payment information.',
  '查看官方状态页中与你使用的产品对应的事件和时间，区分服务故障与本机配置问题。':
    'Check the official status page for incidents and times relevant to your product, and distinguish service faults from local configuration issues.',
  '出现验证、警告或组织复核提示时，核对官网登录页的完整说明。身份验证只按官方流程完成；本机配置不能确定处理原因。':
    'When verification, warning or organization review notices appear, check the complete explanation on the official sign-in page. Complete identity verification only through official flows; local configuration cannot determine the cause.',
  '在 Claude Code 的 /status 查看 Login method、Login 或 Profile，核对是否采用了预期的订阅、API 或云平台来源。':
    'Check Login method, Login or Profile in Claude Code /status to confirm the expected subscription, API or cloud-platform source.',
  关闭定位服务中的设定时区: 'Turn off Setting Time Zone in Location Services',
  '找不到 Claude Code 或版本探测失败': 'Claude Code not found or version check failed',
  '桌面应用与终端的 PATH 可能不同；探测失败需要结合安装方式核对。':
    'The desktop app and terminal may use different PATH values. Verify a detection failure against how Claude Code was installed.',
  '在新终端运行 claude --version，确认该终端是否能找到客户端。':
    'Run claude --version in a new terminal to confirm that this terminal can find the client.',
  '运行 claude doctor 核对实际安装位置与 PATH；原生安装候选文件存在，只能说明文件信息。':
    'Run claude doctor to verify the actual installation location and PATH. The presence of native-install candidate files only describes file metadata.',
  '按官方说明和实际安装方式处理。CG Claude 服务的 Node 版本不代表 Claude 客户端的运行要求。':
    'Follow the official instructions and the actual installation method. The Node version used by the CG Claude service does not define Claude Code runtime requirements.',
  查看安装与版本证据: 'View installation & version evidence',
  连接超时或断开: 'Connection timeout or disconnect',
  '先核对客户端使用的连接路径，再结合服务状态排查。':
    'Check the connection path used by the client first, then review service status.',
  '检查代理协议、变量优先顺序和 NO_PROXY；保存后重启 Claude Code，用 /status 核对。':
    'Check the proxy protocol, variable precedence and NO_PROXY. Restart Claude Code after saving and verify with /status.',
  '按需开启公网检测，对照当前浏览器与终端出口；DNS 实际出口在人工复核中确认。':
    'Enable public-network checks when needed and compare the browser and terminal egress. Confirm the actual DNS egress during manual review.',
  '查看本人代理软件的连接日志，核对出错时间与目标主机；两侧公网 IP 一致仍不能证明具体 Claude 请求的路径。':
    'Review your proxy app connection log against the failure time and target host. Matching public IPs on both sides still do not prove the path of a specific Claude request.',
  '记录出错时间与具体错误。长请求的连接失败，也可能涉及网络的空闲连接处理。':
    'Record the failure time and exact error. Connection failures on long requests may also involve idle-connection handling in the network.',
  检查代理兼容性: 'Check proxy compatibility',
  查看两侧出口: 'View egress on both sides',
  认证失败: 'Authentication failed',
  '认证错误可能来自凭据问题，也可能是当前会话使用了另一种认证路径。':
    'Authentication errors may come from credentials, or from the current session using a different authentication path.',
  '在 Claude Code /status 确认当前认证来源。':
    'Confirm the current authentication source in Claude Code /status.',
  '核对 API Key、Bearer、apiKeyHelper 与订阅登录是否符合实际服务方式；变量存在只代表已声明。':
    'Check whether the API key, Bearer token, apiKeyHelper and subscription login match the actual service mode. A present variable only means it is declared.',
  '交互模式的 API Key 选择还受授权确认影响，可在 /config 查看 Use custom API key；非交互 -p 模式有不同选择规则，用 /status 与实际调用核对。':
    'API-key selection in interactive mode also depends on authorization confirmation; check Use custom API key in /config. Non-interactive -p mode uses different selection rules; verify with /status and an actual request.',
  '若登录后提示 400 organization disabled，先核对 ANTHROPIC_API_KEY 是否让会话改用 API 路径；需要保留的 API 或网关凭据不要直接删除。':
    'If a 400 organization disabled message appears after login, first check whether ANTHROPIC_API_KEY makes the session use the API path. Do not delete API or gateway credentials you need to keep.',
  '通过官方客户端与账号入口重新确认凭据，保留错误中的 request ID 供支持人员定位。':
    'Reconfirm credentials through the official client and account entry, and keep the request ID from the error for support to investigate.',
  查看认证来源: 'View authentication sources',
  资源权限被拒绝: 'Resource permission denied',
  'Claude API 的这个错误表示当前凭据无权访问相应资源。':
    'This Claude API error means the current credentials are not allowed to access the resource.',
  '核对组织、工作区和资源权限；登录后出现 403 时，确认管理员是否已启用 Claude Code，也核对企业代理的连接日志。':
    'Check organization, workspace and resource permissions. For a 403 after login, confirm whether an administrator enabled Claude Code and review enterprise proxy connection logs.',
  '确认实际服务方式与地区要求；网关或云平台应同时查看其自己的错误说明。':
    'Confirm the actual service mode and regional requirements. Gateways and cloud platforms should also be checked against their own error documentation.',
  '结合完整 error.type 与官方账号页面复核，单次状态码不能确定账号限制原因。':
    'Review the full error.type together with the official account page; a single status code cannot determine the reason for an account restriction.',
  请求过多或额度已达上限: 'Too many requests or quota reached',
  '429 可能涉及请求速率、月度额度或 Claude Code 工作区的支出限制。':
    'A 429 may involve request rate, monthly quota or spending limits for the Claude Code workspace.',
  '若响应带 retry-after，按该时间等待再尝试。':
    'If the response includes retry-after, wait for that interval before retrying.',
  '在对应服务的用量页面核对额度与限制；达到支出上限时，重复重试可能持续失败。':
    'Check quota and limits on the service usage page. Once a spending limit is reached, repeated retries may keep failing.',
  '订阅与 API 用量分别核对，按照完整提示选择下一步。':
    'Check subscription and API usage separately, and choose the next step from the full message.',
  确认正在使用的认证: 'Confirm the authentication in use',
  'API 账单提示': 'API billing notice',
  'Claude API 的这个错误涉及账单或支付信息。':
    'This Claude API error concerns billing or payment information.',
  '先确认正在使用 API、订阅还是云平台服务。':
    'First confirm whether you are using the API, a subscription or a cloud-platform service.',
  '在该服务的官方账单入口复核提示，云平台同时查看其市场账单。':
    'Review the notice in that service official billing portal; for cloud platforms, also check the marketplace bill.',
  'CG Claude 可辅助核对认证来源，账单状态需要你在官方页面确认。':
    'CG Claude can help verify authentication sources, but billing status must be confirmed on the official page.',
  服务繁忙或内部错误: 'Service busy or internal error',
  'Claude API 的这些错误可能来自服务内部异常或临时过载。':
    'These Claude API errors may come from an internal service fault or temporary overload.',
  '打开官方状态页，核对对应产品与出错时间。':
    'Open the official status page and check the relevant product and failure time.',
  '对临时错误逐步延长等待时间，再尝试。':
    'For temporary errors, retry with progressively longer waits.',
  '持续失败时，保存 request ID 和错误时间，通过官方支持入口复核。':
    'If failures persist, save the request ID and failure time and review them through official support.',
  账号或组织复核提示: 'Account or organization review notice',
  '以官网登录页和通知中的具体要求为准。环境检测不能确定账号处理原因。':
    'Follow the specific requirements on the official sign-in page and notice. Environment checks cannot determine the reason for account action.',
  '在官网登录页核对完整提示、时间与账号；网络错误和账号通知需要分别处理。':
    'Review the full notice, time and account on the official sign-in page. Network errors and account notices must be handled separately.',
  '若提示身份或企业验证，由本人在官方流程中完成；CG Claude 不收集这类资料。':
    'If identity or enterprise verification is requested, complete it yourself through the official flow; CG Claude does not collect such information.',
  '如果官方页面列出某个组织 on hold，使用该组织旁的 Request a review 请求复核；组织暂停不等于个人账号也被暂停。':
    'If an organization is listed as on hold on the official page, use Request a review next to that organization. An organization hold does not mean the personal account is also suspended.',
  '认为处理有误时，使用官方支持或申诉入口，附上完整提示与时间；申诉入口需要本人登录。':
    'If you believe the action is wrong, use the official support or appeal channel and include the full notice and time; the appeal channel requires you to sign in.',
  'Remote Control 不可用': 'Remote Control unavailable',
  '可用性同时取决于版本、订阅登录、API 地址、隐私开关和组织策略。':
    'Availability depends on the version, subscription login, API endpoint, privacy switches and organization policy.',
  '在 /status 核对版本与认证。Remote Control 支持 Pro、Max、Team、Enterprise 的 claude.ai 登录；API Key、自定义 API 网关与云平台不支持。':
    'Check the version and authentication in /status. Remote Control supports claude.ai login for Pro, Max, Team and Enterprise; API keys, custom API gateways and cloud platforms are not supported.',
  '2.1.283 起，仅 DISABLE_TELEMETRY / DO_NOT_TRACK 通常允许付费订阅使用。最少流量开关、DISABLE_GROWTHBOOK 或可信设备要求仍可能阻止；按自己的隐私需求选择。':
    'Starting with 2.1.283, only DISABLE_TELEMETRY / DO_NOT_TRACK are generally compatible with paid subscriptions. Minimal-traffic switches, DISABLE_GROWTHBOOK or trusted-device requirements may still block it; choose according to your privacy needs.',
  '核对完整提示、Team / Enterprise 管理设置与可信设备要求。保留网关或隐私选项时，可继续本机会话。':
    'Review the full notice, Team / Enterprise management settings and trusted-device requirements. If you keep the gateway or privacy options, you can continue the local session.',
  查看客户端版本: 'View client version',
  查看隐私开关: 'View privacy switches',
  '证书或 TLS 握手错误': 'Certificate or TLS handshake error',
  '核对信任链、额外 CA 和客户端证书路径。':
    'Check the trust chain, extra CA and client-certificate paths.',
  '检查 NODE_EXTRA_CA_CERTS 与 mTLS 证书、私钥是否按实际企业环境配置。':
    'Check whether NODE_EXTRA_CA_CERTS and the mTLS certificate and private key match the actual enterprise environment.',
  '保留证书验证。可信 CA 可在本机连接设置中配置，再由实际客户端核对加载结果。':
    'Keep certificate verification enabled. A trusted CA can be configured in local connection settings, then the actual client should confirm that it loaded.',
  '/status 的额外 CA 一栏只显示配置路径，不能证明已加载；在本机 debug 日志核对加载成功或失败原因，分享前隐藏路径与凭据。':
    'The extra-CA field in /status only shows the configured path and does not prove it was loaded. Check the local debug log for success or failure, and hide paths and credentials before sharing.',
  '工具只检查文件元数据；证书内容和有效期需要在客户端或证书工具中确认。':
    'The tool only checks file metadata; certificate contents and expiry must be confirmed in the client or a certificate tool.',
  '检查 CA 与客户端证书': 'Check CA & client certificates',
  '检查 TLS 验证设置': 'Check TLS verification settings',
  '虚拟网络接口。是否接管完整流量，还取决于路由、权限和代理客户端配置。':
    'A virtual network interface. Whether it carries all traffic also depends on routing, permissions and proxy-client configuration.',
  '把域名解析为地址的服务。本机解析器地址与实际网络出口需要分别核对。':
    'A service that resolves domain names to addresses. The local resolver address and the actual network egress must be checked separately.',
  '让指定主机绕过代理的规则；* 表示全部绕过。':
    'Rules that make specified hosts bypass the proxy; * means bypass everything.',
  '用于验证服务端证书的受信任证书机构。额外 CA 通常用于企业网络。':
    'A trusted certificate authority used to verify server certificates. Extra CAs are commonly used on enterprise networks.',
  '连接外部工具或数据源的协议。来源、凭据和权限需要逐项核对。':
    'A protocol for connecting external tools or data sources. Sources, credentials and permissions require item-by-item review.',
  配置快照: 'Configuration snapshot',
  '保存固定配置位置的完整内容、权限、缺失状态与检测偏好，用于还原。':
    'Stores the full contents, permissions, missing state and scan preferences of fixed configuration locations for restoration.',
}
