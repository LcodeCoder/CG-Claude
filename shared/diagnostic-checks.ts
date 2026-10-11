/** Stable IDs connect detection, history, navigation and reference sources. */
export const diagnosticCheckIds = [
  'timezone',
  'system-proxy',
  'tun',
  'dns',
  'ipv6',
  'runtime-proxy',
  'shell-proxy',
  'npm-proxy',
  'git-proxy',
  'runtime-endpoint',
  'shell-endpoint',
  'claude-settings',
  'claude-endpoint',
  'claude-privacy',
  'claude-cli',
  'browser-timezone',
  'public-ip',
  'route-consistency',
  'webrtc',
  'npm-effective-proxy',
  'git-effective-proxy',
  'timezone-env',
  'timezone-followup',
  'config-directory',
  'tls-verification',
  'proxy-compatibility',
  'auth-sources',
  'ca-configuration',
] as const
export type DiagnosticCheckId = (typeof diagnosticCheckIds)[number]
export const DIAGNOSTIC_CHECK_COUNT: number = diagnosticCheckIds.length

// Bump when rule interpretation changes so history can distinguish software changes.
export const DIAGNOSTIC_RULESET = '2026-10-11.11'
