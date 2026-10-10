/** Claude Code's documented boolean convention; presence-only switches are separate. */
export function isEnabledEnvironmentFlag(value: unknown): boolean {
  return typeof value === 'string' && /^(?:1|true|yes|on)$/i.test(value)
}
export function isNonEmptyEnvironmentValue(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0
}
