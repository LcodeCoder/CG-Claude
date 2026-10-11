<script setup lang="ts">
import { useUiText } from '../i18n'
import { formatDiagnosticCopy } from '../i18n/diagnostics'
import { samePreferences } from '../../shared/types'
import { usageModeLabel } from '../../shared/usage-modes'
import { DIAGNOSTIC_RULESET } from '../../shared/diagnostic-checks'
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
  History,
  LoaderCircle,
  LockKeyhole,
  Puzzle,
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

const { t } = useUiText()

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
  manual: [id?: string]
  help: []
  preview: []
  fix: [id: FixId]
  references: [id: string]
  source: [id: string]
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
            (t(check.title) + formatDiagnosticCopy(check.summary) + t(check.description))
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
  return [
    t(inProgress),
    t('当前显示 {count} 项{label}', { count, label: t(labels[filters.value.status]) }),
    opened ? t('已展开{title}', { title: t(opened.title) }) : '',
  ]
    .filter(Boolean)
    .join(' · ')
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
    !samePreferences(props.report?.preferences, props.preferences),
)
const reportRulesChanged = computed(() =>
  Boolean(props.report && props.report.ruleset !== DIAGNOSTIC_RULESET),
)
// One reason list and one action prevent stacked, competing recheck notices.
const recheckReasons = computed(() => {
  const reasons: string[] = []
  if (reportPreferencesChanged.value) reasons.push('检测偏好已更改')
  if (reportRulesChanged.value) reasons.push('检测规则已更新')
  if (props.reportConfigurationChanged && !isHistorical.value) reasons.push('本机配置已变化')
  return reasons
})
const reportedUsageMode = computed(
  () => props.report?.preferences.usageMode ?? props.preferences?.usageMode ?? 'official',
)
const stateHeading = computed(() =>
  !props.report
    ? '尚未检测'
    : issueCount.value
      ? t('{count} 项需要关注', { count: issueCount.value })
      : '检测完成',
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
  <div v-if="isHistorical" class="notice info-notice">
    <History :size="16" /><span
      >{{ t('正在查看') }} {{ formatDate(report!.completedAt) }} {{ t('的历史检测。') }}</span
    ><button class="text-link" @click="emit('latest')">
      <ArrowLeft :size="13" />{{ t('返回最新结果') }}
    </button>
  </div>
  <div v-if="recheckReasons.length" class="notice info-notice">
    <CircleHelp :size="16" /><span>{{ recheckReasons.join(' · ') }}{{ t('，请重新检测。') }}</span>
    <button class="text-link" :disabled="busy" @click="emit('scan')">{{ t('重新检测') }}</button>
  </div>
  <div v-if="lastAction" class="notice success-notice">
    <CircleCheck :size="16" /><span>{{ lastAction }}</span
    ><button class="icon-button" :aria-label="t('关闭修复提醒')" @click="lastAction = ''">
      <X :size="14" />
    </button>
  </div>
  <section class="environment-overview">
    <div class="overview-intro">
      <div class="overview-symbol"><Activity :size="25" :stroke-width="1.6" /></div>
      <div>
        <h2>{{ scanning ? t('正在检测') : t(stateHeading) }}</h2>
        <p v-if="report && !scanning">
          {{ formatDate(report.completedAt, true) }}<span class="inline-divider" />{{
            report.networkEnabled ? t('含公网检测') : t('本机检测')
          }}
        </p>
        <p v-else-if="scanning">{{ t(progress.current) }}</p>
        <p v-else>{{ t('检查配置、时区与连接状态。') }}</p>
      </div>
      <div class="overview-links">
        <a
          class="button secondary browser-plugin-entry"
          href="https://github.com/LcodeCoder/LC-time"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Puzzle :size="16" />{{ t('浏览器环境配置插件') }}
        </a>
        <span class="overview-mode">{{ t(usageModeLabel(reportedUsageMode)) }}</span>
        <button class="text-link" @click="emit('source', 'ayi-guide')">
          {{ t('原文对照') }}<ArrowUpRight :size="13" />
        </button>
      </div>
    </div>
    <div
      v-if="scanning"
      class="scan-progress"
      role="progressbar"
      :aria-valuenow="percentage"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="formatDiagnosticCopy(progress.current)"
    >
      <span :style="{ width: percentage + '%' }" /><small
        >{{ progress.completed }} / {{ progress.total }} {{ t('项') }}</small
      >
    </div>
    <div v-if="report" class="overview-counts" :aria-label="t('检测结果快捷入口')">
      <button
        class="count-link"
        :class="{ active: report && filters.status === 'pass' }"
        :disabled="!report"
        :aria-label="t('查看 {count} 项检查通过的详情', { count: report.counts.pass })"
        :aria-pressed="Boolean(report && filters.status === 'pass')"
        aria-controls="results-panel"
        @click="openResults('pass')"
      >
        <CircleCheck :size="18" /><strong>{{ report?.counts.pass ?? '—' }}</strong
        ><span>{{ t('检查通过') }}</span
        ><ChevronRight class="count-link-arrow" :size="14" />
      </button>
      <button
        class="count-link issue-count"
        :class="{ active: report && filters.status === 'issues' }"
        :disabled="!report"
        :aria-label="t('查看 {count} 项需要关注的详情', { count: issueCount })"
        :aria-pressed="Boolean(report && filters.status === 'issues')"
        aria-controls="results-panel"
        @click="openResults('issues')"
      >
        <TriangleAlert :size="18" /><strong>{{ report ? issueCount : '—' }}</strong
        ><span>{{ t('需要关注') }}</span
        ><ChevronRight class="count-link-arrow" :size="14" />
      </button>
      <button
        class="count-link pending-count"
        :class="{ active: report && filters.status === 'manual' }"
        :disabled="!report"
        :aria-label="t('查看 {count} 项待确认或未检测的详情', { count: pendingCount })"
        :aria-pressed="Boolean(report && filters.status === 'manual')"
        aria-controls="results-panel"
        @click="openResults('manual')"
      >
        <CircleHelp :size="18" /><strong>{{ report ? pendingCount : '—' }}</strong
        ><span>{{ t('待确认') }}</span
        ><ChevronRight class="count-link-arrow" :size="14" />
      </button>
      <div class="count-note">
        <LockKeyhole :size="14" /><span>{{ t('账号状态需人工核对') }}</span>
      </div>
    </div>
  </section>
  <NetworkPath v-if="report" :report="report" :machine="machine" :scanning="scanning" />
  <div class="results-layout" :class="{ 'without-report': !report }">
    <section id="results-panel" ref="resultsPanel" class="results-panel" tabindex="-1">
      <div class="results-heading">
        <div>
          <h2>
            {{ t('检测详情') }} <span v-if="report">{{ report.checks.length }}</span>
          </h2>
          <p v-if="report && scanning">{{ t('检测中 · 显示上次结果') }}</p>
        </div>
        <button class="icon-button" :aria-label="t('设置检测偏好')" @click="emit('settings')">
          <SlidersHorizontal :size="17" />
        </button>
      </div>
      <p class="sr-only" role="status" aria-live="polite">{{ resultNavigation }}</p>
      <div v-if="report" class="result-filters">
        <div class="filter-tabs" :aria-label="t('按结果筛选')">
          <button
            v-for="filter in [
              { id: 'all', label: t('全部') },
              { id: 'issues', label: t('需关注') },
              { id: 'manual', label: t('待确认') },
              { id: 'pass', label: t('已通过') },
            ] as const"
            :key="filter.id"
            :class="{ active: filters.status === filter.id }"
            :aria-pressed="filters.status === filter.id"
            @click="filters.status = filter.id"
          >
            {{ t(filter.label)
            }}<span v-if="filter.id === 'issues' && report">{{ issueCount }}</span>
          </button>
        </div>
        <label class="search-box"
          ><Search :size="14" /><input
            v-model="filters.query"
            :aria-label="t('搜索检测项')"
            :placeholder="t('搜索检测项')"
        /></label>
      </div>
      <div v-if="report" class="category-filters" :aria-label="t('按类别筛选')">
        <button :class="{ active: filters.category === 'all' }" @click="filters.category = 'all'">
          {{ t('所有类别') }}</button
        ><button
          v-for="(label, id) in categoryLabels"
          :key="id"
          :class="{ active: filters.category === id }"
          @click="filters.category = id"
        >
          {{ t(label) }}
        </button>
      </div>
      <div v-if="!report" class="result-empty">
        <LoaderCircle v-if="scanning" class="spin" :size="35" />
        <ScanLine v-else :size="35" />
        <h3>{{ scanning ? t('正在检测本机配置') : t('还没有检测结果') }}</h3>
        <p v-if="scanning">{{ t('检测完成后，这里会显示检查证据和处理建议。') }}</p>
        <p v-else>{{ t('检查结果和处理方法会显示在这里。') }}</p>
        <button v-if="!scanning" class="button secondary" :disabled="busy" @click="emit('scan')">
          {{ t('开始检测') }}
        </button>
      </div>
      <div v-else-if="!groups.length" class="result-empty small">
        <Search :size="26" />
        <h3>
          {{
            !filters.query && filters.category === 'all' && filters.status !== 'all'
              ? {
                  issues: t('当前没有需要关注的检测项'),
                  manual: t('当前没有待确认或未检测的项目'),
                  pass: t('当前没有已通过的检测项'),
                }[filters.status]
              : t('没有符合条件的检测项')
          }}
        </h3>
        <button class="text-link" @click="showAllResults">{{ t('显示全部结果') }}</button>
      </div>
      <div v-for="group in groups" v-else :key="group.id" class="check-group">
        <div class="group-heading">
          <h3>{{ t(group.label) }}</h3>
          <span>{{ group.checks.length }} {{ t('项') }}</span>
        </div>
        <CheckRow
          v-for="check in group.checks"
          :key="check.id"
          :check="check"
          :expanded="filters.expanded === check.id"
          @manual="emit('manual', $event)"
          @settings="emit('settings')"
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
        <ShieldCheck :size="13" />{{ t('本机读取 · 凭据已隐藏') }}
      </div>
    </section>
    <aside v-if="report" class="repair-sidebar">
      <section class="repair-panel">
        <div class="repair-panel-heading">
          <span class="repair-icon"><Wrench :size="18" /></span>
          <h2>{{ t('配置修复') }}</h2>
          <span class="small-count">{{ availableFixes.length }}</span>
        </div>
        <p>{{ t('选择配置后预览修改。') }}</p>
        <div v-if="availableFixes.length" class="repair-options">
          <label v-for="id in availableFixes" :key="id"
            ><input
              type="checkbox"
              :checked="selected.includes(id)"
              :disabled="busy"
              @change="emit('fix', id)"
            /><span>{{ t(fixLabels[id]) }}</span></label
          ><button class="text-link select-all" :disabled="busy" @click="selectAll">
            {{ selected.length === availableFixes.length ? t('取消全选') : t('选择全部') }}
          </button>
        </div>
        <div v-else class="repair-empty">
          <CircleCheck :size="23" /><span>{{
            isHistorical
              ? t('请返回最新结果后选择修复')
              : recheckReasons.length
                ? t('重新检测后显示可修复项目')
                : report
                  ? t('没有可自动修复的项目')
                  : t('检测后显示可修复项目')
          }}</span>
        </div>
        <button
          class="button primary full-width"
          :disabled="!selected.length || busy"
          @click="emit('preview')"
        >
          <LoaderCircle v-if="working" class="spin" :size="15" /><Wrench v-else :size="15" />{{
            t('预览修复')
          }}<span v-if="selected.length">({{ selected.length }})</span>
        </button>
        <div class="repair-assurance">
          <ArchiveRestore :size="14" /><span>{{ t('修复前备份，支持恢复') }}</span>
        </div>
      </section>
      <section class="manual-tip">
        <span class="manual-tip-icon"><CircleHelp :size="19" /></span>
        <h3>{{ t('人工复核') }}</h3>
        <p>{{ t('DNS 出口、登录设备、服务地区。') }}</p>
        <button class="text-link" @click="emit('manual')">
          {{ t('查看待确认项') }}<ArrowUpRight :size="14" />
        </button>
        <button class="text-link help-entry" @click="emit('help')">
          {{ t('按错误类型排查') }}<ArrowUpRight :size="14" />
        </button>
      </section>
      <a
        class="source-link"
        href="https://x.com/AYi_AInotes/status/2106639522586829094"
        target="_blank"
        rel="noopener noreferrer"
        ><BookOpen :size="14" /><span>{{ t('查看参考文章') }}</span
        ><ArrowUpRight :size="13"
      /></a>
    </aside>
  </div>
</template>
