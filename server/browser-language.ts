import type { BrowserSnapshot, CheckResult, Preferences } from '../shared/types.js'
import { normalizeLanguage } from '../shared/browser-language.js'
import { safeValue } from './safety.js'

export function browserLanguageCheck(
  preferences: Preferences,
  browser?: BrowserSnapshot,
): CheckResult {
  const current = normalizeLanguage(browser?.language)
  const target = preferences.expectedBrowserLanguage
  const first = browser?.languages?.[0] ? normalizeLanguage(browser.languages[0]) : current
  const matches = target === 'en' ? current?.split('-')[0] === 'en' : current === target
  const consistent = current === first
  return {
    id: 'browser-language',
    category: 'browser',
    title: browser?.client === 'cg-chromium' ? 'CG 内置窗口语言' : '当前浏览器首选语言',
    description:
      '分别核对语言和地区标记，例如 en-CN 与 en-US 都是英文，但地区不同。使用你选择的目标，不从 IP 推断语言。',
    status: !browser
      ? 'skipped'
      : !current || !first
        ? 'manual'
        : matches && consistent
          ? 'pass'
          : 'warn',
    summary: !browser
      ? '未采集浏览器语言'
      : !current || !first
        ? '语言读数无效，需要确认'
        : !consistent
          ? '语言与首选语言列表不一致'
          : matches
            ? `${current} · 符合语言目标`
            : `${current} ≠ ${target}`,
    evidence: [
      {
        label: '实际检测对象',
        value: browser?.clientName || '打开 CG 页面的窗口（旧版本未标注客户端）',
      },
      { label: 'Intl 语言环境', value: safeValue(browser?.locale || '旧版本未采集') },
      { label: '浏览器语言', value: safeValue(browser?.language || '未检测') },
      {
        label: '语言优先顺序',
        value: browser?.languages?.length
          ? browser.languages.map((value) => safeValue(value, 80)).join(' → ')
          : '当前版本未采集列表',
      },
      { label: '目标语言', value: target },
      { label: '检测范围', value: '仅当前 CG Claude 窗口；外部登录浏览器需单独核对' },
    ],
    recommendation:
      '检测偏好 → 浏览器语言配置，选择实际使用的浏览器用户配置，预览并保存后重开该浏览器。桌面版的 CG 内置窗口与外部 Chrome 独立，CG 内置窗口通过不能证明外部浏览器已修改。Firefox / Safari 可按官方指引设置。',
    fixIds: [],
    source: 'official',
    sourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/API/Navigator/language',
  }
}
