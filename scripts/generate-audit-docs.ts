import { writeFile } from 'node:fs/promises'
import {
  ARTICLE_AUDIT_DATE,
  articleAuditEntries,
  articleAuditGroups,
  articleCoverageLabels,
} from '../shared/article-audit.js'
import { referenceAuditDate, referenceAudits } from '../shared/reference-audit.js'
import { references, referenceKindLabels } from '../shared/references.js'
import { ARTICLE_URL } from '../shared/timezones.js'

const link = (file: string) => `[${file}](../${file})`
const article = [
  '# AYi 原文逐项审计',
  '',
  `核对日期：${ARTICLE_AUDIT_DATE}。依据：[用户指定文章](${ARTICLE_URL})及用户提供的全文（698 行，摘要哈希记录在来源清单）。已逐节核对第 0–10 节和参考来源，并将重复清单归并到下面 ${articleAuditEntries.length} 项要求及执行边界。`,
  '',
  '结论：项目不能自动完成或证明原文全部要求。自动检查表示功能覆盖，本次是否符合仍由报告证据决定；人工勾选、重复采样和模式偏好不会变成账号安全证明。',
  '',
  '当前默认代理与隐私偏好分别为系统代理、均衡模式；原文默认 B 路线采用 TUN 并关闭全部非必要流量。文献页明确显示这类差异。时区默认按原文台北，按出口和手动为用户要求的独立扩展。项目不会为了让原文通过而擅自清除本人网关。',
  '',
  '## 本次纠正的误判',
  '',
  '- 系统时区独立于 Node 进程取证。上海与台北虽同为 UTC+8，也不能按原文目标通过；空目标不再成为无条件通过。',
  '- macOS 电脑自动时区独立读取、关闭与快照还原；定位服务和手机端分别列为待确认。不能由当前时区推断自动开关或定位权限；IP 目标缺失、出口不一致时仍待确认。',
  '- WebRTC 只与当前浏览器的有效公网出口比较；未完成、超时、错误和缺比较基准不通过。单次可见候选不能证明所有浏览器都无泄漏。',
  '- npm / Git 两项查询需全部成功才能报告未发现配置；固定 Git key 不存在与查询失败分开处理。查询名称明确实际配置作用域。',
  '- 一键配置结束集中列出剩余手动任务与非通过项，提供设置跳转、配置步骤、可复制命令和打开空终端；旧勾选不替代本次检查，人工确认不能掩盖实际告警。',
  '- 外部浏览器语言有独立的预览、备份和恢复；CG 内置 Chromium 的采样不代表外部 Chrome。IPv6 链路本地地址不再混作公网候选。',
  '- 正文中的 ANTHROPICBASEURL 等排版丢失下划线，配置采用官方键 ANTHROPIC_BASE_URL；商业推荐、风控猜测不转成自动检查。',
  '- 扩展 TLS 检查补齐 Git http.sslVerify 和 GIT_SSL_NO_VERIFY；include、未知布尔值、不可读来源保留待确认，Git TLS 不自动修复。',
  '',
  '## 修复范围',
  '',
  '修复仅修改用户选定、可可靠解析的白名单字段，经过预览、备份、冲突校验和复检。一键配置可设置系统时区与终端 TZ，系统授权由本人完成；macOS 已知状态的自动时区开关可随系统时区步骤关闭并纳入快照。系统代理、代理客户端、定位服务、手机、账号和支付仍需本人复核。配置快照覆盖十一个用户配置位置、检测偏好和可读取的时区状态，不是 ~/.claude、Keychain 或会话历史的完整备份；不执行原文引用的清理脚本。',
  '',
  '## 逐项对照',
  '',
  ...Object.entries(articleAuditGroups).flatMap(([group, label]) => [
    `### ${label}`,
    '',
    ...articleAuditEntries
      .filter((entry) => entry.group === group)
      .flatMap((entry) => [
        `#### 原文 ${entry.section} · ${entry.title}`,
        '',
        `覆盖：**${articleCoverageLabels[entry.coverage]}**。`,
        '',
        `检测与范围：${entry.implementation}`,
        '',
        `修复与后续：${entry.repair}`,
        '',
        `实现：${link(entry.code)}。`,
        '',
        `关联：${
          [
            ...(entry.checkIds ?? []).map((id) => `环境 \`${id}\``),
            ...(entry.projectCheckIds ?? []).map((id) => `项目 \`${id}\``),
            ...(entry.manualIds ?? []).map((id) => `人工 \`${id}\``),
            ...(entry.fixIds ?? []).map((id) => `修复 \`${id}\``),
          ].join('；') || '只有范围说明，无自动动作'
        }。`,
        '',
      ]),
  ]),
  '## 扩展与来源',
  '',
  '与原文不同的版本条件按官方文档核对，例如遥测的布尔语义和 Remote Control 条件；不默默将社区观点变成自动规则。完整采用段落见 [参考来源逐项审计](reference-audit.md)，时区扩展见 [时区检测](timezone-detection.md)，实际验证见 [验证记录](validation.md)。',
  '',
  '本文由 `npm run docs:audit` 从共享审计数据生成。新增原文对照项应先修改 `shared/article-audit.ts`，再生成文档并核对界面。',
  '',
].join('\n')

const reference = [
  '# 参考来源逐项审计',
  '',
  `核对日期：${referenceAuditDate}。文献库共 ${references.length} 条，包含主原文和扩展依据。以下仅核对项目实际采用的段落，不表示上游全文都被执行、上游代码被运行或服务条件已经满足。`,
  '',
  '官方配置名称、取值和版本条件优先以当前官方说明为准；社区项目只采用注明的方法与限制。外部泄漏页面只核对用途，本轮未替用户进行公网泄漏检测。完整正文不进入源代码仓库，读取渠道和正文哈希见 [来源读取记录](source-audit-manifest.json)。',
  '',
  ...references.flatMap((entry) => {
    const audit = referenceAudits[entry.id]
    if (!audit) throw new Error(`Missing reference audit: ${entry.id}`)
    return [
      `## ${entry.title}`,
      '',
      `${referenceKindLabels[entry.kind]} · ${entry.publisher} · [原文](${entry.url}) · ID：\`${entry.id}\`。`,
      '',
      `采用段落：${audit.section}。`,
      '',
      `项目应用：${entry.application}`,
      '',
      `核对结论：${audit.finding}`,
      '',
      `判断边界：${entry.boundary}`,
      '',
      `对应实现：${link(audit.code)}。`,
      '',
      `关联：${
        [
          ...entry.checkIds.map((id) => `环境 \`${id}\``),
          ...(entry.projectCheckIds ?? []).map((id) => `项目 \`${id}\``),
          ...(entry.manualItemIds ?? []).map((id) => `人工 \`${id}\``),
        ].join('；') || '仅来源说明'
      }。`,
      '',
    ]
  }),
  '本文由 `npm run docs:audit` 从 `shared/references.ts` 和 `shared/reference-audit.ts` 生成。新增扩展时补齐原文、采用段落、代码位置和适用边界；审计测试检查关联是否存在。',
  '',
].join('\n')
await writeFile(new URL('../docs/article-audit.md', import.meta.url), article)
await writeFile(new URL('../docs/reference-audit.md', import.meta.url), reference)
console.log(`已生成 ${articleAuditEntries.length} 项原文对照与 ${references.length} 条文献审计。`)
