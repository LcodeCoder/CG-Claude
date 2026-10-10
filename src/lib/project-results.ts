import type { ProjectFinding } from '../../shared/types'

/** Two settings scopes can produce the same check title; keep navigation labels distinct. */
export function projectFindingLabel(finding: Pick<ProjectFinding, 'id' | 'title'>): string {
  if (finding.id.startsWith('.claude/settings.local.json-'))
    return `${finding.title} · 项目本地设置`
  if (finding.id.startsWith('.claude/settings.json-')) return `${finding.title} · 共享项目设置`
  return finding.title
}
