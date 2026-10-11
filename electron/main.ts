import { app, BrowserWindow, dialog, Menu, shell, ipcMain, nativeImage } from 'electron'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { createAppServer } from '../server/index.js'
import { references } from '../shared/references.js'
import { DesktopTray, keepWindowInTray } from './tray.js'

let window: BrowserWindow | undefined
let service: Awaited<ReturnType<typeof createAppServer>> | undefined
let origin = ''
let exiting = false
let tray: DesktopTray | undefined
let openingWindow: Promise<void> | undefined
const externalHosts = new Set([
  ...references.map((entry) => new URL(entry.url).hostname),
  'x.com',
  'code.claude.com',
  'www.anthropic.com',
  'privacy.anthropic.com',
  'support.claude.com',
  'browserleaks.com',
  'www.electronjs.org',
  'claude.ai',
  'ipinfo.io',
  'nodejs.org',
])
function externalUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' && !url.username && !url.password && externalHosts.has(url.hostname)
    )
  } catch {
    return false
  }
}
function openReference(url: string) {
  if (externalUrl(url)) void shell.openExternal(url).catch(() => {})
}
async function createWindow() {
  window = new BrowserWindow({
    width: 1360,
    height: 940,
    minWidth: 900,
    minHeight: 650,
    show: false,
    title: 'CG Claude · 本机环境配置',
    backgroundColor: '#f8f6f2',
    icon: path.join(app.getAppPath(), 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(app.getAppPath(), 'electron', 'preload.cjs'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      backgroundThrottling: false,
      partition: 'persist:claude-guard',
    },
  })
  window.webContents.session.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(permission === 'clipboard-sanitized-write'),
  )
  window.webContents.session.setPermissionCheckHandler(
    (_contents, permission) => permission === 'clipboard-sanitized-write',
  )
  window.webContents.setWindowOpenHandler(({ url }) => {
    openReference(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) {
      event.preventDefault()
      openReference(url)
    }
  })
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  // Keep export downloads in the user's chosen folder.
  window.webContents.session.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({
      title: '保存检测报告',
      defaultPath: path.join(app.getPath('downloads'), item.getFilename()),
    })
  })
  keepWindowInTray(
    window,
    () => Boolean(tray),
    () => exiting,
  )
  window.on('show', () => tray?.update())
  window.on('hide', () => tray?.update())
  window.on('closed', () => {
    window = undefined
  })
  window.once('ready-to-show', () => window?.show())
  await window.loadURL(origin)
}
function hideWindow() {
  if (tray) window?.hide()
  else window?.minimize()
  tray?.update()
}
async function showWindow() {
  if (exiting) return
  if (!window || window.isDestroyed()) {
    if (!openingWindow)
      openingWindow = createWindow().finally(() => {
        openingWindow = undefined
      })
    await openingWindow
  }
  if (window?.isMinimized()) window.restore()
  window?.show()
  window?.focus()
  tray?.update()
}
function trustedSender(event: Electron.IpcMainInvokeEvent) {
  if (!window || event.sender !== window.webContents || !event.senderFrame) return false
  try {
    const url = new URL(event.senderFrame.url)
    return url.origin === origin && url.pathname === '/'
  } catch {
    return false
  }
}
app.setName('CG Claude')
if (process.env.CG_DEMO === '1' && process.env.CG_DATA_DIR) {
  const profile = path.resolve(process.env.CG_DATA_DIR, 'desktop-profile')
  mkdirSync(profile, { recursive: true, mode: 0o700 })
  app.setPath('userData', profile)
}
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (service) void showWindow()
  })
  app.on('activate', () => {
    if (service) void showWindow()
  })
  app.on('window-all-closed', () => {
    if (!tray && process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', (event) => {
    if (exiting || !service) return
    event.preventDefault()
    exiting = true
    // Finish a pending atomic repair and its backups before releasing the service lock.
    tray?.update()
    void service
      .close()
      .catch(() => {
        console.error('退出时本机服务未能完整关闭，请检查记录目录权限。')
      })
      .finally(() => {
        tray?.destroy()
        tray = undefined
        app.quit()
      })
  })
  app
    .whenReady()
    .then(async () => {
      if (process.platform === 'darwin')
        app.dock?.setIcon(
          nativeImage.createFromPath(path.join(app.getAppPath(), 'build', 'icon.png')),
        )
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          ...(process.platform === 'darwin'
            ? [
                {
                  label: 'CG Claude',
                  submenu: [
                    { role: 'about' as const },
                    { type: 'separator' as const },
                    { role: 'hide' as const },
                    { role: 'quit' as const },
                  ],
                },
              ]
            : []),
          {
            label: '编辑',
            submenu: [
              { role: 'undo' },
              { role: 'redo' },
              { type: 'separator' },
              { role: 'cut' },
              { role: 'copy' },
              { role: 'paste' },
              { role: 'selectAll' },
            ],
          },
          {
            label: '视图',
            submenu: [
              { role: 'reload' },
              { role: 'resetZoom' },
              { role: 'zoomIn' },
              { role: 'zoomOut' },
              { role: 'togglefullscreen' },
            ],
          },
          {
            label: '窗口',
            submenu: [
              {
                label: process.platform === 'darwin' ? '隐藏到菜单栏' : '隐藏到托盘',
                accelerator: 'CmdOrCtrl+M',
                click: hideWindow,
              },
              {
                label: '打开主窗口',
                click: () => {
                  void showWindow()
                },
              },
              { role: 'close' },
            ],
          },
        ]),
      )
      ipcMain.handle('cg:choose-project', async (event) => {
        if (!trustedSender(event)) throw new Error('只允许本机桌面界面选择项目')
        const result = await dialog.showOpenDialog(window!, {
          title: '选择要扫描的本地项目',
          properties: ['openDirectory'],
        })
        return result.canceled ? undefined : result.filePaths[0]
      })
      ipcMain.handle('cg:hide-window', (event) => {
        if (!trustedSender(event)) throw new Error('只允许本机桌面界面操作窗口')
        hideWindow()
      })
      service = await createAppServer({
        port: 0,
        dev: false,
        runtime: 'electron',
        distDir: path.join(app.getAppPath(), 'dist'),
      })
      origin = `http://127.0.0.1:${await service.listen()}`
      console.log(`CG Claude Electron：${origin}`)
      try {
        tray = new DesktopTray({
          root: app.getAppPath(),
          platform: process.platform,
          status: () => service!.status(),
          visible: () => Boolean(window?.isVisible()),
          show: () => {
            void showWindow()
          },
          hide: hideWindow,
          quit: () => app.quit(),
        })
      } catch {
        console.log('系统托盘不可用，窗口仍可通过任务栏恢复。')
      }
      await showWindow()
    })
    .catch(async (error) => {
      dialog.showErrorBox(
        'CG Claude 启动失败',
        error instanceof Error ? error.message : '本机服务未能启动',
      )
      tray?.destroy()
      tray = undefined
      await service?.close().catch(() => {})
      app.quit()
    })
}
