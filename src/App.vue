<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import {
  ShieldCheck,
  ScanLine,
  FolderCog,
  History,
  ArchiveRestore,
  ListChecks,
  Settings2,
  ArrowUpRight,
  Activity,
  Laptop,
  Play,
  Download,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  TriangleAlert,
  Wrench,
  LockKeyhole,
  RefreshCw,
  FileCode2,
  Search,
  Check,
  X,
  BookOpen,
  Info,
  LoaderCircle,
  RotateCcw,
  SlidersHorizontal,
  ArrowLeft,
  WifiOff,
  WandSparkles,
  Workflow,
  LibraryBig,
} from '@lucide/vue'
import { categoryLabels, defaultPreferences, fixLabels } from '../shared/types'
import type { Category, FixId, Preferences, BackupSummary, ScanReport } from '../shared/types'
import { useGuard } from './composables/useGuard'
import packageMetadata from '../package.json'
import GuardDialog from './components/GuardDialog.vue'
import BrandMark from './components/BrandMark.vue'
import CheckRow from './components/CheckRow.vue'
import NetworkPath from './components/NetworkPath.vue'
import SetupWizard from './components/SetupWizard.vue'
import type { ReferenceTarget } from '../shared/references'
import ReferencesView from './views/ReferencesView.vue'
import ManualReviewView from './views/ManualReviewView.vue'
import HistoryView from './views/HistoryView.vue'
import ConfigurationsView from './views/ConfigurationsView.vue'
import ProjectsView from './views/ProjectsView.vue'
import BackupsView from './views/BackupsView.vue'
import SettingsView from './views/SettingsView.vue'
import AboutView from './views/AboutView.vue'
import { formatDate } from './lib/format'

type Page =
  | 'overview'
  | 'configs'
  | 'history'
  | 'backups'
  | 'checklist'
  | 'projects'
  | 'settings'
  | 'about'
  | 'references'
const guard = useGuard()
const {
  boot,
  report,
  plan,
  loading,
  scanning,
  working,
  connected,
  error,
  progress,
  toast,
  selected,
  availableFixes,
  canRepair,
  reportConfigurationChanged,
  busy,
  setupPreview,
  setupJob,
  snapshotPlan,
  projectReport,
} = guard
const page = ref<Page>('overview')
watch(page, () => window.scrollTo({ top: 0, behavior: 'instant' }), { flush: 'post' })
const referenceTarget = ref<ReferenceTarget>()
const projectFocusId = ref('')
function openReferences(checkId?: string) {
  referenceTarget.value = checkId ? { scope: 'environment', id: checkId } : undefined
  page.value = 'references'
  window.scrollTo({ top: 0 })
}
function openSource(id: string) {
  referenceTarget.value = { scope: 'source', id }
  page.value = 'references'
}
async function openHelp() {
  page.value = 'about'
  await nextTick()
  await focusResult(document.getElementById('troubleshooting'))
}
function openProjectReferences(id: string) {
  referenceTarget.value = { scope: 'project', id }
  page.value = 'references'
}
async function openProjectFinding(id: string) {
  projectFocusId.value = id
  page.value = 'projects'
  await nextTick()
  await focusResult(document.getElementById('project-finding-' + id))
}
async function openCheck(id: string) {
  page.value = 'overview'
  if (!report.value?.checks.some((check) => check.id === id)) {
    scanOpen.value = true
    guard.notify('先运行一次检测，再查看对应检查项的结果。')
    return
  }
  showAllResults()
  expanded.value = id
  await nextTick()
  await focusResult(document.getElementById('check-' + id))
}
const category = ref<Category | 'all'>('all')
type ResultFilter = 'all' | 'issues' | 'manual' | 'pass'
const statusFilter = ref<ResultFilter>('all')
const resultsPanel = ref<HTMLElement>()
const appVersion = packageMetadata.version
const query = ref('')
const expanded = ref('')
const scanOpen = ref(false)
const setupOpen = ref(false)
const setupResume = ref(false)
function openSetup(resume = false) {
  setupResume.value = resume || setupJob.value?.status === 'running'
  setupOpen.value = true
}
function setupBackups() {
  setupOpen.value = false
  page.value = 'backups'
}
function setupReport() {
  setupOpen.value = false
  page.value = 'overview'
}
const networkEnabled = ref(false)
const scanPasses = ref(3)
const projectPath = ref('')
watch(
  () => boot.value?.projectRoot,
  (value) => {
    if (value && !projectPath.value) projectPath.value = value
  },
)
async function chooseProject() {
  try {
    const path = await window.claudeGuardDesktop?.chooseProject()
    if (path) projectPath.value = path
  } catch {
    guard.notify('无法打开项目目录选择器，请直接输入路径。', 'error')
  }
}
async function executeSnapshotRestore() {
  if (await guard.restoreSnapshot()) {
    page.value = 'overview'
    await guard.scan(false, 3)
  }
}
const restoreTarget = ref<BackupSummary>()
const draft = ref<Preferences>({ ...defaultPreferences })
const lastAction = ref('')
const nav = [
  { id: 'overview' as const, label: '环境检测', icon: ScanLine },
  { id: 'configs' as const, label: '本机配置', icon: FolderCog },
  { id: 'projects' as const, label: '项目扫描', icon: FileCode2 },
  { id: 'history' as const, label: '检测记录', icon: History },
  { id: 'backups' as const, label: '备份恢复', icon: ArchiveRestore },
  { id: 'checklist' as const, label: '人工复核', icon: ListChecks },
]
const titles: Record<Page, string> = {
  overview: '环境检测',
  configs: '本机配置',
  history: '检测记录',
  backups: '备份恢复',
  checklist: '人工复核',
  projects: '项目扫描',
  settings: '检测偏好',
  about: '使用说明与来源',
  references: '参考文献',
}
const groups = computed(() =>
  Object.entries(categoryLabels)
    .map(([id, label]) => ({
      id: id as Category,
      label,
      checks:
        report.value?.checks.filter((check) => {
          const matches =
            check.category === id && (category.value === 'all' || category.value === id)
          const text =
            !query.value ||
            (check.title + check.summary + check.description)
              .toLowerCase()
              .includes(query.value.toLowerCase())
          const status =
            statusFilter.value === 'all' ||
            (statusFilter.value === 'issues' && ['warn', 'fail'].includes(check.status)) ||
            (statusFilter.value === 'manual' && ['manual', 'skipped'].includes(check.status)) ||
            (statusFilter.value === 'pass' && check.status === 'pass')
          return matches && text && status
        }) ?? [],
    }))
    .filter((group) => group.checks.length),
)
const resultNavigation = computed(() => {
  if (!report.value) return ''
  const labels = { all: '检测项', pass: '检查通过', issues: '需要关注', manual: '待确认 / 未检测' }
  const count = groups.value.reduce((total, group) => total + group.checks.length, 0)
  const opened = groups.value
    .flatMap((group) => group.checks)
    .find((check) => check.id === expanded.value)
  return `当前显示 ${count} 项${labels[statusFilter.value]}${opened ? `，已展开${opened.title}` : ''}`
})
const issueCount = computed(() =>
  report.value ? report.value.counts.warn + report.value.counts.fail : 0,
)
const pendingCount = computed(() =>
  report.value ? report.value.counts.manual + report.value.counts.skipped : 0,
)
const percentage = computed(() =>
  Math.round((progress.value.completed / Math.max(progress.value.total, 1)) * 100),
)
const isHistorical = computed(() =>
  Boolean(report.value && boot.value?.reports[0] && report.value.id !== boot.value.reports[0].id),
)
const reportPreferencesChanged = computed(
  () =>
    Boolean(report.value && boot.value) &&
    JSON.stringify(report.value?.preferences) !== JSON.stringify(boot.value?.preferences),
)
const reportedUsageMode = computed(
  () => report.value?.preferences.usageMode ?? boot.value?.preferences.usageMode ?? 'official',
)
const activeBackups = computed(
  () => boot.value?.backups.filter((backup) => backup.status === 'applied').length ?? 0,
)
const preferenceChanged = computed(
  () =>
    JSON.stringify(draft.value) !== JSON.stringify(boot.value?.preferences ?? defaultPreferences),
)
const exportBase = computed(() =>
  report.value ? `/api/reports/${report.value.id}/export?redact=1` : '',
)
const stateHeading = computed(() =>
  !report.value
    ? '先做一次检查，了解当前环境'
    : issueCount.value
      ? `有 ${issueCount.value} 项配置值得关注`
      : '已检查的配置符合当前偏好',
)
watch(
  () => boot.value?.preferences,
  (value) => {
    if (value) draft.value = { ...value }
  },
  { immediate: true },
)
watch(report, (value) => {
  expanded.value = value?.checks.find((check) => ['warn', 'fail'].includes(check.status))?.id || ''
  category.value = 'all'
  statusFilter.value = value && value.counts.warn + value.counts.fail > 0 ? 'issues' : 'all'
  query.value = ''
})
onMounted(async () => {
  await guard.initialize()
  await guard.importLegacyReviews()
})

function selectAll() {
  selected.value =
    selected.value.length === availableFixes.value.length ? [] : [...availableFixes.value]
}
async function openResults(filter: Exclude<ResultFilter, 'all'>) {
  if (!report.value) return
  page.value = 'overview'
  category.value = 'all'
  query.value = ''
  statusFilter.value = filter
  const firstCheck = groups.value[0]?.checks[0]
  expanded.value = firstCheck?.id ?? ''
  await nextTick()
  const target = firstCheck ? document.getElementById('check-' + firstCheck.id) : resultsPanel.value
  await focusResult(target)
}
async function focusResult(target: HTMLElement | null | undefined) {
  if (!target) return
  const sidebar = document.querySelector<HTMLElement>('.sidebar')
  const navigationOffset =
    sidebar && window.getComputedStyle(sidebar).position === 'sticky'
      ? sidebar.getBoundingClientRect().height
      : 0
  target.style.scrollMarginTop = `${Math.ceil(navigationOffset) + 24}px`
  const focusTarget = target.querySelector<HTMLButtonElement>('.check-summary') ?? target
  focusTarget.focus({ preventScroll: true })
  target.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    block: 'start',
  })
}
function showAllResults() {
  statusFilter.value = 'all'
  category.value = 'all'
  query.value = ''
}
async function scanLocalConfigs() {
  page.value = 'overview'
  await guard.scan(false)
}
async function startScan() {
  scanOpen.value = false
  page.value = 'overview'
  await guard.scan(networkEnabled.value, scanPasses.value)
}
async function executeRepair() {
  const count = plan.value?.files.length ?? 0
  if (await guard.apply()) {
    lastAction.value = `已修复 ${count} 个配置文件并保存备份。复检后，请重新启动终端与本工具，使环境变量更新。`
    await guard.scan(false)
  }
}
async function executeRestore() {
  if (!restoreTarget.value) return
  const id = restoreTarget.value.id
  if (await guard.restore(id)) {
    restoreTarget.value = undefined
    lastAction.value = '已恢复原始配置。重新启动终端与本工具后，环境变量将重新加载。'
    await guard.scan(false)
  }
}
function viewReport(value: ScanReport) {
  report.value = value
  selected.value = []
  page.value = 'overview'
}

async function openHistoricalCheck(value: ScanReport, id: string) {
  viewReport(value)
  await nextTick()
  await openCheck(id)
}

function selectFix(id: FixId) {
  guard.toggleFix(id)
}
async function copyPath(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    guard.notify('配置路径已复制。')
  } catch {
    guard.notify('无法自动复制，请选中路径手动复制。', 'error')
  }
}
const commandForPlatform = computed(() =>
  boot.value?.machine.platform === 'win32' ? '.\\启动工具.cmd' : './启动工具.command',
)
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#" @click.prevent="page = 'overview'"
        ><BrandMark /><span><strong>CG Claude</strong><small>本地环境工作台</small></span></a
      >
      <div class="workspace-label">
        <span class="workspace-dot" />个人工作空间<LockKeyhole :size="12" />
      </div>
      <nav aria-label="主导航" class="main-nav">
        <button
          v-for="item in nav"
          :key="item.id"
          :class="{ active: page === item.id }"
          :aria-current="page === item.id ? 'page' : undefined"
          @click="page = item.id"
        >
          <component :is="item.icon" :size="18" :stroke-width="1.7" /><span>{{ item.label }}</span
          ><span v-if="item.id === 'overview' && report && issueCount" class="nav-count">{{
            issueCount
          }}</span
          ><span v-if="item.id === 'backups' && activeBackups" class="nav-count neutral">{{
            activeBackups
          }}</span>
        </button>
      </nav>
      <div class="sidebar-bottom">
        <div class="local-note">
          <span class="local-note-icon"><LockKeyhole :size="17" /></span
          ><strong>配置保留在本机</strong>
          <p>按需检测，预览后修改。<br />每次修复都有原始备份。</p>
        </div>
        <nav class="secondary-nav" aria-label="辅助导航">
          <button :class="{ active: page === 'settings' }" @click="page = 'settings'">
            <Settings2 :size="17" />检测偏好</button
          ><button :class="{ active: page === 'about' }" @click="page = 'about'">
            <BookOpen :size="17" />使用说明
          </button>
          <button :class="{ active: page === 'references' }" @click="openReferences()">
            <LibraryBig :size="17" />参考文献
          </button>
        </nav>
        <div class="sidebar-footer">
          <span class="tiny-shield"><ShieldCheck :size="12" />本机服务</span
          ><span>v{{ appVersion }}</span>
        </div>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div class="breadcrumbs">
          <span>工作空间</span><ChevronRight :size="13" /><strong>{{ titles[page] }}</strong>
        </div>
        <div class="topbar-info">
          <span v-if="boot?.runtime === 'electron'" class="desktop-tag">Electron 桌面版</span>
          <span v-if="boot?.demo" class="demo-tag">隔离测试环境</span
          ><span class="machine-label"
            ><Laptop :size="14" />{{ boot?.machine.platformName || '本机' }}</span
          ><span class="connection-badge" :class="{ offline: !connected }"
            ><span />{{ connected ? '本机已连接' : loading ? '正在连接本机' : '本机未连接' }}</span
          >
        </div>
      </header>
      <div class="page-content">
        <div class="page-heading">
          <div>
            <h1>{{ titles[page] }}</h1>
            <p>
              {{
                page === 'overview'
                  ? '检查本机配置，让每一次修改都有据可查。'
                  : page === 'configs'
                    ? '从真实配置文件开始，预览需要修改的部分。'
                    : page === 'history'
                      ? '保留最近 30 次检测，对照环境的变化。'
                      : page === 'backups'
                        ? '每次修复前保存原始配置，随时回到修改之前。'
                        : page === 'checklist'
                          ? '把工具无法可靠自动判断的项目，逐项确认。'
                          : page === 'projects'
                            ? '扫描本地项目配置、权限、代理覆盖与 Git 提交，不执行项目脚本。'
                            : page === 'settings'
                              ? '按照你的实际网络与使用方式检查，减少误报。'
                              : page === 'references'
                                ? '查看建议的出处、采用方式与判断边界。'
                                : '了解检测范围、修复方式与参考来源。'
              }}
            </p>
          </div>
          <div class="heading-actions">
            <button
              v-if="['overview', 'configs', 'history'].includes(page)"
              class="button primary"
              :disabled="loading || !connected || (busy && setupJob?.status !== 'running')"
              @click="openSetup()"
            >
              <Workflow v-if="setupJob?.status === 'running'" :size="16" /><WandSparkles
                v-else
                :size="16"
              />{{ setupJob?.status === 'running' ? '查看配置进度' : '一键配置完成' }}
            </button>
            <details v-if="report && page === 'overview'" class="export-menu">
              <summary class="button secondary"><Download :size="15" />导出报告</summary>
              <div class="export-dropdown">
                <a :href="exportBase + '&format=markdown'">导出 Markdown</a
                ><a :href="exportBase + '&format=json'">导出 JSON</a
                ><small>默认隐藏 IP 与本机名称</small>
              </div>
            </details>
            <button
              v-if="['overview', 'configs', 'history'].includes(page)"
              class="button secondary"
              :disabled="loading || busy || !connected"
              @click="scanOpen = true"
            >
              <LoaderCircle v-if="scanning" class="spin" :size="16" /><Play
                v-else
                :size="14"
                fill="currentColor"
              />{{ scanning ? '正在检测' : '开始检测' }}
            </button>
          </div>
        </div>

        <div
          v-if="setupJob && !loading && ['overview', 'configs'].includes(page)"
          class="setup-banner"
          :class="{ running: setupJob.status === 'running' }"
        >
          <Workflow :size="19" />
          <div>
            <strong>{{
              setupJob.status === 'running'
                ? '配置流程正在执行'
                : setupJob.status === 'interrupted'
                  ? '上次配置流程中断'
                  : '最近的配置流程已结束'
            }}</strong
            ><span
              >{{
                setupJob.nodes.filter((node) => ['succeeded', 'skipped'].includes(node.status))
                  .length
              }}
              / {{ setupJob.nodes.length }} 个节点已处理<span
                v-if="setupJob.nodes.some((node) => node.enabled && node.status === 'skipped')"
              >
                · 有未成功的节点，请查看结果</span
              ></span
            >
          </div>
          <button class="text-link" @click="openSetup(true)">
            {{ setupJob.status === 'running' ? '查看进度' : '查看流程' }}<ArrowUpRight :size="14" />
          </button>
        </div>

        <div v-if="report?.verification && page === 'overview'" class="verification-strip">
          <ShieldCheck :size="16" /><span
            >已连续检测 {{ report.verification.passes }} 遍 ·
            {{
              report.verification.unstableCheckIds.length
                ? `${report.verification.unstableCheckIds.length} 项结果存在变化，请展开复核`
                : '各轮检测结果一致'
            }}</span
          >
        </div>

        <div v-if="loading" class="loading-view">
          <LoaderCircle class="spin" :size="28" /><strong>正在连接本机服务</strong>
          <p>读取系统信息与配置文件位置</p>
        </div>
        <div
          v-else-if="error && !['about', 'references'].includes(page)"
          class="empty-view error-view"
        >
          <WifiOff :size="36" />
          <h2>{{ connected ? '本机服务返回错误' : '本机服务尚未连接' }}</h2>
          <p>{{ error }}</p>
          <code>{{ commandForPlatform }}</code
          ><button class="button primary" @click="guard.initialize">
            <RefreshCw :size="15" />重新连接
          </button>
        </div>

        <template v-else-if="page === 'overview'">
          <div v-if="boot?.demo" class="notice info-notice">
            <Info :size="16" /><span
              >正在检测隔离测试目录。这里的配置可用于验证修复流程，你的日常配置不会被修改。</span
            >
          </div>
          <div v-if="isHistorical" class="notice info-notice">
            <History :size="16" /><span
              >正在查看 {{ formatDate(report!.completedAt) }} 的历史检测。</span
            ><button class="text-link" @click="viewReport(boot!.reports[0]!)">
              <ArrowLeft :size="13" />返回最新结果
            </button>
          </div>
          <div v-if="reportPreferencesChanged" class="notice info-notice">
            <CircleHelp :size="16" /><span
              >检测偏好已变化，当前结果仍使用检测时的偏好。重新检测后才能预览修复。</span
            >
            <button class="text-link" :disabled="busy" @click="scanOpen = true">重新检测</button>
          </div>
          <div v-if="reportConfigurationChanged && !isHistorical" class="notice info-notice">
            <FolderCog :size="16" /><span>{{
              report?.configurationFingerprint
                ? '用户配置文件已在检测后变化。当前记录仍可查看，重新检测后才能预览诊断修复。'
                : '这份旧记录没有配置基线。重新检测后才能预览诊断修复。'
            }}</span>
            <button class="text-link" :disabled="busy" @click="scanOpen = true">重新检测</button>
          </div>
          <div v-if="lastAction" class="notice success-notice">
            <CircleCheck :size="16" /><span>{{ lastAction }}</span
            ><button class="icon-button" aria-label="关闭修复提醒" @click="lastAction = ''">
              <X :size="14" />
            </button>
          </div>
          <section class="environment-overview">
            <div class="overview-intro">
              <div class="overview-symbol"><Activity :size="25" :stroke-width="1.6" /></div>
              <div>
                <h2>{{ scanning ? '正在逐项检查你的环境' : stateHeading }}</h2>
                <p v-if="report && !scanning">
                  最近检测 {{ formatDate(report.completedAt, true)
                  }}<span class="inline-divider" />{{
                    report.networkEnabled ? '含公网检测' : '本机配置检测'
                  }}<span class="inline-divider" />{{ boot?.machine.hostname }}
                </p>
                <p v-else-if="scanning">{{ progress.current }}</p>
                <p v-else>本机配置先检查，网络出口按需开启。</p>
              </div>
              <span class="overview-mode"
                ><span />{{
                  reportedUsageMode === 'official'
                    ? '官方默认 API'
                    : reportedUsageMode === 'custom'
                      ? '自定义 API'
                      : reportedUsageMode === 'bedrock'
                        ? 'Amazon Bedrock'
                        : 'Google Vertex'
                }}</span
              >
            </div>
            <div
              v-if="scanning"
              class="scan-progress"
              role="progressbar"
              :aria-valuenow="percentage"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="progress.current"
            >
              <span :style="{ width: percentage + '%' }" /><small
                >{{ progress.completed }} / {{ progress.total }} 项</small
              >
            </div>
            <div class="overview-counts" aria-label="检测结果快捷入口">
              <button
                class="count-link"
                :class="{ active: report && statusFilter === 'pass' }"
                :disabled="!report"
                :aria-label="`查看 ${report?.counts.pass ?? 0} 项检查通过的详情`"
                :aria-pressed="Boolean(report && statusFilter === 'pass')"
                aria-controls="results-panel"
                @click="openResults('pass')"
              >
                <CircleCheck :size="18" /><strong>{{ report?.counts.pass ?? '—' }}</strong
                ><span>检查通过</span><ChevronRight class="count-link-arrow" :size="14" />
              </button>
              <button
                class="count-link issue-count"
                :class="{ active: report && statusFilter === 'issues' }"
                :disabled="!report"
                :aria-label="`查看 ${issueCount} 项需要关注的详情`"
                :aria-pressed="Boolean(report && statusFilter === 'issues')"
                aria-controls="results-panel"
                @click="openResults('issues')"
              >
                <TriangleAlert :size="18" /><strong>{{ report ? issueCount : '—' }}</strong
                ><span>需要关注</span><ChevronRight class="count-link-arrow" :size="14" />
              </button>
              <button
                class="count-link pending-count"
                :class="{ active: report && statusFilter === 'manual' }"
                :disabled="!report"
                :aria-label="`查看 ${pendingCount} 项待确认或未检测的详情`"
                :aria-pressed="Boolean(report && statusFilter === 'manual')"
                aria-controls="results-panel"
                @click="openResults('manual')"
              >
                <CircleHelp :size="18" /><strong>{{ report ? pendingCount : '—' }}</strong
                ><span>待确认 / 未检测</span><ChevronRight class="count-link-arrow" :size="14" />
              </button>
              <div class="count-note">
                <LockKeyhole :size="16" /><span
                  >以实际检测结果为准<br /><small>环境检查不推算账号状态</small></span
                >
              </div>
            </div>
          </section>
          <NetworkPath :report="report" :machine="boot?.machine" :scanning="scanning" />
          <div class="results-layout">
            <section id="results-panel" ref="resultsPanel" class="results-panel" tabindex="-1">
              <div class="results-heading">
                <div>
                  <h2>
                    检测详情 <span v-if="report">{{ report.checks.length }}</span>
                  </h2>
                  <p>查看证据，再决定如何处理。</p>
                </div>
                <button class="icon-button" aria-label="设置检测偏好" @click="page = 'settings'">
                  <SlidersHorizontal :size="17" />
                </button>
              </div>
              <p class="sr-only" role="status" aria-live="polite">{{ resultNavigation }}</p>
              <div class="result-filters">
                <div class="filter-tabs" aria-label="按结果筛选">
                  <button
                    v-for="filter in [
                      { id: 'all', label: '全部' },
                      { id: 'issues', label: '需关注' },
                      { id: 'manual', label: '待确认' },
                      { id: 'pass', label: '已通过' },
                    ] as const"
                    :key="filter.id"
                    :class="{ active: statusFilter === filter.id }"
                    :aria-pressed="statusFilter === filter.id"
                    @click="statusFilter = filter.id"
                  >
                    {{ filter.label
                    }}<span v-if="filter.id === 'issues' && report">{{ issueCount }}</span>
                  </button>
                </div>
                <label class="search-box"
                  ><Search :size="14" /><input
                    v-model="query"
                    aria-label="搜索检测项"
                    placeholder="搜索检测项"
                /></label>
              </div>
              <div class="category-filters" aria-label="按类别筛选">
                <button :class="{ active: category === 'all' }" @click="category = 'all'">
                  所有类别</button
                ><button
                  v-for="(label, id) in categoryLabels"
                  :key="id"
                  :class="{ active: category === id }"
                  @click="category = id"
                >
                  {{ label }}
                </button>
              </div>
              <div v-if="!report" class="result-empty">
                <ScanLine :size="35" />
                <h3>还没有检测结果</h3>
                <p>点击「开始检测」，检查实际本机配置。<br />默认不进行外部网络查询。</p>
                <button class="button secondary" @click="scanOpen = true">开始第一次检测</button>
              </div>
              <div v-else-if="!groups.length" class="result-empty small">
                <Search :size="26" />
                <h3>
                  {{
                    !query && category === 'all' && statusFilter !== 'all'
                      ? {
                          issues: '当前没有需要关注的检测项',
                          manual: '当前没有待确认或未检测的项目',
                          pass: '当前没有已通过的检测项',
                        }[statusFilter]
                      : '没有符合条件的检测项'
                  }}
                </h3>
                <button class="text-link" @click="showAllResults">显示全部结果</button>
              </div>
              <div v-for="group in groups" v-else :key="group.id" class="check-group">
                <div class="group-heading">
                  <h3>{{ group.label }}</h3>
                  <span>{{ group.checks.length }} 项</span>
                </div>
                <CheckRow
                  v-for="check in group.checks"
                  :key="check.id"
                  :check="check"
                  :expanded="expanded === check.id"
                  :selected="selected"
                  :disabled="busy || !canRepair"
                  :platform="boot?.machine.platform"
                  @toggle="expanded = expanded === check.id ? '' : check.id"
                  @fix="selectFix"
                  @references="openReferences(check.id)"
                  @copy-error="guard.notify('无法自动复制，请手动选择命令。', 'error')"
                />
              </div>
              <div v-if="report" class="results-footer">
                <ShieldCheck :size="13" />配置来自本机读取；密钥与 URL 凭据已隐藏。
              </div>
            </section>
            <aside class="repair-sidebar">
              <section class="repair-panel">
                <div class="repair-panel-heading">
                  <span class="repair-icon"><Wrench :size="18" /></span>
                  <h2>配置修复</h2>
                  <span class="small-count">{{ availableFixes.length }}</span>
                </div>
                <p>选择需要修改的配置，<br />先预览，再执行。</p>
                <div v-if="availableFixes.length" class="repair-options">
                  <label v-for="id in availableFixes" :key="id"
                    ><input
                      type="checkbox"
                      :checked="selected.includes(id)"
                      :disabled="busy"
                      @change="selectFix(id)"
                    /><span>{{ fixLabels[id] }}</span></label
                  ><button class="text-link select-all" :disabled="busy" @click="selectAll">
                    {{ selected.length === availableFixes.length ? '取消全选' : '选择全部' }}
                  </button>
                </div>
                <div v-else class="repair-empty">
                  <CircleCheck :size="23" /><span>{{
                    isHistorical
                      ? '请返回最新结果后选择修复'
                      : reportPreferencesChanged || reportConfigurationChanged
                        ? '重新检测后显示可修复项目'
                        : report
                          ? '没有可自动修复的项目'
                          : '检测后显示可修复项目'
                  }}</span>
                </div>
                <button
                  class="button primary full-width"
                  :disabled="!selected.length || busy"
                  @click="guard.preview"
                >
                  <LoaderCircle v-if="working" class="spin" :size="15" /><Wrench
                    v-else
                    :size="15"
                  />预览修复<span v-if="selected.length">({{ selected.length }})</span>
                </button>
                <div class="repair-assurance">
                  <ArchiveRestore :size="14" /><span>修复前备份，支持恢复</span>
                </div>
              </section>
              <section class="manual-tip">
                <span class="manual-tip-icon"><CircleHelp :size="19" /></span>
                <h3>有些项目，需要你确认</h3>
                <p>DNS 实际出口、登录设备和服务地区，需要结合外部结果与账号设置复核。</p>
                <button class="text-link" @click="page = 'checklist'">
                  打开人工复核<ArrowUpRight :size="14" />
                </button>
                <button class="text-link help-entry" @click="openHelp">
                  按错误类型排查<ArrowUpRight :size="14" />
                </button>
              </section>
              <a
                class="source-link"
                href="https://x.com/AYi_AInotes/status/2106639522586829094"
                target="_blank"
                rel="noopener noreferrer"
                ><BookOpen :size="14" /><span>查看参考文章</span><ArrowUpRight :size="13"
              /></a>
            </aside>
          </div>
        </template>

        <ConfigurationsView
          v-else-if="page === 'configs'"
          :files="boot?.files ?? []"
          :busy="busy"
          :connected="connected"
          :connection="boot?.connection"
          :preview="guard.previewConnection"
          :save="guard.applyConnection"
          @references="openReferences('proxy-compatibility')"
          @backups="page = 'backups'"
          @scan="scanLocalConfigs"
          @copy="copyPath"
        />

        <HistoryView
          v-else-if="page === 'history'"
          :reports="boot?.reports ?? []"
          @open="viewReport"
          @check="openHistoricalCheck"
          @scan="scanOpen = true"
        />

        <ProjectsView
          v-else-if="page === 'projects'"
          v-model="projectPath"
          :report="projectReport"
          :focus-id="projectFocusId"
          :busy="busy"
          :working="working"
          :connected="connected"
          :desktop="boot?.runtime === 'electron'"
          @scan="guard.scanProject"
          @choose="chooseProject"
          @references="openProjectReferences"
          @focus="openProjectFinding"
        />

        <BackupsView
          v-else-if="page === 'backups'"
          :snapshots="boot?.snapshots ?? []"
          :backups="boot?.backups ?? []"
          :busy="busy"
          :connected="connected"
          @capture="guard.captureSnapshot"
          @preview="guard.previewSnapshot"
          @restore="restoreTarget = $event"
          @overview="page = 'overview'"
        />

        <ManualReviewView
          v-else-if="page === 'checklist'"
          :reviews="boot?.manualReviews ?? []"
          :busy="busy"
          :save="guard.saveManualReview"
          :reset="guard.resetManualReviews"
        />

        <SettingsView
          v-else-if="page === 'settings'"
          v-model="draft"
          :busy="busy"
          :working="working"
          :connected="connected"
          :changed="preferenceChanged"
          @save="guard.savePreferences"
        />

        <AboutView
          v-else-if="page === 'about'"
          :version="appVersion"
          @references="openReferences()"
          @check="openCheck"
          @source="openSource"
          @manual="page = 'checklist'"
        />

        <ReferencesView
          v-else-if="page === 'references'"
          :target="referenceTarget"
          :project-findings="projectReport?.findings"
          :checks="report?.checks"
          @clear="referenceTarget = undefined"
          @project="openProjectFinding"
          @check="openCheck"
        />
        <footer class="page-footer">
          <span><ShieldCheck :size="12" />CG Claude · 本地环境工具</span
          ><button @click="page = 'about'">检测范围与说明<ArrowUpRight :size="12" /></button>
        </footer>
      </div>
    </main>

    <SetupWizard
      :open="setupOpen"
      :resume="setupResume"
      :boot="boot"
      :preview="setupPreview"
      :job="setupJob"
      :working="working"
      :connected="connected"
      :prepare="guard.prepareSetup"
      :start="guard.startSetup"
      @close="setupOpen = false"
      @backups="setupBackups"
      @report="setupReport"
    />

    <GuardDialog
      :open="scanOpen"
      title="开始环境检测"
      description="默认检查本机配置。公网检测需要访问外部服务。"
      :locked="busy"
      @close="scanOpen = false"
      ><div class="scan-scope">
        <span class="scan-scope-icon"><FolderCog :size="24" /></span>
        <div>
          <strong>本机配置检测</strong>
          <p>系统时区、代理、shell、npm、git、Claude Code 配置及浏览器设置。</p>
        </div>
        <span class="included-tag">默认开启</span>
      </div>
      <label class="network-option" :class="{ selected: networkEnabled }"
        ><input v-model="networkEnabled" type="checkbox" /><span
          ><strong>包括公网出口与 WebRTC 检测</strong
          ><small
            >访问 ipinfo.io、api.ipify.org 与 Google STUN。外部服务会看到你的公网
            IP；配置和密钥留在本机。</small
          ></span
        ></label
      >
      <label class="scan-repeat-option"
        >连续检测次数<select v-model.number="scanPasses">
          <option :value="1">1 遍</option>
          <option :value="2">2 遍</option>
          <option :value="3">3 遍（核对稳定性）</option>
        </select></label
      >
      <div class="dialog-note"><LockKeyhole :size="15" />检测只读取配置，不执行修改。</div>
      <template #footer
        ><button class="button secondary" @click="scanOpen = false">取消</button
        ><button class="button primary" @click="startScan">
          <Play :size="13" fill="currentColor" />开始检测
        </button></template
      ></GuardDialog
    >
    <GuardDialog
      :open="!!snapshotPlan"
      title="一键还原配置快照"
      :description="`将还原 ${snapshotPlan?.files.length ?? 0} 个配置文件，并恢复快照中的检测偏好。`"
      wide
      :locked="working"
      @close="snapshotPlan = undefined"
      ><div class="wizard-note">
        <TriangleAlert :size="18" />
        <p>
          文件会完整恢复到快照时的内容。还原前先保存当前状态；预览后文件如有变化，本次还原会停止。
        </p>
      </div>
      <div v-for="file in snapshotPlan?.files" :key="file.path" class="file-preview">
        <div class="preview-file-title">
          <FileCode2 :size="16" /><code>{{ file.path }}</code>
        </div>
        <p class="snapshot-file-note">
          {{ file.changes[0]?.before }} → {{ file.changes[0]?.after }}
        </p>
      </div>
      <p v-if="!snapshotPlan?.files.length" class="wizard-hint">配置文件内容与快照一致。</p>
      <p class="wizard-hint">
        检测偏好：{{ snapshotPlan?.preferencesChanged ? '会恢复为快照中的选择' : '与快照一致' }}
      </p>
      <ul class="setup-notes">
        <li v-for="note in snapshotPlan?.notes" :key="note">{{ note }}</li>
      </ul>
      <template #footer
        ><button class="button secondary" :disabled="working" @click="snapshotPlan = undefined">
          取消</button
        ><button class="button primary" :disabled="working" @click="executeSnapshotRestore">
          <LoaderCircle v-if="working" class="spin" :size="16" /><RotateCcw
            v-else
            :size="16"
          />保存当前状态并还原
        </button></template
      ></GuardDialog
    >

    <GuardDialog
      :open="!!plan"
      title="预览配置修复"
      :description="`将修改 ${plan?.files.length ?? 0} 个文件，执行前自动保存原始备份。`"
      wide
      :locked="working"
      @close="plan = undefined"
      ><div v-for="file in plan?.files" :key="file.path" class="file-preview">
        <div class="preview-file-title">
          <FileCode2 :size="16" /><code>{{ file.path }}</code
          ><span v-if="!file.exists">将创建</span><small>{{ file.changes.length }} 项修改</small>
        </div>
        <div
          v-for="(change, index) in file.changes"
          :key="change.key + index"
          class="change-preview"
        >
          <strong>{{ change.key }}</strong>
          <div class="diff-before">
            <span>−</span><code>{{ change.before }}</code>
          </div>
          <div class="diff-after">
            <span>+</span><code>{{ change.after }}</code>
          </div>
        </div>
      </div>
      <div class="preview-notes">
        <p v-for="note in plan?.notes" :key="note"><Info :size="14" />{{ note }}</p>
      </div>
      <template #footer
        ><span class="preview-footer-note"
          ><LockKeyhole :size="13" />原始备份包含本机配置，仅保存在本机</span
        ><button class="button secondary" :disabled="working" @click="plan = undefined">取消</button
        ><button class="button primary" :disabled="working" @click="executeRepair">
          <LoaderCircle v-if="working" class="spin" :size="15" /><Check v-else :size="15" />{{
            working ? '正在修复' : '备份并执行修复'
          }}
        </button></template
      ></GuardDialog
    >
    <GuardDialog
      :open="!!restoreTarget"
      title="恢复原始配置"
      description="将恢复这次修复前的文件。当前文件若已变化，工具会停止恢复。"
      :locked="working"
      @close="restoreTarget = undefined"
      ><div class="restore-file-list">
        <div v-for="file in restoreTarget?.files" :key="file">
          <FileCode2 :size="16" /><code>{{ file }}</code>
        </div>
      </div>
      <div class="dialog-note"><Info :size="15" />恢复后请重新启动终端，使环境变量重新加载。</div>
      <template #footer
        ><button class="button secondary" :disabled="working" @click="restoreTarget = undefined">
          取消</button
        ><button class="button primary" :disabled="working" @click="executeRestore">
          <LoaderCircle v-if="working" class="spin" :size="15" /><RotateCcw
            v-else
            :size="15"
          />恢复原配置
        </button></template
      ></GuardDialog
    >
    <Transition name="toast"
      ><div
        v-if="toast"
        class="toast-message"
        :class="toast.kind"
        :role="toast.kind === 'error' ? 'alert' : 'status'"
      >
        <CircleCheck v-if="toast.kind === 'success'" :size="18" /><TriangleAlert
          v-else
          :size="18"
        /><span>{{ toast.message }}</span
        ><button class="icon-button" aria-label="关闭消息" @click="toast = undefined">
          <X :size="15" />
        </button></div
    ></Transition>
  </div>
</template>
