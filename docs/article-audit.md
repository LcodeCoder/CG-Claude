# AYi 原文逐项审计

核对日期：2026-10-11。依据：[用户指定的完整文章](https://x.com/AYi_AInotes/status/2106639522586829094)，页面显示发表于 2026-10-04。已阅读第 0–10 节和参考来源，并将重复清单归并到下面 43 项要求及执行边界。

结论：项目不能自动完成或证明原文全部要求。自动检查表示功能覆盖，本次是否符合仍由报告证据决定；人工勾选、重复采样和模式偏好不会变成账号安全证明。

当前默认代理与隐私偏好分别为系统代理、均衡模式；原文默认 B 路线采用 TUN 并关闭全部非必要流量。文献页明确显示这类差异。时区默认按原文台北，按出口和手动为用户要求的独立扩展。项目不会为了让原文通过而擅自清除本人网关。

## 本次纠正的误判

- 系统时区独立于 Node 进程取证。上海与台北虽同为 UTC+8，也不能按原文目标通过；空目标不再成为无条件通过。
- 自动时区、定位服务与手机端保持人工复核；IP 查询缺时区、出口不一致或查询不完整时，出口时区依据保持待确认。
- WebRTC 只与当前浏览器的有效公网出口比较；未完成、超时、错误和缺比较基准不通过。单次可见候选不能证明所有浏览器都无泄漏。
- npm / Git 两项查询需全部成功才能报告未发现配置；固定 Git key 不存在与查询失败分开处理。查询名称明确实际配置作用域。
- 扩展 TLS 检查补齐 Git http.sslVerify 和 GIT_SSL_NO_VERIFY；include、未知布尔值、不可读来源保留待确认，Git TLS 不自动修复。

## 修复范围

修复仅修改用户选定、可可靠解析的白名单字段，经过预览、备份、冲突校验和复检。一键配置可设置系统时区与终端 TZ，系统授权由本人完成；系统代理、代理客户端、自动时区、手机、账号和支付需本人复核。配置快照覆盖十一个用户配置位置、检测偏好和可读取的时区状态，不是 ~/.claude、Keychain 或会话历史的完整备份；不执行原文引用的清理脚本。

## 逐项对照

### 系统与网络

#### 原文 2.2 / 6.1 / 9 · 电脑系统时区为台北

覆盖：**自动检查**。

检测与范围：独立读取操作系统时区，默认以 Asia/Taipei 比较；上海即使同为 UTC+8 也不符合原文目标。

修复与后续：一键配置按所选目标实际设置系统时区，必要时由系统请求管理员授权；先保存原时区快照，写入后独立复核。

实现：[server/system-timezone.ts](../server/system-timezone.ts)。

关联：环境 `timezone`。

#### 原文 2.2 · Node 进程时区与系统一致

覆盖：**部分自动检查**。

检测与范围：读取本工具 Node 进程并静态检查 TZ；不能代表所有旧终端或 Claude Code 会话。

修复与后续：一键配置写入可安全解析的 shell TZ 与 Claude env.TZ，并同步本工具进程；已有终端和 Claude Code 会话重开后复核。

实现：[server/timezone-diagnostics.ts](../server/timezone-diagnostics.ts)。

关联：环境 `timezone-env`。

#### 原文 2.2 / 6.1 / 9 · 关闭电脑自动设定时区

覆盖：**人工复核**。

检测与范围：始终待确认；当前读数正确不能证明自动设置已关闭。

修复与后续：在系统日期与时间中修改并记录人工复核。

实现：[server/timezone-diagnostics.ts](../server/timezone-diagnostics.ts)。

关联：环境 `timezone-followup`；人工 `timezone-auto`。

#### 原文 2.2 · 关闭定位服务中的设定时区

覆盖：**人工复核**。

检测与范围：未读取系统定位权限；人工复核单独说明该设置。

修复与后续：提供 macOS 与 iPhone 的系统服务路径。

实现：[shared/types.ts](../shared/types.ts)。

关联：人工 `timezone-auto`。

#### 原文 2.2 / 6.1 / 9 · 手机时区与自动设置

覆盖：**人工复核**。

检测与范围：本机无法读取另一台设备；不由电脑时区推断手机已经符合。

修复与后续：在手机日期与时间和定位服务中逐项复核。

实现：[server/timezone-diagnostics.ts](../server/timezone-diagnostics.ts)。

关联：环境 `timezone-followup`；人工 `timezone-auto`。

#### 原文 2.3 / 2.5① · 出口 country、city、org

覆盖：**部分自动检查**。

检测与范围：按需通过 curl 查询 ipinfo.io，并显示公开出口信息；这是采样，不是 Claude 请求路由证明。

修复与后续：没有自动购买或切换出口。

实现：[server/diagnostics.ts](../server/diagnostics.ts)。

关联：环境 `public-ip`。

#### 原文 2.3 / 2.5① / 9 · 固定 IP、国家、城市和网络组织

覆盖：**部分自动检查**。

检测与范围：与已有网络报告比较四个字段，重复检测记录波动；首次采样或采样间未观察到的变化仍未知。

修复与后续：发现变化后在代理软件核对固定路由。

实现：[server/diagnostics.ts](../server/diagnostics.ts)。

关联：环境 `public-ip`；人工 `fixed-route`。

#### 原文 2.3 / 6.2 / 9 · ASN 类型为 ISP / Residential

覆盖：**人工复核**。

检测与范围：免费查询的 org 不用于推断住宅或机房属性，保留专门复核项。

修复与后续：在查询工具核对实际 ASN 类型。

实现：[shared/types.ts](../shared/types.ts)。

关联：人工 `asn`。

#### 原文 2.3 / 6.2 · 出口是否独享

覆盖：**人工复核**。

检测与范围：IP 和组织名称不能证明独享、共享人数或节点合同条件。

修复与后续：由本人核对节点服务与出口记录。

实现：[shared/types.ts](../shared/types.ts)。

关联：人工 `asn`。

#### 原文 2.3 / 6.2 · 固定节点并关闭自动切换

覆盖：**人工复核**。

检测与范围：没有读取代理客户端的选择器或延迟策略。

修复与后续：在代理客户端固定节点；出口历史仅用于补充观察。

实现：[shared/types.ts](../shared/types.ts)。

关联：人工 `fixed-route`。

#### 原文 2.4 · 代理客户端来源与服务模式

覆盖：**人工复核**。

检测与范围：不以 TUN 接口存在证明客户端来自官方、服务已安装或具备权限。

修复与后续：由本人在客户端确认下载来源、服务模式和权限。

实现：[shared/types.ts](../shared/types.ts)。

关联：人工 `fixed-route`。

#### 原文 2.4 / 6.3 / 9 · TUN 或增强模式覆盖路由

覆盖：**部分自动检查**。

检测与范围：观察虚拟接口、比较浏览器与 curl 出口；TUN 检查保持待确认，未读取客户端路由。

修复与后续：在客户端开启并验证覆盖；不安装驱动或修改客户端。

实现：[server/diagnostics.ts](../server/diagnostics.ts)。

关联：环境 `tun`；环境 `route-consistency`；人工 `fixed-route`。

#### 原文 2.4 / 6.3 · 全局模式与固定出站

覆盖：**人工复核**。

检测与范围：未通过客户端控制 API 检测规则、全局或直连模式。

修复与后续：由本人在代理页面确认模式和节点。

实现：[shared/types.ts](../shared/types.ts)。

关联：人工 `fixed-route`。

#### 原文 2.4 / 2.5④ / 6.5 / 9 · 关闭系统代理

覆盖：**自动检查**。

检测与范围：读取系统 HTTP、HTTPS、SOCKS、PAC 等配置；仅在所选 TUN 模式要求关闭，其他模式按其偏好判断。

修复与后续：引导在系统或代理客户端关闭；不自动修改系统。

实现：[server/diagnostics.ts](../server/diagnostics.ts)。

关联：环境 `system-proxy`。

#### 原文 2.5② / 6.4 / 9 · WebRTC 公网候选与浏览器出口

覆盖：**部分自动检查**。

检测与范围：只接受完成的可比较采样；与浏览器出口不同的公网候选提示关注，超时或缺失证据待确认。

修复与后续：提供 BrowserLeaks 入口；不安装扩展或修改浏览器策略。

实现：[server/diagnostics.ts](../server/diagnostics.ts)。

关联：环境 `webrtc`；人工 `webrtc`。

#### 原文 2.5③ / 6.4 / 9 · DNS 实际出口与 dns-hijack

覆盖：**人工复核**。

检测与范围：读取本机解析器仅作证据，不能证明实际解析出口；DNS 检查始终待确认。

修复与后续：提供外部测试入口，由本人在客户端核对 DNS 接管。

实现：[server/diagnostics.ts](../server/diagnostics.ts)。

关联：环境 `dns`；人工 `dns`；人工 `fixed-route`。

### 终端与本机配置

#### 原文 2.5⑤ / 6.5 / 9 · 终端中的代理变量

覆盖：**部分自动检查**。

检测与范围：读取本工具继承的环境，不等于用户所有终端；TUN 模式下提示残留。

修复与后续：文件修复不能清空旧进程变量；需新建终端并复检。

实现：[server/diagnostics.ts](../server/diagnostics.ts)。

关联：环境 `runtime-proxy`。

#### 原文 2.5⑤ / 6.5 · Shell 启动配置中的代理

覆盖：**部分自动检查**。

检测与范围：检查六个常见用户启动文件的直接赋值；不会执行 source、函数、动态表达式或额外文件。

修复与后续：预览后仅移除无条件完整字面赋值，复杂表达式保留。

实现：[server/configs.ts](../server/configs.ts)。

关联：环境 `shell-proxy`；修复 `shell-proxy`。

#### 原文 2.5⑤ / 6.5 · npm proxy 与 https-proxy

覆盖：**部分自动检查**。

检测与范围：读取 ~/.npmrc 与两项只读查询；一项查询失败不能通过，项目层另行扫描。

修复与后续：预览移除用户文件的两类代理字段，保留 registry 和认证项。

实现：[server/diagnostics.ts](../server/diagnostics.ts)。

关联：环境 `npm-proxy`；环境 `npm-effective-proxy`；项目 `project-tool-proxy`；修复 `npm-proxy`。

#### 原文 2.5⑤ / 6.5 · Git 全局 HTTP(S) 代理

覆盖：**部分自动检查**。

检测与范围：读取两个全局文件并通过 --global 查询；include、URL 子节与项目层需按证据复核。

修复与后续：预览移除能安全定位的用户文件代理字段，保留其他 Git 设置。

实现：[server/configs.ts](../server/configs.ts)。

关联：环境 `git-proxy`；环境 `git-effective-proxy`；项目 `project-tool-proxy`；修复 `git-proxy`。

#### 原文 2.5⑤ / 5 · Claude settings.json 可读取

覆盖：**自动检查**。

检测与范围：验证默认用户 JSON 和 env 对象；不是完整官方 schema 验证。自定义目录、项目和组织覆盖另行复核。

修复与后续：格式错误和非安全路径保持原文件，由本人先处理。

实现：[server/configs.ts](../server/configs.ts)。

关联：环境 `claude-settings`；环境 `config-directory`。

#### 原文 2.5⑤ / 5 / 6.5 / 9 · ANTHROPIC_BASE_URL 地址覆盖

覆盖：**部分自动检查**。

检测与范围：读取进程、直接 shell 赋值、默认用户和指定项目设置；只在官方默认 API 模式提示移除。

修复与后续：预览移除 shell 或默认用户地址字段，保留密钥、权限、Hooks 和模型。

实现：[server/repairs.ts](../server/repairs.ts)。

关联：环境 `runtime-endpoint`；环境 `shell-endpoint`；环境 `claude-endpoint`；项目 `project-endpoint`；修复 `shell-endpoint`；修复 `claude-endpoint`。

#### 原文 2.4 / 2.5⑤ · 修改后在新终端复验

覆盖：**人工复核**。

检测与范围：应用反复检测本机观察，但无法证明另一个已打开终端已经重启。

修复与后续：修复与向导明确提示重新启动相关会话。

实现：[server/repairs.ts](../server/repairs.ts)。

关联：人工 `auth-method`。

#### 原文 4 / 5 / 6.10 / 9 · 官方客户端与订阅授权

覆盖：**部分自动检查**。

检测与范围：探测 claude --version 和安装候选元数据；版本字符串不证明二进制未修改或授权有效。

修复与后续：官方安装、认证和第三方订阅授权由本人复核，不自动升级。

实现：[server/cli-diagnostics.ts](../server/cli-diagnostics.ts)。

关联：环境 `claude-cli`；环境 `auth-sources`；人工 `client`；人工 `auth-method`。

#### 原文 5 / 6.10 · 遥测、错误报告与全部非必要流量

覆盖：**部分自动检查**。

检测与范围：区分非空值开关与布尔开关；原文示例为最少流量模式，默认均衡模式只对应较小范围。项目与组织覆盖需另查。

修复与后续：按所选偏好预览合并 env，保留其他设置；说明 Remote Control 的版本影响。

实现：[server/privacy-diagnostics.ts](../server/privacy-diagnostics.ts)。

关联：环境 `claude-privacy`；项目 `project-privacy`；修复 `claude-privacy`。

#### 原文 6.11 / 9 · 代码有本人控制的本地 Git 备份

覆盖：**部分自动检查**。

检测与范围：指定项目中确认有效 HEAD；已有提交不证明未提交代码或异地备份完整。配置快照仅覆盖白名单设置。

修复与后续：不替用户提交目标项目代码；配置快照支持预览恢复。

实现：[server/projects.ts](../server/projects.ts)。

关联：项目 `project-git`；人工 `backup`。

### 账号与使用

#### 原文 0 / 1 · 服务路线与支持地区

覆盖：**人工复核**。

检测与范围：支持官方 API、自定义服务和各云平台偏好；实际所在地与服务条件由本人核对。

修复与后续：选择偏好后复检；没有把 IP 或时区当作地区合规证明。

实现：[shared/usage-modes.ts](../shared/usage-modes.ts)。

关联：人工 `regions`；人工 `client`。

#### 原文 2.6 / 6.6 / 9 · 独立浏览器资料与授权环境

覆盖：**人工复核**。

检测与范围：本应用浏览器采样不代表 Claude 登录资料；列出 BROWSER=false claude 的本人复核步骤。

修复与后续：由本人创建资料并打开授权链接。

实现：[shared/types.ts](../shared/types.ts)。

关联：人工 `browser-profile`。

#### 原文 1 / 2.6 / 4 / 6.9 / 9 · 本人使用账号、设备与凭据

覆盖：**人工复核**。

检测与范围：本机配置无法证明账号没有共享、借用或第三方授权。

修复与后续：提供本人账号与凭据复核记录，不访问登录秘密。

实现：[shared/types.ts](../shared/types.ts)。

关联：人工 `account-ownership`；人工 `client`。

#### 原文 2.6 / 6.9 / 9 · Active sessions 无陌生登录

覆盖：**人工复核**。

检测与范围：提供官方入口；不读取或终止远程登录会话。

修复与后续：由本人在账号页面检查并处理。

实现：[shared/types.ts](../shared/types.ts)。

关联：人工 `sessions`。

#### 原文 3.1 / 6.6 · 本人控制邮箱、手机号及验证链接

覆盖：**人工复核**。

检测与范围：独立复核项记录检查结果；不读取邮箱、号码或验证码。

修复与后续：由本人确认所有权和登录环境。

实现：[shared/types.ts](../shared/types.ts)。

关联：人工 `contact`；人工 `browser-profile`。

#### 原文 3.2 / 6.7 · Free、Pro、Max 的订阅节奏

覆盖：**人工复核**。

检测与范围：社区按周节奏作为待复核建议，不转换为账户风险权重或升级任务。

修复与后续：订阅由本人按实际需求选择。

实现：[shared/types.ts](../shared/types.ts)。

关联：人工 `usage`；人工 `billing`。

#### 原文 3.2 / 4 / 6.7 / 9 · 使用额度、重置时间与内容政策

覆盖：**人工复核**。

检测与范围：提供 Usage 和官方说明入口；不从超时、语言或环境推断账号额度及封禁。

修复与后续：在实际账号核对提示与额度，不自动换号或运行请求。

实现：[src/content/troubleshooting.ts](../src/content/troubleshooting.ts)。

关联：人工 `usage`；人工 `account-notice`。

#### 原文 3.3 / 6.8 / 7 · 支付、账单、退款与取消续费

覆盖：**人工复核**。

检测与范围：提供官方渠道复核；支付国、账单、付款主体与退款资格无法从本机证明。

修复与后续：由本人分别申请退款和取消续费。

实现：[shared/types.ts](../shared/types.ts)。

关联：人工 `billing`。

#### 原文 3.4 · 账号的模型改进选择

覆盖：**人工复核**。

检测与范围：与本机遥测区分；本机开关不替代账号数据隐私设置。

修复与后续：提供账号隐私页面入口，由本人选择。

实现：[shared/types.ts](../shared/types.ts)。

关联：人工 `cloud-privacy`。

#### 原文 7 · 区分限额、服务故障、账号限制

覆盖：**人工复核**。

检测与范围：排查帮助按实际错误类型分流，提供状态页与官方复核入口。

修复与后续：不从单次网络错误判定封禁，不自动提交申诉。

实现：[src/content/troubleshooting.ts](../src/content/troubleshooting.ts)。

关联：人工 `service-status`；人工 `account-notice`。

#### 原文 7 · 导出、申诉和身份验证

覆盖：**人工复核**。

检测与范围：提示先导出、记录事实与带时区的时间；证件和申诉只在官方流程提交。

修复与后续：不删除账号，不收集证件或代过验证。

实现：[shared/types.ts](../shared/types.ts)。

关联：人工 `account-export`；人工 `account-notice`。

### 可选项与执行边界

#### 原文 2.5 可选 · IPv6 代理覆盖

覆盖：**部分自动检查**。

检测与范围：存在非回环 IPv6 时待确认；接口无法证明 IPv6 请求是否受代理覆盖。

修复与后续：由本人按网络需求选择；不把关闭 IPv6 当作必选。

实现：[server/diagnostics.ts](../server/diagnostics.ts)。

关联：环境 `ipv6`；人工 `fixed-route`。

#### 原文 2.6 · 凭据、历史会话与完整清理

覆盖：**不自动执行**。

检测与范围：快照覆盖十一个用户配置位置、偏好、可读取的系统时区与 TZ，不是 ~/.claude、Keychain 或会话历史的完整备份。

修复与后续：不运行清理脚本、不删除登录凭据；需要时由本人单独完整备份。

实现：[server/snapshots.ts](../server/snapshots.ts)。

关联：人工 `backup`。

#### 原文 5 / 8 · 二进制修改与设备指纹伪装

覆盖：**不自动执行**。

检测与范围：没有实现修改客户端、伪造设备指纹、批量注册或绕过身份验证。

修复与后续：保留官方客户端复核入口。

实现：[src/content/troubleshooting.ts](../src/content/troubleshooting.ts)。

关联：人工 `client`。

#### 原文 4 / 8 · 提示词与 CLAUDE.md 中的位置描述

覆盖：**人工复核**。

检测与范围：项目扫描只提示指令文件的存在和人工审阅；没有读取对话、搜索地名或判定账号风险。原文的位置建议保留为社区观点。

修复与后续：由本人审阅将发送给模型的非必要个人信息；不自动删除、改写或编造所在地。

实现：[server/projects.ts](../server/projects.ts)。

关联：项目 `project-instructions`。

#### 原文 1 / 3.2 / 4 / 7 / 8 · 社区风控归因与账号安全保证

覆盖：**不自动执行**。

检测与范围：不将中文、输入法、回复长度、订阅金额或统计数字转成封禁概率、因果判定或安全通过。

修复与后续：按可观测证据排查；账号问题使用官方复核。

实现：[src/content/troubleshooting.ts](../src/content/troubleshooting.ts)。

关联：人工 `account-notice`。

#### 原文 2.3 / 3.3 / 10 · 住宅节点、主机和银行卡推广

覆盖：**不自动执行**。

检测与范围：未采纳推广价格、推荐码或商家宣传作为检测规则。

修复与后续：没有自动购买、开卡、注册或提交支付信息。

实现：[shared/references.ts](../shared/references.ts)。

关联：只有范围说明，无自动动作。

## 扩展与来源

与原文不同的版本条件按官方文档核对，例如遥测的布尔语义和 Remote Control 条件；不默默将社区观点变成自动规则。完整采用段落见 [参考来源逐项审计](reference-audit.md)，时区扩展见 [时区检测](timezone-detection.md)，实际验证见 [验证记录](validation.md)。

本文由 `npm run docs:audit` 从共享审计数据生成。新增原文对照项应先修改 `shared/article-audit.ts`，再生成文档并核对界面。
