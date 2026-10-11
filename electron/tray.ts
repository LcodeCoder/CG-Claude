import { Menu, Tray, nativeImage } from 'electron'
import type { BrowserWindow } from 'electron'
import path from 'node:path'
import type { ServiceStatus } from '../shared/service-status.js'

interface TrayOptions {
  language?: () => 'zh-CN' | 'en'
  root: string
  platform: NodeJS.Platform
  status: () => ServiceStatus
  visible: () => boolean
  show: () => void
  hide: () => void
  quit: () => void
}

/** macOS uses a template mark; Windows and Linux use the same mark in Claude orange. */
export class DesktopTray {
  private tray: Tray
  private timer: ReturnType<typeof setInterval>
  private lastState = ''
  constructor(private options: TrayOptions) {
    const filename =
      options.platform === 'darwin'
        ? 'trayTemplate.png'
        : options.platform === 'win32'
          ? 'tray.ico'
          : 'tray.png'
    const image = nativeImage.createFromPath(path.join(options.root, 'build', 'tray', filename))
    if (image.isEmpty()) throw new Error('菜单栏图标未生成，请先运行 npm run icons')
    if (options.platform === 'darwin') image.setTemplateImage(true)
    this.tray = new Tray(
      image,
      ...(options.platform === 'darwin' ? ['bda4fa34-cf29-4ecf-9025-c6508a2a1092'] : []),
    )
    try {
      if (options.platform !== 'darwin') this.tray.on('click', options.show)
      this.tray.on('double-click', options.show)
      this.update()
      this.timer = setInterval(() => this.update(), 1000)
      this.timer.unref()
    } catch (error) {
      // A partial native setup must not leave an inaccessible icon beside the fallback window.
      this.tray.destroy()
      throw error
    }
  }
  update() {
    const status = this.options.status()
    const visible = this.options.visible()
    const english = this.options.language?.() === 'en'
    const text = (zh: string, en: string) => (english ? en : zh)
    const label = status.closing
      ? text('正在安全退出…', 'Finishing before exit…')
      : english
        ? status.activity
          ? { scan: 'Scanning', setup: 'Configuring', mutation: 'Updating configuration' }[
              status.activity.kind
            ]
          : 'Ready'
        : status.activity?.label || '待命'
    const state = JSON.stringify([label, visible, status.closing])
    if (state === this.lastState || this.tray.isDestroyed()) return
    this.lastState = state
    this.tray.setToolTip(`CG Claude · ${label}`)
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'CG Claude', enabled: false },
        { label, enabled: false },
        { type: 'separator' },
        {
          label: text('打开窗口', 'Open window'),
          enabled: !status.closing,
          click: this.options.show,
        },
        {
          label:
            this.options.platform === 'darwin'
              ? text('隐藏到菜单栏', 'Hide to menu bar')
              : text('隐藏到托盘', 'Hide to tray'),
          enabled: visible && !status.closing,
          click: this.options.hide,
        },
        { type: 'separator' },
        {
          label: text('退出 CG Claude', 'Quit CG Claude'),
          enabled: !status.closing,
          click: this.options.quit,
        },
      ]),
    )
  }
  destroy() {
    clearInterval(this.timer)
    if (!this.tray.isDestroyed()) this.tray.destroy()
  }
}

/** Keep the renderer alive so hidden windows can return fresh browser samples to a running job. */
export function keepWindowInTray(
  window: BrowserWindow,
  available: () => boolean,
  exiting: () => boolean,
) {
  window.on('minimize', () => {
    if (available() && !exiting()) window.hide()
  })
  window.on('close', (event) => {
    if (available() && !exiting()) {
      event.preventDefault()
      window.hide()
    }
  })
}
