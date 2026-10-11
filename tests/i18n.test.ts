import { afterEach, expect, test } from 'vitest'
import { translateUi, uiLanguage } from '../src/i18n'
import { formatDiagnosticCopy } from '../src/i18n/diagnostics'
import { timezoneModeLabels } from '../shared/timezones'

afterEach(() => {
  uiLanguage.value = 'zh-CN'
})

test('localizes diagnostic counts, timezone results and accessible shortcuts without rewriting values', () => {
  uiLanguage.value = 'en'
  expect(formatDiagnosticCopy('发现 3 项 Git 代理，另有 include 配置')).toBe(
    '3 Git proxy settings found; included configuration needs review',
  )
  expect(formatDiagnosticCopy('Asia/Shanghai ≠ Asia/Taipei · 不符合所选目标')).toBe(
    'Asia/Shanghai ≠ Asia/Taipei · Does not match the target',
  )
  expect(formatDiagnosticCopy(`Asia/Taipei · 符合${timezoneModeLabels.manual}`)).toBe(
    'Asia/Taipei · Matches manual selection',
  )
  expect(formatDiagnosticCopy(`Asia/Taipei · 符合${timezoneModeLabels.article}`)).toBe(
    'Asia/Taipei · Matches article’s Taipei baseline',
  )
  expect(formatDiagnosticCopy(`America/New_York · 符合${timezoneModeLabels.exit}`)).toBe(
    'America/New_York · Matches egress timezone',
  )
  expect(formatDiagnosticCopy('en-US · 符合语言目标')).toBe('en-US · Matches the language target')
  expect(formatDiagnosticCopy('~/.claude/settings.json · ANTHROPIC_BASE_URL')).toBe(
    '~/.claude/settings.json · ANTHROPIC_BASE_URL',
  )
  expect(formatDiagnosticCopy('/Users/fixture/中文项目')).toBe('/Users/fixture/中文项目')
  expect(translateUi('查看 {count} 项需要关注的详情', { count: 2 })).toBe(
    'View details of 2 checks needing attention',
  )
  expect(translateUi('当前浏览器首选语言')).toBe('Current browser’s preferred language')
})

test('keeps Chinese authored copy and unknown content unchanged', () => {
  expect(formatDiagnosticCopy('发现 3 项 Git 代理')).toBe('发现 3 项 Git 代理')
  uiLanguage.value = 'en'
  expect(formatDiagnosticCopy('A user-supplied result')).toBe('A user-supplied result')
  expect(translateUi('{constructor}')).toBe('{constructor}')
})
