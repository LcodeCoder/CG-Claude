import { z } from 'zod'

/** Renderer sends identifiers only; neither URLs nor shell commands cross this boundary. */
export const localActionIds = [
  'date-time',
  'location-services',
  'network-settings',
  'terminal',
] as const
export type LocalActionId = (typeof localActionIds)[number]
export const localActionRequestSchema = z.object({ action: z.enum(localActionIds) }).strict()
export interface LocalActionResult {
  opened: boolean
  message: string
}
export function localActionSupported(platform: string, action: LocalActionId): boolean {
  return ['darwin', 'win32'].includes(platform) || (platform === 'linux' && action === 'terminal')
}
