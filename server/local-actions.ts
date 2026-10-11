import type { Context } from './context.js'
import { localActionRequestSchema, localActionSupported } from '../shared/local-actions.js'
import type { LocalActionResult } from '../shared/local-actions.js'

const macSettings = {
  'date-time': 'x-apple.systempreferences:com.apple.preference.datetime',
  'location-services':
    'x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices',
  'network-settings': 'x-apple.systempreferences:com.apple.preference.network',
} as const
const windowsSettings = {
  'date-time': 'ms-settings:dateandtime',
  'location-services': 'ms-settings:privacy-location',
  'network-settings': 'ms-settings:network-proxy',
} as const

/** Open a known page or an empty terminal. Never paste or run the displayed diagnostic command. */
export async function openLocalAction(ctx: Context, input: unknown): Promise<LocalActionResult> {
  const { action } = localActionRequestSchema.parse(input)
  if (!localActionSupported(ctx.platform, action)) throw new Error('此系统请按页面步骤手动打开设置')
  if (ctx.demo)
    return { opened: false, message: '演示模式不会打开本机应用；正式运行时可直接跳转。' }
  let result
  if (ctx.platform === 'darwin') {
    result = await ctx.run(
      '/usr/bin/open',
      action === 'terminal' ? ['-b', 'com.apple.Terminal'] : [macSettings[action]],
    )
  } else if (ctx.platform === 'win32') {
    const script =
      action === 'terminal'
        ? 'Start-Process -FilePath "$PSHOME\\powershell.exe"'
        : `Start-Process '${windowsSettings[action]}'`
    result = await ctx.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(`$ErrorActionPreference='Stop'; ${script}`, 'utf16le').toString('base64'),
    ])
  } else {
    // Debian/Ubuntu desktop integration; failure has an explicit manual fallback.
    result = await ctx.run('/usr/bin/xdg-terminal-exec', [])
  }
  if (!result.ok)
    throw new Error(
      action === 'terminal'
        ? '终端未能打开，请从系统应用中打开一个新窗口'
        : '设置页未能打开，请按下方完整路径进入；系统版本可能不支持该跳转',
    )
  return {
    opened: true,
    message:
      action === 'terminal'
        ? '已打开终端。请新建窗口，粘贴并核对命令后执行。'
        : '已请求打开设置页。若停在上级页面，请按步骤继续；打开页面不代表设置已完成。',
  }
}
