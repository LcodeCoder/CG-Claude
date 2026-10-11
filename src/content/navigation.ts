import {
  ArchiveRestore,
  FileCode2,
  FolderCog,
  Settings2,
  BookOpen,
  LibraryBig,
  History,
  Languages,
  ListChecks,
  ScanLine,
} from '@lucide/vue'

/** Page copy lives beside navigation so new views have one clear registration point. */
export const workspacePages = {
  overview: { title: '环境检测', description: '本机状态与待处理项。' },
  configs: { title: '本机配置', description: '查看配置文件与连接设置。' },
  translation: { title: '双向翻译', description: '配置翻译模型，测试中文与英文互译。' },
  projects: {
    title: '项目扫描',
    description: '检查项目配置、权限与 Git 状态。',
  },
  history: { title: '检测记录', description: '保留最近 30 次检测，对照环境的变化。' },
  backups: { title: '备份恢复', description: '保存配置快照，或恢复修复前的备份。' },
  checklist: { title: '人工复核', description: '复核网络出口与账号设置。' },
  'app-settings': { title: '应用设置', description: '语言、外观与启动方式。' },
  settings: { title: '检测偏好', description: '选择网络模式、时区目标与隐私设置。' },
  about: { title: '使用说明与来源', description: '检测范围、修复流程与常见问题。' },
  references: { title: '参考文献', description: '原文与扩展来源。' },
}
export type WorkspacePage = keyof typeof workspacePages
export const primaryNavigation = [
  { id: 'overview', label: '环境检测', icon: ScanLine },
  { id: 'translation', label: '双向翻译', icon: Languages },
  { id: 'projects', label: '项目扫描', icon: FileCode2 },
  { id: 'history', label: '检测记录', icon: History },
  { id: 'backups', label: '备份恢复', icon: ArchiveRestore },
  { id: 'checklist', label: '人工复核', icon: ListChecks },
] satisfies { id: WorkspacePage; label: string; icon: unknown }[]

export const secondaryNavigation = [
  { id: 'settings', label: '检测偏好', icon: Settings2 },
  { id: 'about', label: '使用说明', icon: BookOpen },
  { id: 'references', label: '参考文献', icon: LibraryBig },
  { id: 'app-settings', label: '应用设置', icon: Settings2 },
  { id: 'configs', label: '本机配置', icon: FolderCog },
] satisfies { id: WorkspacePage; label: string; icon: unknown }[]
