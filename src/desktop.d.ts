import type { StartupStatus, AppSettings } from '../shared/app-settings'
export {}
declare global {
  interface Window {
    claudeGuardDesktop?: {
      syncAppearance: (settings: AppSettings) => Promise<void>
      platform: string
      electronVersion: string
      openStartupSettings: () => Promise<void>
      getStartup: () => Promise<StartupStatus>
      setStartup: (enabled: boolean) => Promise<StartupStatus>
      hideWindow: () => Promise<void>
      chooseProject: () => Promise<string | undefined>
    }
  }
}
