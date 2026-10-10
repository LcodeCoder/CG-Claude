import { ArchiveRestore, FileCode2, FolderCog, History, ListChecks, ScanLine } from '@lucide/vue'

/** Page copy lives beside navigation so new views have one clear registration point. */
export const workspacePages = {
  overview: { title: '环境检测', description: '检查本机配置，让每一次修改都有据可查。' },
  configs: { title: '本机配置', description: '从真实配置文件开始，预览需要修改的部分。' },
  projects: {
    title: '项目扫描',
    description: '扫描本地项目配置、权限、代理覆盖与 Git 提交，不执行项目脚本。',
  },
  history: { title: '检测记录', description: '保留最近 30 次检测，对照环境的变化。' },
  backups: { title: '备份恢复', description: '每次修复前保存原始配置，随时回到修改之前。' },
  checklist: { title: '人工复核', description: '把工具无法可靠自动判断的项目，逐项确认。' },
  settings: { title: '检测偏好', description: '按照你的实际网络与使用方式检查，减少误报。' },
  about: { title: '使用说明与来源', description: '了解检测范围、修复方式与参考来源。' },
  references: { title: '参考文献', description: '查看建议的出处、采用方式与判断边界。' },
}
export type WorkspacePage = keyof typeof workspacePages
export const primaryNavigation = [
  { id: 'overview', label: '环境检测', icon: ScanLine },
  { id: 'configs', label: '本机配置', icon: FolderCog },
  { id: 'projects', label: '项目扫描', icon: FileCode2 },
  { id: 'history', label: '检测记录', icon: History },
  { id: 'backups', label: '备份恢复', icon: ArchiveRestore },
  { id: 'checklist', label: '人工复核', icon: ListChecks },
] satisfies { id: WorkspacePage; label: string; icon: unknown }[]
