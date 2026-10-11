import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useAppSettings } from '../src/composables/useAppSettings'
import { translateUi, uiLanguage } from '../src/i18n'
import { defaultAppSettings } from '../shared/app-settings'

let cache: Map<string, string>
let element: { lang: string; dataset: Record<string, string> }
beforeEach(() => {
  cache = new Map()
  element = { lang: 'zh-CN', dataset: {} }
  vi.stubGlobal('document', { documentElement: element })
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => cache.get(key) ?? null,
    setItem: (key: string, value: string) => cache.set(key, value),
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {}) // Mounted loading is invoked explicitly in this node test.
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  uiLanguage.value = 'zh-CN'
})

test('loads saved locale and theme, retaining confirmed settings on a failed write', async () => {
  const saved = { language: 'en' as const, theme: 'eye-care' as const, reduceMotion: true }
  const transport = vi
    .fn()
    .mockResolvedValueOnce(Response.json(saved))
    .mockResolvedValueOnce(Response.json({ error: 'fixture-write-failed' }, { status: 500 }))
  vi.stubGlobal('fetch', transport)
  const c = useAppSettings(() => 'local-token')
  await c.load()
  expect(c.loaded.value).toBe(true)
  expect(element).toEqual({ lang: 'en', dataset: { theme: 'eye-care', reduceMotion: 'true' } })
  expect(document.title).toBe('CG Claude · Local environment')
  expect(translateUi('应用设置')).toBe('App settings')
  expect(translateUi('还需手动完成 {count} 项', { count: 3 })).toBe('3 manual steps remaining')
  expect(translateUi('constructor')).toBe('constructor')
  expect(translateUi('{constructor}')).toBe('{constructor}')
  expect(translateUi('/Users/fixture/中文项目')).toBe('/Users/fixture/中文项目')
  await c.save({ language: 'zh-CN' })
  expect(c.error.value).toMatch(/保存失败/)
  expect(c.settings.value).toEqual(saved)
  expect(element.lang).toBe('en')
  expect(document.title).toBe('CG Claude · Local environment')
  expect(JSON.parse(cache.get('cg-claude:appearance:v1')!)).toEqual(saved)
  expect(transport.mock.calls[1][1].headers.get('X-CG-Token')).toBe('local-token')
})
test('ignores invalid cached appearance and saves only a validated persisted response', async () => {
  cache.set('cg-claude:appearance:v1', JSON.stringify({ language: 'invalid', theme: 'black' }))
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(defaultAppSettings))
      .mockResolvedValueOnce(Response.json({ ...defaultAppSettings, theme: 'eye-care' })),
  )
  const c = useAppSettings(() => 'local-token')
  expect(c.settings.value).toEqual(defaultAppSettings)
  await c.load()
  await c.save({ theme: 'eye-care' })
  expect(c.error.value).toBe('')
  expect(c.feedback.value).toBe('已保存')
  expect(element.dataset.theme).toBe('eye-care')
})
test('failed startup read does not erase a settings load failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  vi.stubGlobal('window', {
    claudeGuardDesktop: { getStartup: vi.fn().mockRejectedValue(new Error('OS unavailable')) },
  })
  const c = useAppSettings(() => 'local-token')
  await Promise.all([c.load(), c.refreshStartup()])
  expect(c.loaded.value).toBe(false)
  expect(c.error.value).toMatch(/尚未读取/)
  expect(c.startupError.value).toMatch(/读取开机自启/)
})
test('reads back OS approval status and opens only the fixed desktop settings method', async () => {
  const desktop = {
    getStartup: vi.fn().mockResolvedValue({ supported: true, enabled: false }),
    setStartup: vi.fn().mockResolvedValue({ supported: true, enabled: false, reason: 'approval' }),
    openStartupSettings: vi.fn().mockResolvedValue(undefined),
  }
  vi.stubGlobal('window', { claudeGuardDesktop: desktop })
  const c = useAppSettings(() => 'local-token')
  await c.refreshStartup()
  await c.setStartup(true)
  await c.openStartupSettings()
  expect(c.startup.value.enabled).toBe(false)
  expect(c.startup.value.reason).toBe('approval')
  expect(desktop.setStartup).toHaveBeenCalledWith(true)
  expect(desktop.openStartupSettings).toHaveBeenCalledWith()
})

test('dark appearance persists and is applied again after loading the service record', async () => {
  const dark = { ...defaultAppSettings, theme: 'dark' as const }
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(defaultAppSettings))
      .mockResolvedValueOnce(Response.json(dark))
      .mockResolvedValueOnce(Response.json(dark)),
  )
  const c = useAppSettings(() => 'local-token')
  await c.load()
  await c.save({ theme: 'dark' })
  expect(element.dataset.theme).toBe('dark')
  const reopened = useAppSettings(() => 'local-token')
  expect(reopened.settings.value.theme).toBe('dark')
  await reopened.load()
  expect(element.dataset.theme).toBe('dark')
})
