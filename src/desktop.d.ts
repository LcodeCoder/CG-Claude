export {}
declare global {
  interface Window {
    claudeGuardDesktop?: {
      platform: string
      electronVersion: string
      chooseProject: () => Promise<string | undefined>
    }
  }
}
