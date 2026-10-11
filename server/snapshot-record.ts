import type { Preferences, SnapshotSummary } from '../shared/types.js'
import type { TimezoneState } from './timezone-settings.js'

export interface SnapshotEntry {
  relative: string
  original: string | null
  mode: number
  hash: string
}
export interface SnapshotRecord extends SnapshotSummary {
  entries: SnapshotEntry[]
  integrityHash?: string
  preferences: Preferences
  timezoneState?: { state: TimezoneState; hash: string }
}
