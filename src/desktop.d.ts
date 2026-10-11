export {}
declare global {
  interface Window {
    claudeGuardDesktop?: {
      platform: string
      electronVersion: string
      hideWindow: () => Promise<void>
      chooseProject: () => Promise<string | undefined>
    }
  }
}
