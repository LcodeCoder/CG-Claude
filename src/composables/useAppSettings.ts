import { onMounted, ref } from 'vue'
import { appSettingsSchema, defaultAppSettings } from '../../shared/app-settings'
import type { AppSettings, StartupStatus, VersionCheck } from '../../shared/app-settings'
import { createLocalApi } from '../lib/local-api'
import { translateUi, uiLanguage } from '../i18n'

const cacheKey = 'cg-claude:appearance:v1'
export function useAppSettings(token: () => string) {
  const settings = ref<AppSettings>({ ...defaultAppSettings })
  const saving = ref(false)
  const loaded = ref(false)
  const error = ref('')
  const feedback = ref('')
  const startup = ref<StartupStatus>({ supported: false, enabled: false, reason: 'browser' })
  const startupBusy = ref(false)
  const startupError = ref('')
  const checking = ref(false)
  const version = ref<VersionCheck>()
  const versionError = ref('')
  const api = createLocalApi({ token, connection: () => {} })
  function apply(value: AppSettings) {
    void window.claudeGuardDesktop?.syncAppearance?.(value).catch(() => {})
    settings.value = value
    uiLanguage.value = value.language
    document.title = translateUi('CG Claude · 本地环境工作台')
    document.documentElement.lang = value.language
    document.documentElement.dataset.theme = value.theme
    document.documentElement.dataset.reduceMotion = String(value.reduceMotion)
    try {
      localStorage.setItem(cacheKey, JSON.stringify(value))
    } catch {
      /* A disabled cache does not block saved settings. */
    }
  }
  try {
    const cached = appSettingsSchema.safeParse(JSON.parse(localStorage.getItem(cacheKey) || '{}'))
    if (cached.success) apply(cached.data)
  } catch {
    /* A corrupt browser cache is replaced after the local service is read. */
  }
  async function load() {
    error.value = ''
    try {
      apply(appSettingsSchema.parse(await api('/app-settings')))
      loaded.value = true
    } catch {
      error.value = '设置尚未读取，请重试。'
    }
  }
  async function save(patch: Partial<AppSettings>) {
    if (saving.value || !loaded.value) return
    saving.value = true
    feedback.value = ''
    error.value = ''
    try {
      const value = appSettingsSchema.parse({ ...settings.value, ...patch })
      apply(
        appSettingsSchema.parse(
          await api('/app-settings', { method: 'PUT', body: JSON.stringify(value) }),
        ),
      )
      feedback.value = '已保存'
    } catch {
      error.value = '保存失败，请重试。'
    } finally {
      saving.value = false
    }
  }
  async function refreshStartup() {
    if (!window.claudeGuardDesktop || startupBusy.value) return
    startupBusy.value = true
    startupError.value = ''
    try {
      startup.value = await window.claudeGuardDesktop.getStartup()
    } catch {
      startupError.value = '读取开机自启状态失败，请重试。'
    } finally {
      startupBusy.value = false
    }
  }
  async function setStartup(enabled: boolean) {
    if (!window.claudeGuardDesktop || startupBusy.value || !startup.value.supported) return
    startupBusy.value = true
    startupError.value = ''
    feedback.value = ''
    try {
      startup.value = await window.claudeGuardDesktop.setStartup(enabled)
    } catch {
      startupError.value = '开机自启设置未能完成，请重试。'
    } finally {
      startupBusy.value = false
    }
  }
  async function openStartupSettings() {
    if (!window.claudeGuardDesktop) return
    startupError.value = ''
    try {
      await window.claudeGuardDesktop.openStartupSettings()
    } catch {
      startupError.value = '无法打开系统设置，请手动查看登录项。'
    }
  }
  async function checkVersion() {
    if (checking.value) return
    checking.value = true
    versionError.value = ''
    try {
      version.value = await api('/version-check', { method: 'POST', body: '{}' })
    } catch (failure) {
      versionError.value =
        failure instanceof Error ? failure.message : '版本检查失败，请检查网络后重试'
    } finally {
      checking.value = false
    }
  }
  onMounted(() => {
    void load()
    void refreshStartup()
  })
  return {
    settings,
    saving,
    loaded,
    error,
    feedback,
    startup,
    startupBusy,
    startupError,
    openStartupSettings,
    checking,
    version,
    versionError,
    save,
    load,
    refreshStartup,
    setStartup,
    checkVersion,
  }
}
export type AppSettingsController = ReturnType<typeof useAppSettings>
