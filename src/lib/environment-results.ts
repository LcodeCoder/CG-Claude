import type { Category, ScanReport } from '../../shared/types'
export type ResultFilter = 'all' | 'issues' | 'manual' | 'pass'
export interface ResultFilters {
  category: Category | 'all'
  status: ResultFilter
  query: string
  expanded: string
}
export function createResultFilters(report?: ScanReport): ResultFilters {
  return {
    category: 'all',
    status: report && report.counts.warn + report.counts.fail > 0 ? 'issues' : 'all',
    query: '',
    expanded: report?.checks.find((check) => ['warn', 'fail'].includes(check.status))?.id ?? '',
  }
}
