<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import {
  Activity,
  ArchiveRestore,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  FolderCog,
  History,
  Info,
  LoaderCircle,
  LockKeyhole,
  ScanLine,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Wrench,
  X,
} from '@lucide/vue'
import { categoryLabels, fixLabels } from '../../shared/types'
import type { Category, FixId, Machine, Preferences, ScanReport } from '../../shared/types'
import CheckRow from '../components/CheckRow.vue'
import NetworkPath from '../components/NetworkPath.vue'
import { formatDate } from '../lib/format'
import { focusResult } from '../lib/navigation'
import type { ResultFilter, ResultFilters } from '../lib/environment-results'

const props = defineProps<{
  report?: ScanReport
  latestReport?: ScanReport
  machine?: Machine
  preferences?: Preferences
  demo: boolean
  busy: boolean
  scanning: boolean
  working: boolean
  progress: { completed: number; total: number; current: string }
  reportConfigurationChanged: boolean
  canRepair: boolean
  availableFixes: FixId[]
}>()
const filters = defineModel<ResultFilters>('filters', { required: true })
const selected = defineModel<FixId[]>('selected', { required: true })
const lastAction = defineModel<string>('lastAction', { required: true })
const emit = defineEmits<{
  scan: []
  latest: []
  settings: []
  manual: []
  help: []
  preview: []
  fix: [id: FixId]
  references: [id: string]
  copyError: []
}>()
const resultsPanel = ref<HTMLElement>()
const groups = computed(() =>
  Object.entries(categoryLabels)
    .map(([id, label]) => ({
      id: id as Category,
      label,
      checks:
        props.report?.checks.filter((check) => {
          const matches =
            check.category === id &&
            (filters.value.category === 'all' || filters.value.category === id)
          const text =
            !filters.value.query ||
            (check.title + check.summary + check.description)
              .toLowerCase()
              .includes(filters.value.query.toLowerCase())
          const status =
            filters.value.status === 'all' ||
            (filters.value.status === 'issues' && ['warn', 'fail'].includes(check.status)) ||
            (filters.value.status === 'manual' && ['manual', 'skipped'].includes(check.status)) ||
            (filters.value.status === 'pass' && check.status === 'pass')
          return matches && text && status
        }) ?? [],
    }))
    .filter((group) => group.checks.length),
)
const resultNavigation = computed(() => {
  if (!props.report) return ''
  const labels = { all: '检测项', pass: '检查通过', issues: '需要关注', manual: '待确认 / 未检测' }
  const count = groups.value.reduce((total, group) => total + group.checks.length, 0)
  const opened = groups.value
    .flatMap((group) => group.checks)
    .find((check) => check.id === filters.value.expanded)
  const inProgress = props.scanning ? '正在检测；下方保留最近已完成的结果。' : ''
  return `${inProgress}当前显示 ${count} 项${labels[filters.value.status]}${opened ? `，已展开${opened.title}` : ''}`
})

const issueCount = computed(() =>
  props.report ? props.report.counts.warn + props.report.counts.fail : 0,
)
const pendingCount = computed(() =>
  props.report ? props.report.counts.manual + props.report.counts.skipped : 0,
)
const percentage = computed(() =>
  Math.round((props.progress.completed / Math.max(props.progress.total, 1)) * 100),
)
const isHistorical = computed(() =>
  Boolean(props.report && props.latestReport && props.report.id !== props.latestReport.id),
)
const reportPreferencesChanged = computed(
  () =>
    Boolean(props.report && props.preferences) &&
    JSON.stringify(props.report?.preferences) !== JSON.stringify(props.preferences),
)
const reportedUsageMode = computed(
  () => props.report?.preferences.usageMode ?? props.preferences?.usageMode ?? 'official',
)
const stateHeading = computed(() =>
  !props.report
    ? '先做一次检查，了解当前环境'
    : issueCount.value
      ? `有 ${issueCount.value} 项配置值得关注`
      : '已检查的配置符合当前偏好',
)

function selectAll() {
  selected.value =
    selected.value.length === props.availableFixes.length ? [] : [...props.availableFixes]
}
function showAllResults() {
  filters.value = { ...filters.value, status: 'all', category: 'all', query: '' }
}
async function openResults(status: Exclude<ResultFilter, 'all'>) {
  if (!props.report) return
  filters.value = { ...filters.value, category: 'all', query: '', status }
  // The model is owned by App; wait for its prop update before choosing a row.
  await nextTick()
  const first = groups.value[0]?.checks[0]
  filters.value.expanded = first?.id ?? ''
  await nextTick()
  await focusResult(first ? document.getElementById('check-' + first.id) : resultsPanel.value)
}
</script>
<template>
  <div v-if="demo" class="notice info-notice">
    <Info :size="16" /><span
      >正在检测隔离测试目录。这里的配置可用于验证修复流程，你的日常配置不会被修改。</span
    >
  </div>
  <div v-if="isHistorical" class="notice info-notice">
    <History :size="16" /><span>正在查看 {{ formatDate(report!.completedAt) }} 的历史检测。</span
    ><button class="text-link" @click="emit('latest')"><ArrowLeft :size="13" />返回最新结果</button>
  </div>
  <div v-if="reportPreferencesChanged" class="notice info-notice">
    <CircleHelp :size="16" /><span
      >检测偏好已变化，当前结果仍使用检测时的偏好。重新检测后才能预览修复。</span
    >
    <button class="text-link" :disabled="busy" @click="emit('scan')">重新检测</button>
  </div>
  <div v-if="reportConfigurationChanged && !isHistorical" class="notice info-notice">
    <FolderCog :size="16" /><span>{{
      report?.configurationFingerprint
        ? '用户配置文件已在检测后变化。当前记录仍可查看，重新检测后才能预览诊断修复。'
        : '这份旧记录没有配置基线。重新检测后才能预览诊断修复。'
    }}</span>
    <button class="text-link" :disabled="busy" @click="emit('scan')">重新检测</button>
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
          最近检测 {{ formatDate(report.completedAt, true) }}<span class="inline-divider" />{{
            report.networkEnabled ? '含公网检测' : '本机配置检测'
          }}<span class="inline-divider" />{{ machine?.hostname }}
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
        :class="{ active: report && filters.status === 'pass' }"
        :disabled="!report"
        :aria-label="`查看 ${report?.counts.pass ?? 0} 项检查通过的详情`"
        :aria-pressed="Boolean(report && filters.status === 'pass')"
        aria-controls="results-panel"
        @click="openResults('pass')"
      >
        <CircleCheck :size="18" /><strong>{{ report?.counts.pass ?? '—' }}</strong
        ><span>检查通过</span><ChevronRight class="count-link-arrow" :size="14" />
      </button>
      <button
        class="count-link issue-count"
        :class="{ active: report && filters.status === 'issues' }"
        :disabled="!report"
        :aria-label="`查看 ${issueCount} 项需要关注的详情`"
        :aria-pressed="Boolean(report && filters.status === 'issues')"
        aria-controls="results-panel"
        @click="openResults('issues')"
      >
        <TriangleAlert :size="18" /><strong>{{ report ? issueCount : '—' }}</strong
        ><span>需要关注</span><ChevronRight class="count-link-arrow" :size="14" />
      </button>
      <button
        class="count-link pending-count"
        :class="{ active: report && filters.status === 'manual' }"
        :disabled="!report"
        :aria-label="`查看 ${pendingCount} 项待确认或未检测的详情`"
        :aria-pressed="Boolean(report && filters.status === 'manual')"
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
  <NetworkPath :report="report" :machine="machine" :scanning="scanning" />
  <div class="results-layout">
    <section id="results-panel" ref="resultsPanel" class="results-panel" tabindex="-1">
      <div class="results-heading">
        <div>
          <h2>
            检测详情 <span v-if="report">{{ report.checks.length }}</span>
          </h2>
          <p>
            {{
              report && scanning
                ? '正在检测；下方保留最近已完成的结果。'
                : '查看证据，再决定如何处理。'
            }}
          </p>
        </div>
        <button class="icon-button" aria-label="设置检测偏好" @click="emit('settings')">
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
            :class="{ active: filters.status === filter.id }"
            :aria-pressed="filters.status === filter.id"
            @click="filters.status = filter.id"
          >
            {{ filter.label }}<span v-if="filter.id === 'issues' && report">{{ issueCount }}</span>
          </button>
        </div>
        <label class="search-box"
          ><Search :size="14" /><input
            v-model="filters.query"
            aria-label="搜索检测项"
            placeholder="搜索检测项"
        /></label>
      </div>
      <div class="category-filters" aria-label="按类别筛选">
        <button :class="{ active: filters.category === 'all' }" @click="filters.category = 'all'">
          所有类别</button
        ><button
          v-for="(label, id) in categoryLabels"
          :key="id"
          :class="{ active: filters.category === id }"
          @click="filters.category = id"
        >
          {{ label }}
        </button>
      </div>
      <div v-if="!report" class="result-empty">
        <LoaderCircle v-if="scanning" class="spin" :size="35" />
        <ScanLine v-else :size="35" />
        <h3>{{ scanning ? '正在检测本机配置' : '还没有检测结果' }}</h3>
        <p v-if="scanning">检测完成后，这里会显示检查证据和处理建议。</p>
        <p v-else>点击「开始检测」，检查实际本机配置。<br />默认不进行外部网络查询。</p>
        <button v-if="!scanning" class="button secondary" :disabled="busy" @click="emit('scan')">
          开始第一次检测
        </button>
      </div>
      <div v-else-if="!groups.length" class="result-empty small">
        <Search :size="26" />
        <h3>
          {{
            !filters.query && filters.category === 'all' && filters.status !== 'all'
              ? {
                  issues: '当前没有需要关注的检测项',
                  manual: '当前没有待确认或未检测的项目',
                  pass: '当前没有已通过的检测项',
                }[filters.status]
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
          :expanded="filters.expanded === check.id"
          :selected="selected"
          :disabled="busy || !canRepair"
          :platform="machine?.platform"
          @toggle="filters.expanded = filters.expanded === check.id ? '' : check.id"
          @fix="emit('fix', $event)"
          @references="emit('references', check.id)"
          @copy-error="emit('copyError')"
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
              @change="emit('fix', id)"
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
          @click="emit('preview')"
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
        <button class="text-link" @click="emit('manual')">
          打开人工复核<ArrowUpRight :size="14" />
        </button>
        <button class="text-link help-entry" @click="emit('help')">
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
