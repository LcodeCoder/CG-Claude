import type { ProjectReport } from '../../../shared/types'
import type { GuardContext } from './context'

export function createProjectsActions(context: GuardContext) {
  const { busy, working, api, notify, connected, projectReport } = context
  async function scanProject(path: string): Promise<void> {
    if (busy.value || !connected.value) return
    working.value = true
    try {
      projectReport.value = await api<ProjectReport>('/projects/scan', {
        method: 'POST',
        body: JSON.stringify({ path }),
      })
      notify('项目配置扫描完成。')
    } catch (failure) {
      notify((failure as Error).message, 'error')
    } finally {
      working.value = false
    }
  }
  return { scanProject }
}
