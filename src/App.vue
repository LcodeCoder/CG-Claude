<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import {
  ShieldCheck,
  Settings2,
  ArrowUpRight,
  Laptop,
  Play,
  Download,
  ChevronRight,
  CircleCheck,
  TriangleAlert,
  LockKeyhole,
  RefreshCw,
  X,
  BookOpen,
  LoaderCircle,
  WifiOff,
  WandSparkles,
  Workflow,
  LibraryBig,
} from '@lucide/vue'
import { defaultPreferences } from '../shared/types'
import type { Preferences, BackupSummary, ScanReport } from '../shared/types'
import { useGuard } from './composables/useGuard'
import packageMetadata from '../package.json'
import ScanOptionsDialog from './components/ScanOptionsDialog.vue'
import SnapshotRestoreDialog from './components/SnapshotRestoreDialog.vue'
import RepairPreviewDialog from './components/RepairPreviewDialog.vue'
import RestoreBackupDialog from './components/RestoreBackupDialog.vue'
import BrandMark from './components/BrandMark.vue'
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
import EnvironmentView from './views/EnvironmentView.vue'
import { focusResult } from './lib/navigation'
import { createResultFilters } from './lib/environment-results'
import { primaryNavigation, workspacePages } from './content/navigation'
import type { WorkspacePage } from './content/navigation'

const pageHeading = ref<HTMLElement | null>(null)
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
const page = ref<WorkspacePage>('overview')
const appVersion = packageMetadata.version
watch(page, () => window.scrollTo({ top: 0, behavior: 'instant' }), { flush: 'post' })
const referenceTarget = ref<ReferenceTarget>()
const projectFocusId = ref('')
async function openReferenceTarget(target?: ReferenceTarget) {
  referenceTarget.value = target
  page.value = 'references'
  await nextTick()
  await focusResult(document.getElementById(target ? 'reference-context' : 'reference-intro'))
}
function openReferences(checkId?: string) {
  return openReferenceTarget(checkId ? { scope: 'environment', id: checkId } : undefined)
}
function openSource(id: string) {
  return openReferenceTarget({ scope: 'source', id })
}
async function openHelp() {
  page.value = 'about'
  await nextTick()
  await focusResult(document.getElementById('troubleshooting'))
}
function openManualReferences(id: string) {
  return openReferenceTarget({ scope: 'manual', id })
}
async function openManualItem(id: string) {
  page.value = 'checklist'
  await nextTick()
  await focusResult(document.getElementById('manual-item-' + id))
}
function openProjectReferences(id: string) {
  return openReferenceTarget({ scope: 'project', id })
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
  resultFilters.value = { category: 'all', status: 'all', query: '', expanded: id }
  await nextTick()
  await focusResult(document.getElementById('check-' + id))
}
const resultFilters = ref(createResultFilters())
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
const issueCount = computed(() =>
  report.value ? report.value.counts.warn + report.value.counts.fail : 0,
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
watch(
  () => boot.value?.preferences,
  (value) => {
    if (value) draft.value = { ...value }
  },
  { immediate: true },
)
watch(report, (value) => {
  resultFilters.value = createResultFilters(value)
})
onMounted(async () => {
  await guard.initialize()
  await guard.importLegacyReviews()
})

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

async function copyPath(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    guard.notify('配置路径已复制。')
  } catch {
    guard.notify('无法自动复制，请选中路径手动复制。', 'error')
  }
}
async function copyReferences(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    guard.notify('文献引用已复制，包含原文链接、采用方式与判断边界。')
  } catch {
    guard.notify('无法自动复制，请在文献卡片中手动选择内容。', 'error')
  }
}
const commandForPlatform = computed(() =>
  boot.value?.machine.platform === 'win32' ? '.\\启动工具.cmd' : './启动工具.command',
)
</script>

<template>
  <div class="app-shell">
    <button class="skip-to-content" @click="focusResult(pageHeading)">跳到主要内容</button>
    <aside class="sidebar">
      <a class="brand" href="#" @click.prevent="page = 'overview'"
        ><BrandMark /><span><strong>CG Claude</strong><small>本地环境工作台</small></span></a
      >
      <div class="workspace-label">
        <span class="workspace-dot" />个人工作空间<LockKeyhole :size="12" />
      </div>
      <nav aria-label="主导航" class="main-nav">
        <button
          v-for="item in primaryNavigation"
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
          <button
            :class="{ active: page === 'settings' }"
            :aria-current="page === 'settings' ? 'page' : undefined"
            @click="page = 'settings'"
          >
            <Settings2 :size="17" />检测偏好</button
          ><button
            :class="{ active: page === 'about' }"
            :aria-current="page === 'about' ? 'page' : undefined"
            @click="page = 'about'"
          >
            <BookOpen :size="17" />使用说明
          </button>
          <button
            :class="{ active: page === 'references' }"
            :aria-current="page === 'references' ? 'page' : undefined"
            @click="openReferences()"
          >
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
          <span>工作空间</span><ChevronRight :size="13" /><strong>{{
            workspacePages[page].title
          }}</strong>
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
            <h1 ref="pageHeading" tabindex="-1">{{ workspacePages[page].title }}</h1>
            <p>{{ workspacePages[page].description }}</p>
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

        <div
          v-if="report?.verification && page === 'overview' && !scanning"
          class="verification-strip"
        >
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

        <EnvironmentView
          v-else-if="page === 'overview'"
          v-model:filters="resultFilters"
          v-model:selected="selected"
          v-model:last-action="lastAction"
          :report="report"
          :latest-report="boot?.reports[0]"
          :machine="boot?.machine"
          :preferences="boot?.preferences"
          :demo="Boolean(boot?.demo)"
          :busy="busy"
          :scanning="scanning"
          :working="working"
          :progress="progress"
          :report-configuration-changed="reportConfigurationChanged"
          :can-repair="canRepair"
          :available-fixes="availableFixes"
          @scan="scanOpen = true"
          @latest="viewReport(boot!.reports[0]!)"
          @settings="page = 'settings'"
          @manual="page = 'checklist'"
          @help="openHelp"
          @preview="guard.preview"
          @fix="guard.toggleFix"
          @references="openReferences"
          @copy-error="guard.notify('无法自动复制，请手动选择命令。', 'error')"
        />

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
          @references="openManualReferences"
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
          @manual="openManualItem"
        />

        <ReferencesView
          v-else-if="page === 'references'"
          :target="referenceTarget"
          @copy="copyReferences"
          :project-findings="projectReport?.findings"
          :checks="report?.checks"
          @clear="referenceTarget = undefined"
          @project="openProjectFinding"
          @manual="openManualItem"
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

    <ScanOptionsDialog
      :open="scanOpen"
      :busy="busy"
      v-model:network="networkEnabled"
      v-model:passes="scanPasses"
      @close="scanOpen = false"
      @start="startScan"
    />
    <SnapshotRestoreDialog
      :record="snapshotPlan"
      :working="working"
      @close="snapshotPlan = undefined"
      @execute="executeSnapshotRestore"
    />
    <RepairPreviewDialog
      :record="plan"
      :working="working"
      @close="plan = undefined"
      @execute="executeRepair"
    />
    <RestoreBackupDialog
      :record="restoreTarget"
      :working="working"
      @close="restoreTarget = undefined"
      @execute="executeRestore"
    />
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
