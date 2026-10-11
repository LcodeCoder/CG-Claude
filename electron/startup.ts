import type { StartupStatus } from '../shared/app-settings.js'

interface StartupRuntime {
  packaged: boolean
  demo: boolean
  platform: NodeJS.Platform
  read: () => { openAtLogin: boolean; status?: string; executableWillLaunchAtLogin?: boolean }
  write: (enabled: boolean) => void
}
/** Read the OS result; a successful API call alone is not evidence of an enabled login item. */
export function createStartupController(runtime: StartupRuntime) {
  function get(): StartupStatus {
    if (!runtime.packaged || runtime.demo)
      return { supported: false, enabled: false, reason: 'development' }
    if (!['darwin', 'win32'].includes(runtime.platform))
      return { supported: false, enabled: false, reason: 'platform' }
    const value = runtime.read()
    if (runtime.platform === 'darwin' && value.status === 'requires-approval')
      return { supported: true, enabled: false, reason: 'approval' }
    return {
      supported: true,
      enabled:
        runtime.platform === 'win32'
          ? value.openAtLogin && value.executableWillLaunchAtLogin !== false
          : value.status
            ? value.status === 'enabled'
            : value.openAtLogin,
    }
  }
  function set(value: unknown): StartupStatus {
    if (typeof value !== 'boolean') throw new Error('开机自启参数必须是布尔值')
    if (!get().supported) throw new Error('当前运行方式不支持开机自启')
    runtime.write(value)
    const result = get()
    return result.enabled === value || result.reason === 'approval'
      ? result
      : { ...result, reason: 'unconfirmed' }
  }
  return { get, set }
}
