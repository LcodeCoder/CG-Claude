import { app, BrowserWindow, dialog, Menu, shell, ipcMain } from 'electron'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { createAppServer } from '../server/index.js'
import { references } from '../shared/references.js'

let window: BrowserWindow | undefined
let service: Awaited<ReturnType<typeof createAppServer>> | undefined
let origin = ''
let exiting = false
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
    webPreferences: {
      preload: path.join(app.getAppPath(), 'electron', 'preload.cjs'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
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
  window.on('closed', () => {
    window = undefined
  })
  window.once('ready-to-show', () => window?.show())
  await window.loadURL(origin)
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
    if (window) {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
  })
  app.on('activate', () => {
    if (!window && service) void createWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', (event) => {
    if (exiting || !service) return
    event.preventDefault()
    exiting = true
    // Finish a pending atomic repair and its backups before releasing the service lock.
    void service.close().finally(() => app.quit())
  })
  app
    .whenReady()
    .then(async () => {
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
          { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'close' }] },
        ]),
      )
      ipcMain.handle('cg:choose-project', async (event) => {
        if (
          !window ||
          event.sender !== window.webContents ||
          event.senderFrame?.url !== origin + '/'
        )
          throw new Error('只允许本机桌面界面选择项目')
        const result = await dialog.showOpenDialog(window, {
          title: '选择要扫描的本地项目',
          properties: ['openDirectory'],
        })
        return result.canceled ? undefined : result.filePaths[0]
      })
      service = await createAppServer({
        port: 0,
        dev: false,
        runtime: 'electron',
        distDir: path.join(app.getAppPath(), 'dist'),
      })
      origin = `http://127.0.0.1:${await service.listen()}`
      console.log(`CG Claude Electron：${origin}`)
      await createWindow()
    })
    .catch(async (error) => {
      dialog.showErrorBox(
        'CG Claude 启动失败',
        error instanceof Error ? error.message : '本机服务未能启动',
      )
      await service?.close().catch(() => {})
      app.quit()
    })
}
