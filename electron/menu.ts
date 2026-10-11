import type { MenuItemConstructorOptions } from 'electron'
import type { AppSettings } from '../shared/app-settings.js'

interface MenuActions {
  hide: () => void
  show: () => void
}
/** Native menus use the same saved language as the renderer without importing Vue. */
export function desktopMenu(
  platform: NodeJS.Platform,
  language: AppSettings['language'],
  actions: MenuActions,
): MenuItemConstructorOptions[] {
  const text = (zh: string, en: string) => (language === 'en' ? en : zh)
  const role = (
    value: NonNullable<MenuItemConstructorOptions['role']>,
    zh: string,
    en: string,
  ): MenuItemConstructorOptions => ({ role: value, label: text(zh, en) })
  return [
    ...(platform === 'darwin'
      ? [
          {
            label: 'CG Claude',
            submenu: [
              role('about', '关于 CG Claude', 'About CG Claude'),
              { type: 'separator' as const },
              role('hide', '隐藏 CG Claude', 'Hide CG Claude'),
              role('quit', '退出 CG Claude', 'Quit CG Claude'),
            ],
          },
        ]
      : []),
    {
      label: text('编辑', 'Edit'),
      submenu: [
        role('undo', '撤销', 'Undo'),
        role('redo', '重做', 'Redo'),
        { type: 'separator' },
        role('cut', '剪切', 'Cut'),
        role('copy', '复制', 'Copy'),
        role('paste', '粘贴', 'Paste'),
        role('selectAll', '全选', 'Select all'),
      ],
    },
    {
      label: text('视图', 'View'),
      submenu: [
        role('reload', '重新加载', 'Reload'),
        role('resetZoom', '实际大小', 'Actual size'),
        role('zoomIn', '放大', 'Zoom in'),
        role('zoomOut', '缩小', 'Zoom out'),
        role('togglefullscreen', '全屏', 'Full screen'),
      ],
    },
    {
      label: text('窗口', 'Window'),
      submenu: [
        {
          label:
            platform === 'darwin'
              ? text('隐藏到菜单栏', 'Hide to menu bar')
              : text('隐藏到托盘', 'Hide to tray'),
          accelerator: 'CmdOrCtrl+M',
          click: actions.hide,
        },
        { label: text('打开主窗口', 'Open main window'), click: actions.show },
        role('close', '关闭窗口', 'Close window'),
        ...(platform === 'darwin'
          ? []
          : [{ type: 'separator' as const }, role('quit', '退出 CG Claude', 'Quit CG Claude')]),
      ],
    },
  ]
}
