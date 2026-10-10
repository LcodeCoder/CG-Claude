# 资料核对与采用方式

核对日期：2026-10-11（Asia/Shanghai）。搜索覆盖中文环境排查指南、GitHub 诊断项目、Claude Code 官方文档与 Claude 帮助中心；搜索结果会随时间变化。应用的「参考文献」页保存可检索摘要、原文链接、采用方式、判断边界和关联检查，离线也能阅读摘要。

## 采用的内容

| 线索                             | 交叉核对                                                                                                                                                                                                                             | 在 CG Claude 中的实现                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 代理配置冲突、SOCKS 兼容性       | [官方网络配置](https://code.claude.com/docs/en/network-config)                                                                                                                                                                       | 列出配置来源、大小写冲突、优先变量和 NO_PROXY 候选绕过；实际会话仍由 `/status` 核对                        |
| 用户、项目与组织配置可能覆盖     | [配置文档](https://code.claude.com/docs/en/settings)、[组织管理配置](https://code.claude.com/docs/en/managed-settings)                                                                                                               | 用户文件检测与项目扫描分开展示；提醒复核组织来源，不改写托管策略                                           |
| API Key、Bearer、订阅认证混用    | [认证文档](https://code.claude.com/docs/en/iam)、[API Key 选择说明](https://support.claude.com/en/articles/12304248-manage-api-key-environment-variables-in-claude-code)                                                             | 只展示变量名与存在状态，提示核对实际认证及计费；不读取登录凭据、不发送付费请求                             |
| 隐私开关的含义与副作用           | [环境变量参考](https://code.claude.com/docs/en/env-vars)、[数据使用说明](https://code.claude.com/docs/en/data-usage)                                                                                                                 | 分别处理非空值与布尔值开关，保留等效配置，预览修改；说明功能旗标、Remote Control、更新与网页训练选择的区别 |
| 证书文件与 mTLS 配对             | [官方网络配置](https://code.claude.com/docs/en/network-config)、[Node TLS](https://nodejs.org/api/tls.html)                                                                                                                          | 检查绝对路径、普通文件、非空、可读与成对字段；不读取证书和私钥内容，不替用户关闭 TLS 验证                  |
| 浏览器与终端的网络出口可能不同   | [BrowserLeaks DNS](https://browserleaks.com/dns)、[WebRTC](https://browserleaks.com/webrtc)、[Mihomo TUN](https://wiki.metacubex.one/config/inbound/tun/)                                                                            | 本机与浏览器结果分层，公网查询由用户按需启用；DNS 实际出口和完整 TUN 接管保留人工复核                      |
| 服务故障、额度与账号异常需要区分 | [服务状态](https://status.claude.com/)、[错误分流](https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages)、[警告与申诉](https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals) | 人工复核提供入口、确认时间与备注，环境结果不推算账号状态                                                   |
| 修改前保存基线与前后对比         | 用户原文章、社区诊断项目、项目事务验证                                                                                                                                                                                               | 保存完整快照、精确预览、冲突阻止与失败回退；历史记录比较状态、摘要和证据                                   |

连接编辑依据当前官方网络配置：允许 HTTP(S) 代理、NO_PROXY、自定义 API 网关和额外 CA；每个字段单独选择保持、设置或移除。写入用户 env 不等于当前 shell 或项目配置已生效，保存后提示重新启动并用 `/status` 复核。地址校验不能证明连通性。

新增项目配置核对依据：[权限规则](https://code.claude.com/docs/en/permissions)、[Hooks](https://code.claude.com/docs/en/hooks)、[MCP](https://code.claude.com/docs/en/mcp)、[Bun 锁文件](https://bun.sh/docs/pm/lockfile)。项目结果可按状态筛选、展开证据，并在对应文献与项目项之间跳转。权限检查区分配置声明和实际生效；Hooks 不执行或展示完整命令；MCP 自动启用声明仍受版本与工作区信任影响；Bun 两种锁文件只查元数据。

新增 MCP 凭据核对：官方支持的变量引用与文件中的非空默认值分别显示；不解析变量、不执行 headersHelper，也不把空凭据字段视为明文秘密。文献库已补充 [Anthropic 平台检测与申诉公开说明](https://www.anthropic.com/transparency/system-trust-reporting)，共 32 条。

## 本轮扩展检索

继续搜索中文环境排查文章与开源项目，并逐一与当前官方说明对照。检索到的 [claude-cn-flag-check](https://github.com/shellus/claude-cn-flag-check)、[claude-code-guard](https://github.com/Echoxiawan/claude-code-guard) 和 [claude-ip-guard](https://github.com/cso1z/claude-ip-guard) 可作为版本特定的社区观察；没有独立验证其中的二进制规则与账号结果关系，因此没有导入其账号分数、隐藏标记推断、自动拦截或启动包装器。

中文文章中的住宅 IP、支付、手机号、时区和“稳定使用即不会封禁”等归因，仍缺少可复验的官方映射。本轮可落地的新增内容是：连接配置编辑、MCP 结构与凭据存放区分、配置变化后复检和来源追踪。官方网络文档支持代理、网关与 CA 等企业场景，不能仅因设置了这些字段就判断账号异常。

## 保留为人工判断的内容

住宅 IP、第三方 IP 评分、浏览器时区/语言、固定使用节奏、支付方式等社区描述，不能单独证明 Anthropic 内部风控规则。CG Claude 展示可观测差异和复核入口，不把它们转换为账号安全分数、自动购买建议或“保证不封”的结论。

浏览器指纹伪装、账号批量管理、Cookie/钥匙串清理、远程配置下载后直接执行，都没有足够依据成为本工具的自动修复。项目使用官方支持的配置、明确的本地预览与可还原修改。

## 维护规则

1. 新资料先核对原文与适用版本，优先参考官方文档和项目维护者说明；社区记录保留来源分类。
2. 每条采用的规则注明检测范围和无法确定的部分；遇到动态 shell、不完整读取或版本差异时返回待确认。
3. 改变判断含义时更新 `shared/diagnostic-checks.ts` 中的规则版本，并补充关键边界的测试。
4. 文献列表与 Electron 外链白名单使用同一份 `shared/references.ts`；不在文献页面后台请求原文。
5. 原文变化由后续人工核对更新资料库。应用不会静默更新诊断规则或修改用户配置。

### 错误提示分流与社区方案复核（2026-10-11）

重新检索社区的代理、DNS、IPv6、WebRTC 和客户端包装器建议。它们可提出排查方向，但不能建立本机配置与账号处理结果的确定关系。没有采用住宅 IP 评分、设备指纹注入、TLS 拦截或自动修改客户端二进制。工具保留网络观测、明确的配置优先级和人工复核入口。

依据官方 API errors 页面补充七类错误帮助：连接、401、403、429、402、500/529 与 TLS。429 需结合完整错误、retry-after、额度和工作区支出提示；网关可使用自己的错误语义，界面明确说明适用范围。每类提供关联检查与原文入口，不发送认证或计费请求。文献库共有 32 条可核对来源，摘要与应用一同离线保存。

### 官方账号资料与人工复核（2026-10-11）

核对以下原文并加入库：

- `https://support.claude.com/en/articles/14328960-identity-verification-on-claude`：只在实际官方提示下人工完成身份或企业验证。本工具不收集资料或猜测结果。
- `https://support.claude.com/en/articles/13124001-managing-your-active-sessions`：设备、浏览器与近似位置由官方账号页面提供，本机工具不读取或终止会话。
- `https://privacy.claude.com/en/articles/12109829-how-do-i-change-my-model-improvement-privacy-settings`：消费计划的模型改进选择也涉及这些账号的 Claude Code 会话。它与本机使用指标设置不同；官方仍说明安全与政策处理情形。

文献数增至 35，人工复核关联使用稳定 ID。加入账号提示帮助和官方复核路径，不把关闭遥测、改变代理或完成身份验证表述为不会被限制的保证。

## Remote Control 版本差异复核

2026-10-11 再次核对 [Remote Control 专项文档](https://code.claude.com/docs/en/remote-control)、[官方更新记录](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) 与数据使用说明。2.1.283 起，付费订阅仅设置 DISABLE_TELEMETRY 或 DO_NOT_TRACK 通常保留 Remote Control；CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC、DISABLE_GROWTHBOOK、可信设备要求等仍可能阻止。认证、API 地址和组织策略也有独立要求。

文献库增加专项说明，总数 36。设置、向导、诊断与预览使用同一兼容性文案；使用说明增加第九类错误帮助。工具不自动移除隐私选择或网关来启用远程控制。规则版本为 2026-10-11.5，旧报告仍保留生成时的解释。

## 项目沙箱与政策更新复核

依据 [官方沙箱说明](https://code.claude.com/docs/en/sandboxing)，项目扫描增加独立的命令沙箱声明检查。区分未声明、结构错误、显式关闭、放宽隔离、沙箱外命令例外和限制两类回退的声明；只保留已核对字段的布尔状态与例外数量，不返回命令、域名、路径或未知值。实际平台、依赖和其他配置层仍需在 `/sandbox` 确认；组织强制沙箱还可能忽略项目中的部分放宽声明。

加入 [2026 使用政策更新公告](https://www.anthropic.com/news/2026-usage-policy-update)，明确公布日 2026-10-08、生效日 2026-11-12；当前核对日 2026-10-11 新版本尚未生效。文献总数 38。政策出处供人工阅读，本机检测不计算政策合规或账号结果。

本轮检索同时遇到旧版代理说明和社区的指纹、代理归因主张。旧页面不能覆盖当前网络配置文档；仅凭用户报告也不能建立配置与封禁的确定因果关系。新增能力只采用能在当前原文核对的本地检查。

## 本地探测的 Windows 平台依据

2026-10-11 核对 Node.js child_process 与 Microsoft NeedCurrentDirectoryForExePathW 文档。Windows .cmd 需要解释器启动，不能把直接 execFile 的启动失败当成已安装工具不存在。CG Claude 仅对三个固定只读查询设置兼容回退，保留隔离环境、超时与输出上限；任意项目路径与输入都继续通过参数数组。回退子进程不隐式优先搜索当前目录；该选项不会清理或改写用户 PATH 中显式的目录。文献页关联 Claude CLI 与 npm 有效代理结果。

## 原生安装与桌面进程环境

2026-10-11 再核对官方 setup 文档。原生安装启动器在用户 .local/bin 路径（Windows 为 claude.exe）；不同安装方式的更新方式分别核对。桌面进程的 PATH 与交互终端可能不同，故版本探测失败不等于所有安装方式均未安装。新增固定候选文件的元数据检查，不读取文件内容、不执行候选程序；状态保留待确认。CG Claude 服务的 Node 版本明确标注为服务运行时，不作为 Claude Code 的安装要求。文献增加 setup 依据，错误帮助增加安装/PATH 分流。
