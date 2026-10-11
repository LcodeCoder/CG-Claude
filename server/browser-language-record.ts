import type { BrowserLanguageBackup } from '../shared/browser-configuration.js'
import { hash } from './safety.js'

export function sealBrowserBackup(
  record: Omit<BrowserLanguageBackup, 'integrity'> | BrowserLanguageBackup,
) {
  const { integrity: _ignored, ...data } = record as BrowserLanguageBackup
  return hash(JSON.stringify(data, Object.keys(data).sort()))
}
