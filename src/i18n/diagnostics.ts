import { translateUi, uiLanguage } from './index'

const timezoneBases: Record<string, string> = {
  '原文建议 · 台北': 'article’s Taipei baseline',
  '按当前 IP 出口': 'egress timezone',
  手动选择时区: 'manual selection',
}

// Format only known diagnostic sentences. Never pass file contents or raw evidence here.
const dynamicCopy: Array<[RegExp, (...values: string[]) => string]> = [
  [/^发现 (\d+) 个虚拟接口$/, (count) => `${count} virtual interfaces found`],
  [/^读取到 (\d+) 个代理变量$/, (count) => `${count} proxy variables found`],
  [/^发现 (\d+) 项持久代理配置$/, (count) => `${count} persistent proxy settings found`],
  [/^发现 (\d+) 项 npm 代理$/, (count) => `${count} npm proxy settings found`],
  [
    /^发现 (\d+) 项 Git 代理(，另有 include 配置)?$/,
    (count, includes) =>
      `${count} Git proxy settings found${includes ? '; included configuration needs review' : ''}`,
  ],
  [/^发现 (\d+) 项自定义 API 地址$/, (count) => `${count} custom API endpoints found`],
  [/^发现 (\d+) 项代理兼容性线索$/, (count) => `${count} proxy compatibility findings`],
  [/^发现 (\d+) 项证书配置线索$/, (count) => `${count} certificate configuration findings`],
  [
    /^([\w/+:-]+) · 符合(原文建议 · 台北|按当前 IP 出口|手动选择时区)$/,
    (timezone, basis) => `${timezone} · Matches ${timezoneBases[basis]}`,
  ],
  [
    /^([\w/+:-]+) ≠ ([\w/+:-]+) · 不符合所选目标$/,
    (current, target) => `${current} ≠ ${target} · Does not match the target`,
  ],
  [
    /^两者均为 ([\w/+:-]+)，但目标是 ([\w/+:-]+)$/,
    (current, target) => `Both use ${current}; the target is ${target}`,
  ],
  [/^([a-zA-Z0-9-]+) · 符合语言目标$/, (current) => `${current} · Matches the language target`],
  [
    /^第 (\d+) \/ (\d+) 遍 · (.+)$/,
    (round, passes, current) => `Pass ${round} / ${passes} · ${formatDiagnosticCopy(current)}`,
  ],
]

export function formatDiagnosticCopy(text: string): string {
  const translated = translateUi(text)
  if (uiLanguage.value !== 'en' || translated !== text) return translated
  for (const [pattern, render] of dynamicCopy) {
    const match = pattern.exec(text)
    if (match) return render(...match.slice(1))
  }
  // Labels may combine a known source with a literal environment key or file path.
  return text
    .split(' · ')
    .map((part) => translateUi(part))
    .join(' · ')
}
