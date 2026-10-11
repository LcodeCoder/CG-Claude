<script setup lang="ts">
import { provide, computed, ref, watch, onMounted, nextTick, defineAsyncComponent } from 'vue'
import {
  ShieldCheck,
  Settings2,
  ArrowUpRight,
  Laptop,
  Play,
  Download,
  CircleCheck,
  TriangleAlert,
  LockKeyhole,
  RefreshCw,
  X,
  LoaderCircle,
  WifiOff,
  Workflow,
  Minus,
} from '@lucide/vue'
import { defaultPreferences, samePreferences } from '../shared/types'
import { guidanceTimezone, setupFollowupReport } from '../shared/manual-guidance'
import type { Preferences, BackupSummary, ScanReport } from '../shared/types'
import { useGuard } from './composables/useGuard'
import { notificationKey } from './lib/notifications'
import packageMetadata from '../package.json'
import ScanOptionsDialog from './components/ScanOptionsDialog.vue'
import SnapshotRestoreDialog from './components/SnapshotRestoreDialog.vue'
import RepairPreviewDialog from './components/RepairPreviewDialog.vue'
import RestoreBackupDialog from './components/RestoreBackupDialog.vue'
import BrandMark from './components/BrandMark.vue'
import SetupWizard from './components/SetupWizard.vue'
import type { ReferenceTarget } from '../shared/references'
import EnvironmentView from './views/EnvironmentView.vue'
import { useAppSettings } from './composables/useAppSettings'
import { useUiText } from './i18n'
import { focusResult } from './lib/navigation'
import { createResultFilters } from './lib/environment-results'
import { primaryNavigation, secondaryNavigation, workspacePages } from './content/navigation'
import type { WorkspacePage } from './content/navigation'

const { t } = useUiText()

const ReferencesView = defineAsyncComponent(() => import('./views/ReferencesView.vue'))
const ManualReviewView = defineAsyncComponent(() => import('./views/ManualReviewView.vue'))
const HistoryView = defineAsyncComponent(() => import('./views/HistoryView.vue'))
const ConfigurationsView = defineAsyncComponent(() => import('./views/ConfigurationsView.vue'))
const TranslationView = defineAsyncComponent(() => import('./views/TranslationView.vue'))
const ProjectsView = defineAsyncComponent(() => import('./views/ProjectsView.vue'))
const BackupsView = defineAsyncComponent(() => import('./views/BackupsView.vue'))
const SettingsView = defineAsyncComponent(() => import('./views/SettingsView.vue'))
const AboutView = defineAsyncComponent(() => import('./views/AboutView.vue'))
const AppSettingsView = defineAsyncComponent(() => import('./views/AppSettingsView.vue'))

const pageHeading = ref<HTMLElement | null>(null)
const guard = useGuard()
const applicationSettings = useAppSettings(() => guard.boot.value?.token ?? '')
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
  remoteWorking,
  setupPreview,
  setupJob,
  snapshotPlan,
  projectReport,
} = guard
provide(notificationKey, toast)
const page = ref<WorkspacePage>('overview')
const appVersion = packageMetadata.version
watch(page, () => window.scrollTo({ top: 0, behavior: 'instant' }), { flush: 'post' })
const referenceTarget = ref<ReferenceTarget>()
const projectFocusId = ref('')
async function openReferenceTarget(target?: ReferenceTarget) {
  referenceTarget.value = target
  page.value = 'references'
  await nextTick()
  const focusId =
    target?.scope === 'source' && target.id === 'ayi-guide'
      ? 'article-audit'
      : target
        ? 'reference-context'
        : 'reference-intro'
  await focusResult(document.getElementById(focusId))
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
async function openManualItem(id?: string) {
  page.value = 'checklist'
  await nextTick()
  if (id) await focusResult(document.getElementById('manual-item-' + id))
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
  if (setupJob.value) {
    const latest = setupFollowupReport(setupJob.value, boot.value?.reports ?? [])
    if (latest) report.value = latest
  }
  setupOpen.value = false
  page.value = 'overview'
}
async function setupManual(id: string) {
  setupOpen.value = false
  await openManualItem(id)
}
async function setupCheck(id: string) {
  setupReport()
  await openCheck(id)
}
function setupRecheck() {
  setupOpen.value = false
  scanOpen.value = true
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
  () => !samePreferences(draft.value, boot.value?.preferences ?? defaultPreferences),
)
const exportBase = computed(() =>
  report.value ? `/api/reports/${report.value.id}/export?redact=1` : '',
)
watch(
  () => boot.value?.preferences,
  (value, previous) => {
    if (
      value &&
      (!previous || samePreferences(draft.value, previous) || samePreferences(draft.value, value))
    )
      draft.value = { ...value }
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
const desktopAvailable = Boolean(window.claudeGuardDesktop)
const hideWindowLabel = computed(() =>
  boot.value?.machine.platform === 'darwin' ? '隐藏到菜单栏' : '隐藏到托盘',
)
async function hideDesktopWindow() {
  try {
    await window.claudeGuardDesktop?.hideWindow()
  } catch {
    guard.notify('无法隐藏窗口，请使用系统的最小化按钮。', 'error')
  }
}
const commandForPlatform = computed(() =>
  boot.value?.machine.platform === 'win32' ? '.\\启动工具.cmd' : './启动工具.command',
)
</script>

<template>
  <div class="app-shell">
    <button class="skip-to-content" @click="focusResult(pageHeading)">
      {{ t('跳到主要内容') }}
    </button>
    <aside class="sidebar">
      <a class="brand" href="#" @click.prevent="page = 'overview'"
        ><BrandMark /><span
          ><strong>CG Claude</strong><small>{{ t('环境与配置') }}</small></span
        ></a
      >
      <nav :aria-label="t('主导航')" class="main-nav">
        <button
          v-for="item in primaryNavigation"
          :key="item.id"
          :class="{ active: page === item.id }"
          :aria-current="page === item.id ? 'page' : undefined"
          @click="page = item.id"
        >
          <component :is="item.icon" :size="18" :stroke-width="1.7" /><span>{{
            t(item.label)
          }}</span
          ><span v-if="item.id === 'overview' && report && issueCount" class="nav-count">{{
            issueCount
          }}</span
          ><span v-if="item.id === 'backups' && activeBackups" class="nav-count neutral">{{
            activeBackups
          }}</span>
        </button>
      </nav>
      <div class="sidebar-bottom">
        <nav class="secondary-nav" :aria-label="t('辅助导航')">
          <button
            v-for="item in secondaryNavigation"
            :key="item.id"
            :class="{ active: page === item.id }"
            :aria-current="page === item.id ? 'page' : undefined"
            @click="item.id === 'references' ? openReferences() : (page = item.id)"
          >
            <component :is="item.icon" :size="17" />{{ t(item.label) }}
          </button>
        </nav>
        <div class="sidebar-footer">
          <span class="tiny-shield"><ShieldCheck :size="12" />{{ t('本机服务') }}</span
          ><span>v{{ appVersion }}</span>
        </div>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <span class="topbar-local"><LockKeyhole :size="13" />{{ t('配置保存在本机') }}</span>
        <div class="topbar-info">
          <button
            v-if="desktopAvailable"
            class="icon-button desktop-hide-button"
            :aria-label="t(hideWindowLabel)"
            :title="t(hideWindowLabel)"
            @click="hideDesktopWindow"
          >
            <Minus :size="17" />
          </button>
          <span v-if="desktopAvailable" class="desktop-tag">{{ t('桌面版') }}</span>
          <span v-if="boot?.demo" class="demo-tag">{{ t('隔离测试环境') }}</span
          ><span class="machine-label"
            ><Laptop :size="14" />{{ boot?.machine.platformName || t('本机') }}</span
          ><span class="connection-badge" :class="{ offline: !connected }"
            ><span />{{
              connected ? t('本机已连接') : loading ? t('正在连接本机') : t('本机未连接')
            }}</span
          >
        </div>
      </header>
      <div class="page-content">
        <div class="page-heading">
          <div>
            <h1 ref="pageHeading" tabindex="-1">{{ t(workspacePages[page].title) }}</h1>
            <p v-if="!['overview', 'references'].includes(page)">
              {{ t(workspacePages[page].description) }}
            </p>
          </div>
          <div class="heading-actions">
            <button
              v-if="['overview', 'configs', 'history'].includes(page)"
              class="button primary"
              :disabled="loading || !connected || (busy && setupJob?.status !== 'running')"
              @click="openSetup()"
            >
              <Workflow v-if="setupJob?.status === 'running'" :size="16" /><Settings2
                v-else
                :size="16"
              />{{ setupJob?.status === 'running' ? t('查看配置进度') : t('一键配置') }}
            </button>
            <details v-if="report && page === 'overview'" class="export-menu">
              <summary class="button secondary"><Download :size="15" />{{ t('导出报告') }}</summary>
              <div class="export-dropdown">
                <a :href="exportBase + '&format=markdown'">{{ t('导出 Markdown') }}</a
                ><a :href="exportBase + '&format=json'">{{ t('导出 JSON') }}</a
                ><small>{{ t('默认隐藏 IP 与本机名称') }}</small>
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
              />{{ scanning ? t('正在检测') : t('开始检测') }}
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
                ? t('配置流程正在执行')
                : setupJob.status === 'interrupted'
                  ? t('上次配置流程中断')
                  : t('最近的配置流程已结束')
            }}</strong
            ><span
              >{{
                setupJob.nodes.filter((node) => ['succeeded', 'skipped'].includes(node.status))
                  .length
              }}
              / {{ setupJob.nodes.length }} {{ t('个节点已处理')
              }}<span
                v-if="setupJob.nodes.some((node) => node.enabled && node.status === 'skipped')"
              >
                {{ t('· 有未成功的节点，请查看结果') }}</span
              ></span
            >
          </div>
          <button class="text-link" @click="openSetup(true)">
            {{ setupJob.status === 'running' ? t('查看进度') : t('查看流程')
            }}<ArrowUpRight :size="14" />
          </button>
        </div>

        <div
          v-if="report?.verification && page === 'overview' && !scanning"
          class="verification-strip"
        >
          <ShieldCheck :size="16" /><span
            >{{ t('已连续检测 {count} 遍', { count: report.verification.passes }) }} ·
            {{
              report.verification.unstableCheckIds.length
                ? t('{count} 项结果存在变化，请展开复核', {
                    count: report.verification.unstableCheckIds.length,
                  })
                : t('各轮检测结果一致')
            }}</span
          >
        </div>

        <div
          v-if="remoteWorking && !scanning && !loading && !error"
          class="verification-strip"
          role="status"
        >
          <LoaderCircle class="spin" :size="16" /><span>{{
            t('本机操作仍在进行，完成后自动更新。')
          }}</span>
        </div>
        <div v-if="loading" class="loading-view">
          <LoaderCircle class="spin" :size="28" /><strong>{{ t('正在连接本机服务') }}</strong>
          <p>{{ t('读取系统信息与配置文件位置') }}</p>
        </div>
        <div
          v-else-if="
            error && !['about', 'references', 'translation', 'app-settings'].includes(page)
          "
          class="empty-view error-view"
        >
          <WifiOff :size="36" />
          <h2>{{ connected ? t('本机服务返回错误') : t('本机服务尚未连接') }}</h2>
          <p>{{ error }}</p>
          <code>{{ commandForPlatform }}</code
          ><button class="button primary" @click="guard.initialize">
            <RefreshCw :size="15" />{{ t('重新连接') }}
          </button>
        </div>

        <AppSettingsView
          v-else-if="page === 'app-settings'"
          :controller="applicationSettings"
          :version="appVersion"
          :busy="busy"
          :connected="connected"
        />

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
          @manual="openManualItem"
          @help="openHelp"
          @preview="guard.preview"
          @fix="guard.toggleFix"
          @references="openReferences"
          @source="openSource"
          @copy-error="guard.notify(t('无法自动复制，请手动选择命令。'), 'error')"
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

        <TranslationView
          v-else-if="page === 'translation'"
          :configuration="boot?.translation"
          :busy="busy"
          :connected="connected"
          :save="guard.saveTranslation"
          :test="guard.testTranslation"
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
          :desktop="desktopAvailable"
          @scan="guard.scanProject"
          @choose="chooseProject"
          @references="openProjectReferences"
          @focus="openProjectFinding"
        />

        <BackupsView
          v-else-if="page === 'backups'"
          :snapshots="boot?.snapshots ?? []"
          :backups="boot?.backups ?? []"
          :browser-languages="boot?.browserLanguages"
          :preview-browser-language="guard.previewBrowserLanguage"
          :apply-browser-language="guard.applyBrowserLanguage"
          :restore-browser-language="guard.restoreBrowserLanguage"
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
          :platform="boot?.machine.platform ?? ''"
          :timezone="guidanceTimezone(boot?.preferences ?? defaultPreferences, report)"
          :open-action="guard.openLocalAction"
          :busy="busy"
          :save="guard.saveManualReview"
          :reset="guard.resetManualReviews"
          @references="openManualReferences"
        />

        <SettingsView
          v-else-if="page === 'settings'"
          v-model="draft"
          :browser-languages="boot?.browserLanguages"
          :preview-browser-language="guard.previewBrowserLanguage"
          :apply-browser-language="guard.applyBrowserLanguage"
          :restore-browser-language="guard.restoreBrowserLanguage"
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
          :report="report"
          @settings="page = 'settings'"
          @copy="copyReferences"
          :project-findings="projectReport?.findings"
          :checks="report?.checks"
          @clear="referenceTarget = undefined"
          @project="openProjectFinding"
          @manual="openManualItem"
          @check="openCheck"
        />
        <footer class="page-footer">
          <span><ShieldCheck :size="12" />{{ t('CG Claude · 本地环境工具') }}</span
          ><button @click="page = 'about'">
            {{ t('检测范围与说明') }}<ArrowUpRight :size="12" />
          </button>
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
      :open-action="guard.openLocalAction"
      @manual="setupManual"
      @check="setupCheck"
      @scan="setupRecheck"
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
        /><span>{{ t(toast.message) }}</span
        ><button class="icon-button" :aria-label="t('关闭消息')" @click="toast = undefined">
          <X :size="15" />
        </button></div
    ></Transition>
  </div>
</template>
