/** Git documents true/yes/on/1 and false/no/off/0/empty booleans. */
export function gitBoolean(value: string): boolean | undefined {
  const match = value.trim().match(/^(?:"([^"\\]*)"|([^#;"\\]*))\s*(?:[#;].*)?$/)
  if (!match) return undefined
  const literal = (match[1] ?? match[2] ?? '').trim().toLowerCase()
  if (['', 'false', 'no', 'off', '0'].includes(literal)) return false
  if (['true', 'yes', 'on', '1'].includes(literal)) return true
  return undefined
}
