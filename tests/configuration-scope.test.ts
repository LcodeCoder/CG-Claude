import { expect, test } from 'vitest'
import { createContext } from '../server/context'
import { claudeConfigurationScopeReason } from '../server/configuration-scope'

test('Windows directory comparison respects platform separators and case', () => {
  const ctx = createContext({
    home: 'C:\\Users\\Reader',
    platform: 'win32',
    env: { CLAUDE_CONFIG_DIR: 'c:\\users\\reader\\.claude\\' },
  })
  expect(claudeConfigurationScopeReason(ctx)).toBeUndefined()
  ctx.env.CLAUDE_CONFIG_DIR = 'C:\\Users\\Other\\.claude'
  expect(claudeConfigurationScopeReason(ctx)).toContain('CLAUDE_CONFIG_DIR')
})

test('scope comparison never expands shell shorthand or unresolved relative expressions', () => {
  const ctx = createContext({ home: '/home/reader', platform: 'linux', env: {} })
  for (const value of ['~/.claude', '$HOME/.claude', '.claude', '/home/reader/.claude-alt']) {
    ctx.env.CLAUDE_CONFIG_DIR = value
    expect(claudeConfigurationScopeReason(ctx)).toContain('CLAUDE_CONFIG_DIR')
  }
  for (const value of ['', '/home/reader/.claude', '/home/reader/.claude/../.claude/']) {
    ctx.env.CLAUDE_CONFIG_DIR = value
    expect(claudeConfigurationScopeReason(ctx)).toBeUndefined()
  }
})

test('Windows home syntax stays equivalent when system command tests simulate macOS', () => {
  const ctx = createContext({
    home: 'C:\\Users\\Runner\\home',
    platform: 'darwin',
    env: { CLAUDE_CONFIG_DIR: 'C:\\Users\\Runner\\home\\.claude\\unused\\..\\' },
  })
  expect(claudeConfigurationScopeReason(ctx)).toBeUndefined()
  ctx.env.CLAUDE_CONFIG_DIR = 'C:\\Users\\Runner\\home/.claude/./'
  expect(claudeConfigurationScopeReason(ctx)).toBeUndefined()
  ctx.env.CLAUDE_CONFIG_DIR = 'C:\\Users\\Runner\\outside'
  expect(claudeConfigurationScopeReason(ctx)).toContain('CLAUDE_CONFIG_DIR')
})
