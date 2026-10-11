import { expect, test, vi } from 'vitest'
import { createStartupController } from '../electron/startup'

function runtime(platform: NodeJS.Platform = 'darwin') {
  let value = { openAtLogin: false, status: 'not-registered', executableWillLaunchAtLogin: true }
  return {
    packaged: true,
    demo: false,
    platform,
    read: () => value,
    write: vi.fn((enabled: boolean) => {
      value = { ...value, openAtLogin: enabled, status: enabled ? 'enabled' : 'not-registered' }
    }),
    change: (next: Partial<typeof value>) => {
      value = { ...value, ...next }
    },
  }
}
test('sets and reads the actual operating system login item state', () => {
  const os = runtime()
  const startup = createStartupController(os)
  expect(startup.get()).toEqual({ supported: true, enabled: false })
  expect(startup.set(true)).toEqual({ supported: true, enabled: true })
  expect(startup.set(false)).toEqual({ supported: true, enabled: false })
  expect(() => startup.set('true')).toThrow(/布尔值/)
})
test('macOS approval and unconfirmed changes are not shown as enabled', () => {
  const os = runtime()
  os.write.mockImplementation(() => os.change({ openAtLogin: true, status: 'requires-approval' }))
  const startup = createStartupController(os)
  expect(startup.set(true)).toEqual({ supported: true, enabled: false, reason: 'approval' })
  os.write.mockImplementation(() => os.change({ openAtLogin: true, status: 'not-found' }))
  expect(startup.set(true)).toEqual({ supported: true, enabled: false, reason: 'unconfirmed' })
})
test('Windows respects a login item disabled in system settings', () => {
  const os = runtime('win32')
  os.change({ openAtLogin: true, executableWillLaunchAtLogin: false })
  expect(createStartupController(os).get()).toEqual({ supported: true, enabled: false })
})
test.each([{ packaged: false }, { demo: true }, { platform: 'linux' as const }])(
  'unsupported runtime cannot write login items (%j)',
  (patch) => {
    const os = { ...runtime(), ...patch }
    const startup = createStartupController(os)
    expect(startup.get().supported).toBe(false)
    expect(() => startup.set(true)).toThrow(/不支持/)
    expect(os.write).not.toHaveBeenCalled()
  },
)
