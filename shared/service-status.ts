import type { ScanReport } from './types.js'

export interface ScanJob {
  id: string
  status: 'running' | 'complete' | 'failed'
  completed: number
  total: number
  current: string
  report?: ScanReport
  error?: string
}
export interface ServiceStatus {
  closing: boolean
  activity?: {
    kind: 'scan' | 'setup' | 'mutation'
    label: string
    id?: string
  }
  scan?: ScanJob
}
