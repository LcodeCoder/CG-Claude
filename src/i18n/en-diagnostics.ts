/** Authored diagnostic copy. Raw evidence values, commands and paths stay untouched. */
export const englishDiagnostics: Record<string, string> = {
  正在读取系统与配置文件: 'Reading system settings and configuration files',
  本机配置无法读取: 'Could not read local configuration',
  系统信息无法读取: 'Could not read system information',
  网络检测未完成: 'Network scan did not finish',
  未知: 'Unknown',
  '无需修改。': 'No changes needed.',
  '根据所选网络模式核对 HTTP、SOCKS 与自动代理设置。':
    'Check HTTP, SOCKS and automatic proxy settings against the selected network mode.',
  此系统需手动确认代理设置: 'Verify proxy settings manually on this platform',
  'TUN 预期下系统代理仍开启': 'System proxy is still on in TUN mode',
  已启用系统代理: 'System proxy is on',
  系统代理已关闭: 'System proxy is off',
  '确认 TUN 能正常连接后，在代理客户端关闭系统代理，避免两套配置叠加。':
    'Confirm TUN connectivity, then turn off the system proxy in your proxy client to avoid overlapping settings.',
  '系统代理是合法的网络方式；按当前模式保留或调整。':
    'Keep or adjust the system proxy to match your network mode.',
  '观察 TUN 类接口；接口存在无法证明流量已全部接管。':
    'Look for TUN interfaces. An interface alone does not prove that all traffic uses it.',
  '尚未观察到 TUN 类接口': 'No TUN interface observed',
  '当前模式不要求 TUN': 'This mode does not require TUN',
  接口: 'Interface',
  '在代理客户端确认 TUN、服务模式和路由配置，再通过公网出口检测验证。':
    'Check TUN, service mode and routing in your proxy client, then verify the public egress address.',
  '按你实际使用的网络方式配置。': 'Configure the network mode you actually use.',
  '读取本机解析器配置；实际 DNS 出口需要外部泄漏测试。':
    'Read local DNS resolvers. Actual DNS egress requires an external leak test.',
  '已读取解析器，实际出口待确认': 'Resolvers read; actual egress needs verification',
  '请通过外部测试核对实际 DNS 出口': 'Verify actual DNS egress with an external test',
  本机解析器: 'Local resolver',
  '打开 DNS 泄漏测试，核对实际解析器及代理 DNS 接管情况；本机地址不足以判断地理泄漏。':
    'Run a DNS leak test and check DNS handling in your proxy client. Local resolver addresses alone cannot establish a geographic leak.',
  '检测此工具启动时继承的环境；修改文件不会改变已打开的终端。':
    'Check the environment inherited when this app started. Editing files does not update an open terminal.',
  未发现进程代理变量: 'No process proxy variables found',
  '核对变量是否符合当前网络模式。配置修改后，关闭并重新启动终端和本工具使其生效。':
    'Check that the variables match your network mode. Restart your terminal and this app after editing configuration.',
  '检查 Zsh、Bash 和通用启动配置中的直接变量赋值。':
    'Check direct variable assignments in Zsh, Bash and common shell startup files.',
  部分配置需手动读取: 'Some configuration needs manual review',
  未发现直接的代理赋值: 'No direct proxy assignments found',
  'TUN 模式可按需移除这些配置；系统代理或自定义模式下可保留。动态加载、函数与复杂表达式需手动检查。':
    'In TUN mode, remove these settings if needed. Keep them for system proxy or custom routing. Review dynamic loading, functions and complex expressions manually.',
  '检查 ~/.npmrc 的 proxy 与 https-proxy。': 'Check proxy and https-proxy in ~/.npmrc.',
  '未发现 npm 用户代理': 'No npm user proxy found',
  '仅检查用户级文件；项目或全局 npm 配置可在对应项目另行核对。':
    'Only user settings are checked. Review project and global npm settings separately.',
  '检查全局 Git 文件中的 HTTP(S) 代理，保留其他 Git 设置。':
    'Check HTTP(S) proxies in global Git files while preserving other Git settings.',
  '存在 include 配置，需另行检查': 'Included configuration needs separate review',
  '未发现直接的 Git 用户代理': 'No direct Git user proxy found',
  '项目配置和 include 文件不在自动修改范围，使用 git config --show-origin --get-regexp proxy 在相关项目核对。':
    'Project settings and included files are outside automatic changes. Run git config --show-origin --get-regexp proxy in the relevant project.',
  '读取 ANTHROPIC_BASE_URL 与官方云平台选择变量，隐藏凭据。':
    'Read ANTHROPIC_BASE_URL and official cloud provider selectors without exposing credentials.',
  '当前进程声明宿主管理 API 路由，实际地址需核对':
    'Host-managed API routing is declared; verify the active endpoint',
  '当前进程使用自定义 API 地址': 'The process uses a custom API endpoint',
  当前进程启用了云平台提供商: 'A cloud provider is enabled in the process',
  '未发现 API 地址覆盖': 'No API endpoint override found',
  '自定义 API、Bedrock、Vertex 都可能是有意配置。选择正确的使用方式；清理文件后要重新启动终端。':
    'Custom APIs, Bedrock and Vertex may be intentional. Select the correct service and restart the terminal after editing files.',
  '检查启动文件里的 ANTHROPIC_BASE_URL，凭据与查询参数不展示。':
    'Check ANTHROPIC_BASE_URL in shell startup files. Credentials and query parameters remain hidden.',
  '未发现直接的 API 地址赋值': 'No direct API endpoint assignments found',
  '若准备使用官方默认 API，可移除地址覆盖；自定义服务用户应保留。':
    'Remove the endpoint override if you intend to use the default official API. Keep it for a custom service.',
  'JSON 格式或 env 类型错误，请先手动修正': 'Invalid JSON or env type; correct the file manually',
  '验证 ~/.claude/settings.json 的 JSON 结构。':
    'Validate the JSON structure of ~/.claude/settings.json.',
  '默认文件可读取；实际自定义目录尚未检测':
    'The default file is readable; the custom directory was not scanned',
  配置结构可读取: 'Configuration structure is readable',
  '尚无全局设置，客户端使用默认值': 'No global settings file; the client uses defaults',
  配置位置: 'Configuration location',
  作用范围: 'Scope',
  '先修复 JSON 格式或文件权限，工具会保留原文件。':
    'Correct the JSON format or permissions first. The original file is preserved.',
  '项目级、托管与启动参数可能覆盖全局设置，可在 Claude Code /status 中复核。':
    'Project settings, managed settings and startup arguments may override global settings. Verify with /status in Claude Code.',
  '检查 settings.json 的地址覆盖，按所选提供商判断。':
    'Check settings.json endpoint overrides against the selected provider.',
  '此项只读取默认文件，实际自定义目录需复核':
    'Only the default file was read; review the active custom directory',
  '已设置自定义 API 地址': 'A custom API endpoint is set',
  配置需修正后检测: 'Correct the configuration, then scan again',
  '使用客户端默认 API 地址': 'Using the client’s default API endpoint',
  '恢复默认地址只移除这一项，保留 API Key、模型、权限、Hooks 和其他设置。':
    'Restoring the default endpoint removes only that setting. API keys, models, permissions, hooks and other settings are preserved.',
  '经终端 curl 查询 ipinfo.io，读取出口地址及公开网络信息。':
    'Use terminal curl to query ipinfo.io for the public egress address and network information.',
  按需开启公网检测: 'Enable network scanning when needed',
  公网出口未获取: 'Public egress address unavailable',
  出口地区与期望值不同: 'Egress region differs from the selected region',
  '出口 IP、地区或网络组织与上次检测不同':
    'Egress IP, region or network provider changed since the last scan',
  已读取本机公网出口: 'Public egress address retrieved',
  '公网 IP': 'Public IP',
  地区: 'Region',
  网络组织: 'Network provider',
  上次出口: 'Previous egress',
  上次地区: 'Previous region',
  上次网络组织: 'Previous network provider',
  '运营商名称不能可靠证明住宅/机房类型；工具不据此推算封号概率。出口变化时核对路由。':
    'A provider name cannot reliably establish residential or datacenter status. Check routing when egress changes; the app does not infer account risk.',
  '比较浏览器 HTTPS 查询与终端 curl 查询的公网地址。':
    'Compare public addresses from the browser HTTPS query and terminal curl query.',
  '有一侧出口未获取，暂时无法比较': 'One egress address is missing; comparison is unavailable',
  浏览器与终端出口一致: 'Browser and terminal egress match',
  浏览器与终端使用不同出口: 'Browser and terminal use different egress addresses',
  终端出口: 'Terminal egress',
  浏览器出口: 'Browser egress',
  浏览器查询: 'Browser query',
  '不同代理、IPv4/IPv6、轮换出口或分流会造成差异。结合实际网络方式核对。':
    'Different proxies, IPv4/IPv6, rotating egress or split routing can cause differences. Review your actual network setup.',
  读取失败: 'Read failed',
  'Git 全局查询代理': 'Git global proxy query',
  'npm 查询代理': 'npm proxy query',
  '调用 --global 查询 HTTP 与 HTTPS 代理；包含全局 include，但不证明项目或请求的最终配置。':
    'Query HTTP and HTTPS proxies with --global, including global includes. This does not establish the final settings of a project or request.',
  '在此工具的启动环境中查询 proxy 与 https-proxy；不代表其他终端或项目的配置。':
    'Query proxy and https-proxy in this app’s startup environment. Other terminals and projects may differ.',
  查询读取到代理配置: 'Proxy configuration returned by the query',
  两项查询均未读取到代理: 'Neither query returned a proxy',
  '至少一项查询未成功，需在新终端复核': 'At least one query failed; verify in a new terminal',
  'HTTP 查询': 'HTTP query',
  'HTTPS 查询': 'HTTPS query',
  '复核 npm config get proxy / https-proxy 或 git config --global --get http.proxy / https.proxy。环境变量和其他层级不会被本机文件修复清空。':
    'Check npm config get proxy / https-proxy or git config --global --get http.proxy / https.proxy. File repairs do not clear environment variables or other configuration layers.',
  '检测 CLAUDE_CONFIG_DIR 是否指向默认目录之外。':
    'Check whether CLAUDE_CONFIG_DIR points outside the default directory.',
  '发现自定义目录声明，默认目录检测不代表实际会话':
    'A custom directory is declared; the default directory scan may differ from the active session',
  已读取声明未指向默认目录之外: 'Read declarations do not point outside the default directory',
  '目录声明来自当前进程和默认用户文件；启动文件、其他会话和组织设置需用 /status 另行核对。':
    'Directory declarations come from this process and default user files. Use /status to review startup files, other sessions and organization settings.',
  '检查当前进程、已读取用户配置、npm 和 Git 是否关闭证书验证；不证明所有请求的实际 TLS 状态。':
    'Check whether this process and the read user, npm and Git settings disable certificate verification. This does not establish TLS behavior for every request.',
  '检测到关闭 TLS 证书验证的配置': 'Configuration disables TLS certificate verification',
  '部分 TLS 配置无法静态确认': 'Some TLS settings cannot be confirmed statically',
  未在已读取配置中发现关闭验证: 'No disabled TLS verification found in read configuration',
  检查范围: 'Scope',
  '按证据中的来源恢复证书验证；Git 项与进程变量需在对应来源手动处理。企业代理需要配置可信 CA，可使用 NODE_EXTRA_CA_CERTS；在“自定义 CA 与客户端证书”检查中复核路径。':
    'Restore certificate verification at each listed source. Handle Git settings and process variables at their source. Enterprise proxies need a trusted CA, such as NODE_EXTRA_CA_CERTS; review its path in the certificate check.',
  尚未选择有效的手动目标时区: 'Choose a valid manual target timezone',
  按出口检测需要开启本次公网检测: 'Enable network scanning to match the egress timezone',
  '本机与浏览器出口不同，需先确认要采用哪个出口':
    'Browser and local egress differ; choose which egress to follow',
  '当前出口查询没有返回有效时区；请重新检测或手动选择':
    'The egress query returned no valid timezone; scan again or choose manually',
  检测依据: 'Check basis',
  目标时区: 'Target timezone',
  原文基准: 'Article baseline',
  用于时区建议的出口: 'Egress used for the timezone suggestion',
  目标读取状态: 'Target read status',
  '读取操作系统时区，按原文台北建议、当前 IP 出口或手动选择的目标核对。相同 UTC 偏移不代表同一时区。':
    'Read the operating system timezone and compare it with the article’s Taipei baseline, the current egress IP or a manual target. Equal UTC offsets do not mean equal timezones.',
  系统时区需要手动确认: 'Verify the system timezone manually',
  系统证据来源: 'System evidence source',
  系统原始读数: 'Raw system reading',
  读取状态: 'Read status',
  '先核对系统时区再检测。': 'Verify the system timezone, then scan again.',
  '当前系统读数符合所选目标；自动设定时区、定位服务和手机端仍需单独复核。':
    'The system reading matches the target. Review automatic timezone, location services and phone settings separately.',
  '在系统日期与时间中调整到所选目标，或在 CG Claude 的检测偏好中重新选择时区依据，随后重新检测。':
    'Set the selected timezone in system Date & Time, or change the timezone basis in CG Claude scan preferences, then scan again.',
  '核对当前应用浏览器、本机系统与所选目标时区；两者一致仍需满足目标。':
    'Compare the current app browser, system and target timezones. Browser and system must also match the selected target.',
  从浏览器界面运行后检测: 'Run the scan from the browser interface',
  '时区证据或目标不完整，需确认': 'Timezone evidence or target is incomplete',
  '浏览器与系统一致，且符合所选目标': 'Browser and system match the selected timezone',
  浏览器与系统时区不同: 'Browser and system timezones differ',
  浏览器时区: 'Browser timezone',
  检测范围: 'Scan scope',
  '差异可能来自 TZ、浏览器设置或扩展。系统、终端和浏览器应分别复检；浏览器语言不参与判定。':
    'Differences may come from TZ, browser settings or extensions. Verify system, terminal and browser separately. Browser language is not used in this check.',
  '单独读取 CG Claude 的 Node 进程时区，并核对启动文件、Claude 设置和进程中的 TZ 声明。':
    'Read CG Claude’s Node process timezone separately and check TZ declarations in startup files, Claude settings and the process environment.',
  '进程或 TZ 声明与系统 / 目标时区不同':
    'Process or TZ declarations differ from the system or target timezone',
  时区证据或部分声明未能读取: 'Some timezone evidence or declarations could not be read',
  '已读取的进程与 TZ 声明符合系统和目标':
    'Read process and TZ declarations match the system and target',
  '进程符合系统和目标，未发现 TZ 覆盖':
    'Process matches the system and target; no TZ override found',
  'Node 进程时区': 'Node process timezone',
  未读取来源: 'Unread source',
  '修改系统或 TZ 后重启 CG Claude，并在实际使用 Claude Code 的新终端中核对 Node 时区。这里不能证明所有已打开终端的状态。':
    'Restart CG Claude after changing the system timezone or TZ. Verify Node’s timezone in a new terminal used for Claude Code. This check cannot establish the state of every open terminal.',
  '独立于日期与时间里的自动时区开关。系统定位记录不等于可验证的权限状态。':
    'This is separate from the automatic timezone switch in Date & Time. A location service record does not prove the permission state.',
  需在系统服务中单独关闭并核对: 'Turn off and verify this switch in System Services',
  '定位服务 · 设定时区': 'Location services · Setting Time Zone',
  'Mac：系统设置 → 隐私与安全性 → 定位服务 → 系统服务（详细信息），关闭“设定时区”，点击完成。配置完成页和人工复核提供快捷入口。':
    'Mac: System Settings → Privacy & Security → Location Services → System Services (Details). Turn off “Setting Time Zone” and click Done. Shortcuts are available after setup and under Manual checks.',
  '原文 2.2 / 6.1 / 9：实际登录 Claude 的手机需单独核对时区与两个自动开关。':
    'Article sections 2.2 / 6.1 / 9: check the timezone and both automatic switches on each phone used with Claude.',
  需在实际使用的手机上核对: 'Verify on the phone you actually use',
  'iPhone：通用 → 日期与时间，关闭自动设置并选择目标城市；隐私与安全性 → 定位服务 → 系统服务，关闭设定时区。不使用手机端时，在人工复核备注中说明。':
    'iPhone: General → Date & Time. Turn off Set Automatically and select the target city. Then Privacy & Security → Location Services → System Services: turn off Setting Time Zone. If you do not use a phone, note this in Manual checks.',
  已读取来源: 'Read sources',
  '按所选隐私偏好核对官方开关，分别处理非空值开关与 DO_NOT_TRACK 布尔值。':
    'Check official switches against the selected privacy preference. Nonempty-value switches and the DO_NOT_TRACK boolean are handled separately.',
  部分隐私配置无法静态确认: 'Some privacy settings cannot be confirmed statically',
  '启动文件存在隐私配置，实际会话需确认':
    'Privacy settings appear in startup files; verify the active session',
  已读取配置符合当前隐私偏好: 'Read configuration matches the privacy preference',
  部分隐私开关尚未设置: 'Some privacy switches are not set',
  '核对 HTTP(S) 协议、代理变量选择顺序与绕过规则；文件中的设置不代表当前会话已经采用。':
    'Check HTTP(S) schemes, proxy variable precedence and bypass rules. File settings do not prove the active session uses them.',
  代理绕过规则或地址格式需要复核: 'Review proxy bypass rules or address format',
  部分代理配置需在实际会话确认: 'Verify some proxy settings in the active session',
  已读取配置中未发现代理兼容性问题: 'No proxy compatibility issues found in read configuration',
  '当前文档的选择顺序为 https_proxy → HTTPS_PROXY → http_proxy → HTTP_PROXY，且不支持 SOCKS 代理。在 Claude Code 内运行 /status 确认 Proxy 行；修改启动环境后新建会话。系统代理或 TUN 的实际路由需结合连接结果。':
    'The documented order is https_proxy → HTTPS_PROXY → http_proxy → HTTP_PROXY. SOCKS proxies are not supported. Check the Proxy line in Claude Code /status and start a new session after changing the environment. Verify system proxy or TUN routing with actual connection results.',
  '只检查认证变量和 apiKeyHelper 是否配置；不读取凭据文件、不执行辅助脚本，也不验证账号状态。':
    'Check only whether authentication variables and apiKeyHelper are configured. Credentials are not read, helper scripts are not run, and account state is not verified.',
  '存在宿主管理路由声明，实际提供商需在客户端核对':
    'Host-managed routing is declared; verify the active provider in the client',
  'Foundry 资源名称声明需要核对': 'Review the declared Foundry resource name',
  '存在多种认证配置或提供商选择，需核对实际选择':
    'Multiple authentication sources or providers are configured; verify the active selection',
  '存在版本相关 OAuth 变量，需在客户端复核':
    'Version-specific OAuth variables need client verification',
  '未发现显式认证变量；登录方式需在客户端确认':
    'No explicit authentication variables found; verify login in the client',
  部分认证配置无法静态确认: 'Some authentication settings cannot be confirmed statically',
  '已列出显式认证来源，实际选择以客户端为准':
    'Explicit authentication sources listed; the client determines which is active',
  读取边界: 'Read boundary',
  '在 Claude Code 的 /status 查看 Login method、Login 或 Profile。API Key、Bearer Token、云平台与订阅登录有不同选择规则；组织策略、交互授权及应用托管会话会影响结果。按你的使用方式保留需要的配置。':
    'Check Login method, Login or Profile in Claude Code /status. API keys, Bearer tokens, cloud providers and subscription logins have different selection rules. Organization policies, authorization and host-managed sessions can affect the result. Keep the settings your workflow requires.',
  '核对 CA 路径、证书存储选项与 mTLS 成对字段。只读取文件元数据，不读取证书或私钥内容。':
    'Check CA paths, certificate store options and paired mTLS fields. Only file metadata is read; certificate and private key contents are not read.',
  'mTLS 成对配置': 'mTLS pairing',
  部分证书路径需要在实际会话复核: 'Verify some certificate paths in the active session',
  部分证书设置无法读取: 'Some certificate settings could not be read',
  '已列出证书配置；实际加载与有效性仍需客户端验证':
    'Certificate settings listed; loading and validity still need client verification',
  '未发现自定义证书配置，使用客户端默认信任设置':
    'No custom certificate settings found; using the client’s default trust settings',
  '企业代理应使用可信 CA 和正确的客户端证书。文件可读不代表 PEM 格式、有效期或证书与私钥匹配；在 Claude Code 的 /status 和本机 debug 日志确认加载情况；/status 的额外 CA 一栏只显示路径，不证明文件已加载，需核对 debug 中的加载成功或失败记录。操作系统信任存储的支持还取决于 Claude Code 的安装方式和运行时版本。':
    'Enterprise proxies need a trusted CA and correct client certificates. Readable files do not prove PEM format, validity or certificate/key pairing. Check /status and local debug logs: the extra CA path in /status alone does not prove it was loaded. OS trust store support depends on installation method and runtime version.',
  '通过本机命令搜索路径运行 claude --version，兼容终端登录环境、nvm、Homebrew 与原生安装。未获得版本时再核对固定原生安装路径的元数据。':
    'Run claude --version using the local command search path, including terminal login settings, nvm, Homebrew and native installs. If no version is returned, check metadata at fixed native installation paths.',
  '当前服务未检测到可用的 Claude Code 版本':
    'No usable Claude Code version detected by this service',
  'CG Claude 服务运行时': 'CG Claude service runtime',
  '版本探测成功。如遇版本问题，使用对应安装方式的官方更新入口；登录与权限仍在实际客户端核对。':
    'Version probe succeeded. Use the official update method for your installation if needed. Verify login and permissions in the actual client.',
  '在新终端运行 claude --version 与 claude doctor，核对安装位置和 PATH。桌面进程与终端的环境可能不同；浏览器使用者可跳过。':
    'Run claude --version and claude doctor in a new terminal. Check the installation path and PATH. Desktop and terminal environments can differ; browser-only users can skip this step.',
  实际执行文件: 'Executable',
  版本探测: 'Version probe',
  固定原生安装路径: 'Fixed native installation path',
  '原生安装候选路径不是普通文件，需确认安装': 'Native installation candidate is not a regular file',
  文件信息: 'File information',
  '原生安装候选文件为空，需确认安装': 'Native installation candidate is empty',
  '发现原生安装候选，但当前版本探测未完成':
    'Native installation candidate found; version probe incomplete',
  执行权限: 'Execution permission',
  'CG 内置窗口语言': 'CG built-in window language',
  当前浏览器首选语言: 'Current browser’s preferred language',
  '分别核对语言和地区标记，例如 en-CN 与 en-US 都是英文，但地区不同。使用你选择的目标，不从 IP 推断语言。':
    'Check language and region tags separately. Both en-CN and en-US are English, with different regions. Use the selected target; language is not inferred from IP.',
  未采集浏览器语言: 'Browser language not collected',
  '语言读数无效，需要确认': 'Invalid language reading; verify manually',
  语言与首选语言列表不一致: 'Language and preferred language list disagree',
  实际检测对象: 'Actual client checked',
  'Intl 语言环境': 'Intl locale',
  浏览器语言: 'Browser language',
  语言优先顺序: 'Language preference order',
  目标语言: 'Target language',
  '检测偏好 → 浏览器语言配置，选择实际使用的浏览器用户配置，预览并保存后重开该浏览器。桌面版的 CG 内置窗口与外部 Chrome 独立，CG 内置窗口通过不能证明外部浏览器已修改。Firefox / Safari 可按官方指引设置。':
    'Scan preferences → Browser language. Select the browser profile you actually use, preview and save, then reopen that browser. CG’s built-in desktop window and external Chrome are independent. A passing CG result does not prove Chrome was changed. Use official guidance for Firefox or Safari.',
  此平台需在系统设置中核对: 'Check this switch in system settings on this platform',
  '独立读取 macOS 自动选择时区开关。网络校时（NTP）与此开关不同。':
    'Read macOS’s automatic timezone selection switch separately. Network time synchronization (NTP) is a different setting.',
  未获得可验证的自动时区开关: 'No verifiable automatic timezone switch found',
  '已开启，可能覆盖手动设置的时区': 'On; may override the manually selected timezone',
  自动设定时区已关闭: 'Automatic timezone is off',
  自动设定时区: 'Automatic timezone',
  '一键配置的系统时区步骤会关闭已读取的 macOS 自动时区开关，并保存原状态以便还原。定位服务中的设定时区与手机设置仍需分别核对。':
    'The system timezone step turns off a readable macOS automatic timezone switch and saves its original state for restoration. Review location services and phone settings separately.',
  '查看 {count} 项检查通过的详情': 'View details of {count} passed checks',
  '查看 {count} 项需要关注的详情': 'View details of {count} checks needing attention',
  '查看 {count} 项待确认或未检测的详情': 'View details of {count} pending or unscanned checks',
  '区分公网候选与链路本地 / 私有 IPv6；接口不能证明实际请求路由。':
    'Distinguish public candidates from link-local or private IPv6 addresses. Interfaces alone do not establish request routing.',
  '存在 IPv6 公网候选，需确认代理覆盖': 'Public IPv6 candidates found; verify proxy coverage',
  '仅观察到本地 IPv6 地址，未发现公网候选':
    'Only local IPv6 addresses observed; no public candidates found',
  '未发现非回环 IPv6 地址': 'No non-loopback IPv6 address found',
  '本机地址样本不等于泄漏测试。若代理仅覆盖 IPv4，核对 IPv6 路由；按网络需要选择是否关闭，并记录原配置以便恢复。':
    'Local address samples are not a leak test. If your proxy covers only IPv4, check IPv6 routing. Decide whether to disable it based on your network needs, and record the original settings for restoration.',
  '检查浏览器 ICE 候选地址，比较公网出口；隐藏候选不等于已证明无泄漏。':
    'Check browser ICE candidates against public egress. Hidden candidates do not prove that no leak exists.',
  开启网络检测后检查: 'Enable network scanning to check',
  '完整复核可打开 BrowserLeaks，浏览器扩展及网络策略会影响结果。':
    'Use BrowserLeaks for a fuller review. Browser extensions and network policies can affect results.',
  '浏览器未提供 WebRTC 检测能力': 'WebRTC scanning is unavailable in this browser',
  '发现与浏览器 HTTPS 出口不同的公网地址': 'A public address differs from browser HTTPS egress',
  'WebRTC 采样未完整完成，需外部复核': 'WebRTC sampling is incomplete; verify externally',
  '本次可见公网候选与浏览器 HTTPS 出口一致':
    'Visible public candidates match browser HTTPS egress in this sample',
  '未获取可比较的浏览器出口或公网候选，需外部复核':
    'No comparable browser egress or public candidate; verify externally',
  'STUN 公网候选': 'STUN public candidate',
  本机候选: 'Local candidate',
  '浏览器 HTTPS 出口': 'Browser HTTPS egress',
  '终端出口（不能替代浏览器比较基准）': 'Terminal egress (not the browser comparison baseline)',
  采样状态: 'Sampling status',
  优先变量: 'Preferred variable',
  联合身份变量: 'Federated identity variables',
  私钥口令: 'Private key passphrase',
  公网候选: 'Public candidate',
  本地地址: 'Local address',
  'CG Claude 当前进程': 'Current CG Claude process',
  '非空的 DISABLE_TELEMETRY、DISABLE_ERROR_REPORTING 和 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC 都会关闭对应流量，值为 0 也一样；DO_NOT_TRACK 则按常规布尔值处理。最少流量模式会禁用 Remote Control，并减少自动更新等可选流量。Claude Code 2.1.283 起，付费订阅仅关闭遥测通常可保留 Remote Control；可信设备要求、组织策略与其他开关仍需核对。 它们不控制网页的模型训练选择，也不决定账号状态。修改后新建 Claude Code 会话核对。':
    'Nonempty DISABLE_TELEMETRY, DISABLE_ERROR_REPORTING and CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC values disable their traffic, including 0. DO_NOT_TRACK uses conventional boolean values. Minimal traffic mode disables Remote Control and reduces optional traffic such as updates. Starting with Claude Code 2.1.283, paid subscriptions can usually keep Remote Control when only telemetry is disabled; trusted-device requirements, organization policies and other switches still need review. These settings do not control web training choices or determine account state. Verify in a new Claude Code session after editing.',
}
