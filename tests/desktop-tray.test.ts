import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { ServiceStatus } from '../shared/service-status'

const native = vi.hoisted(() => ({
  image: { isEmpty: vi.fn(() => false), setTemplateImage: vi.fn() },
  load: vi.fn(),
  menu: vi.fn(),
  trays: [] as any[],
}))
vi.mock('electron', () => ({
  nativeImage: {
    createFromPath: (...args: unknown[]) => {
      native.load(...args)
      return native.image
    },
  },
  Menu: {
    buildFromTemplate: (items: unknown[]) => {
      native.menu(items)
      return items
    },
  },
  Tray: class extends EventEmitter {
    destroyed = false
    tooltip = ''
    menu: any[] = []
    constructor(...args: unknown[]) {
      super()
      native.trays.push(this)
      ;(this as any).arguments = args
    }
    setToolTip(value: string) {
      this.tooltip = value
    }
    setContextMenu(value: any[]) {
      this.menu = value
    }
    isDestroyed() {
      return this.destroyed
    }
    destroy() {
      this.destroyed = true
    }
  },
}))
import { DesktopTray, keepWindowInTray } from '../electron/tray'
let tray: DesktopTray | undefined
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  native.trays.length = 0
  native.image.isEmpty.mockReturnValue(false)
})
afterEach(() => {
  tray?.destroy()
  tray = undefined
  vi.useRealTimers()
})

test.each(['darwin', 'win32', 'linux'] as const)(
  'uses the correct %s icon and provides window and quit controls',
  (platform) => {
    const show = vi.fn(),
      hide = vi.fn(),
      quit = vi.fn()
    tray = new DesktopTray({
      root: '/fixture',
      platform,
      status: () => ({ closing: false }),
      visible: () => true,
      show,
      hide,
      quit,
    })
    const value = native.trays[0]!
    expect(native.load).toHaveBeenCalledWith(
      expect.stringContaining(
        platform === 'darwin' ? 'trayTemplate.png' : platform === 'win32' ? 'tray.ico' : 'tray.png',
      ),
    )
    expect(native.image.setTemplateImage).toHaveBeenCalledTimes(platform === 'darwin' ? 1 : 0)
    value.menu.find((item: any) => item.label === '打开窗口').click()
    value.menu.find((item: any) => item.label?.startsWith('隐藏到')).click()
    value.menu.find((item: any) => item.label === '退出 CG Claude').click()
    expect(show).toHaveBeenCalledOnce()
    expect(hide).toHaveBeenCalledOnce()
    expect(quit).toHaveBeenCalledOnce()
  },
)

test('shows background progress and a safe-exit state, and releases its timer and native icon', async () => {
  let status: ServiceStatus = { closing: false, activity: { kind: 'scan', label: '正在检查时区' } }
  tray = new DesktopTray({
    root: '/fixture',
    platform: 'darwin',
    status: () => status,
    visible: () => false,
    show: vi.fn(),
    hide: vi.fn(),
    quit: vi.fn(),
  })
  const value = native.trays[0]!
  expect(value.tooltip).toContain('正在检查时区')
  expect(value.menu.find((item: any) => item.label?.startsWith('隐藏到')).enabled).toBe(false)
  status = { closing: true }
  await vi.advanceTimersByTimeAsync(1000)
  expect(value.tooltip).toContain('安全退出')
  expect(value.menu.find((item: any) => item.label === '退出 CG Claude').enabled).toBe(false)
  tray.destroy()
  expect(value.destroyed).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

test('minimize and close hide a recoverable window, while explicit quit and unavailable trays keep normal behavior', () => {
  const window = Object.assign(new EventEmitter(), { hide: vi.fn() })
  let available = true,
    exiting = false
  keepWindowInTray(
    window as unknown as BrowserWindow,
    () => available,
    () => exiting,
  )
  window.emit('minimize')
  const close = { preventDefault: vi.fn() }
  window.emit('close', close)
  expect(window.hide).toHaveBeenCalledTimes(2)
  expect(close.preventDefault).toHaveBeenCalledOnce()
  exiting = true
  window.emit('close', close)
  expect(close.preventDefault).toHaveBeenCalledOnce()
  exiting = false
  available = false
  window.emit('minimize')
  window.emit('close', close)
  expect(window.hide).toHaveBeenCalledTimes(2)
})

test('fails before installing an invisible tray so the main process can retain the taskbar fallback', () => {
  native.image.isEmpty.mockReturnValue(true)
  expect(
    () =>
      new DesktopTray({
        root: '/fixture',
        platform: 'darwin',
        status: () => ({ closing: false }),
        visible: () => true,
        show: vi.fn(),
        hide: vi.fn(),
        quit: vi.fn(),
      }),
  ).toThrow('图标未生成')
  expect(native.trays).toHaveLength(0)
})

test('cleans up a partially created native icon when its menu cannot be installed', () => {
  native.menu.mockImplementationOnce(() => {
    throw new Error('native menu unavailable')
  })
  expect(
    () =>
      new DesktopTray({
        root: '/fixture',
        platform: 'darwin',
        status: () => ({ closing: false }),
        visible: () => true,
        show: vi.fn(),
        hide: vi.fn(),
        quit: vi.fn(),
      }),
  ).toThrow('native menu unavailable')
  expect(native.trays[0]!.destroyed).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
