<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowRight, ChevronRight, GitCompareArrows, History, Info } from '@lucide/vue'
import type { ScanReport } from '../../shared/types'
import { statusLabels } from '../../shared/types'
import { compareReports, reportChangeLabels } from '../../shared/report-comparison'
const props = defineProps<{ reports: ScanReport[] }>()
const emit = defineEmits<{
  open: [report: ScanReport]
  check: [report: ScanReport, id: string]
  scan: []
}>()
const beforeId = ref('')
const afterId = ref('')
watch(
  () => props.reports,
  (reports) => {
    if (!reports.some((report) => report.id === afterId.value)) afterId.value = reports[0]?.id ?? ''
    if (!reports.some((report) => report.id === beforeId.value))
      beforeId.value = reports[1]?.id ?? ''
  },
  { immediate: true },
)
const before = computed(() => props.reports.find((report) => report.id === beforeId.value))
const after = computed(() => props.reports.find((report) => report.id === afterId.value))
const comparison = computed(() =>
  before.value && after.value && before.value.id !== after.value.id
    ? compareReports(before.value, after.value)
    : undefined,
)
function dateLabel(date: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(date))
}
function selectLabel(report: ScanReport) {
  return `${dateLabel(report.completedAt)} · ${report.networkEnabled ? '本机 + 公网' : '本机配置'} · ${report.checks.length} 项`
}
</script>
<template>
  <section v-if="reports.length > 1" class="data-panel comparison-panel">
    <div class="panel-heading">
      <h2><GitCompareArrows :size="19" />两次检测，哪里变了</h2>
      <span class="quiet-text">只对比已记录的结果</span>
    </div>
    <div class="comparison-picker">
      <label
        >之前<select v-model="beforeId" aria-label="之前的检测记录">
          <option v-for="report in reports" :key="report.id" :value="report.id">
            {{ selectLabel(report) }}
          </option>
        </select></label
      >
      <ArrowRight :size="18" />
      <label
        >之后<select v-model="afterId" aria-label="之后的检测记录">
          <option v-for="report in reports" :key="report.id" :value="report.id">
            {{ selectLabel(report) }}
          </option>
        </select></label
      >
    </div>
    <template v-if="comparison">
      <p
        v-if="
          comparison.preferencesChanged ||
          comparison.networkScopeChanged ||
          comparison.detectionRulesChanged
        "
        class="comparison-note"
      >
        <Info :size="16" />{{ comparison.preferencesChanged ? '两次检测偏好不同。' : ''
        }}{{ comparison.networkScopeChanged ? '两次公网检测开关不同。' : ''
        }}{{
          comparison.detectionRulesChanged ? '检测规则或覆盖范围已变化。' : ''
        }}结果变化可能来自检测条件，请结合证据核对。
      </p>
      <div class="comparison-counts" role="status">
        <span
          ><strong>{{ comparison.counts['new-attention'] }}</strong> 新关注</span
        ><span
          ><strong>{{ comparison.counts['now-passing'] }}</strong> 现已通过</span
        ><span
          ><strong>{{ comparison.changes.length }}</strong> 项变化</span
        ><span>{{ comparison.unchanged }} 项一致</span>
      </div>
      <p v-if="!comparison.changes.length" class="comparison-empty">两次检测的状态和证据一致。</p>
      <div v-else class="comparison-list">
        <article v-for="change in comparison.changes" :key="change.id" class="comparison-row">
          <div class="comparison-title">
            <span :class="['comparison-label', change.kind]">{{
              reportChangeLabels[change.kind]
            }}</span
            ><strong>{{ change.title }}</strong>
          </div>
          <div class="comparison-values">
            <p>
              <span>之前 · {{ change.before ? statusLabels[change.before.status] : '未包含' }}</span
              >{{ change.before?.summary ?? '之前没有这项结果' }}
            </p>
            <ArrowRight :size="15" />
            <p>
              <span>之后 · {{ change.after ? statusLabels[change.after.status] : '未包含' }}</span
              >{{ change.after?.summary ?? '本次没有这项结果' }}
            </p>
          </div>
          <button
            v-if="change.after && after"
            class="text-link"
            @click="emit('check', after, change.id)"
          >
            查看之后的证据<ChevronRight :size="14" />
          </button>
          <button v-else-if="before" class="text-link" @click="emit('check', before, change.id)">
            查看之前的证据<ChevronRight :size="14" />
          </button>
        </article>
      </div>
    </template>
    <p v-else class="comparison-empty">选择两条不同的记录进行比较。</p>
  </section>
  <section class="data-panel">
    <div class="panel-heading">
      <h2>检测记录</h2>
      <span class="quiet-text">{{ reports.length }} / 30 次</span>
    </div>
    <div v-if="!reports.length" class="empty-view">
      <History :size="35" />
      <h2>还没有检测记录</h2>
      <p>完成检测后，结果会自动保存在本机。</p>
      <button class="button primary" @click="emit('scan')">开始检测</button>
    </div>
    <div v-else class="history-table">
      <div class="table-header">
        <span>检测时间</span><span>检测范围</span><span>检测结果</span><span />
      </div>
      <button
        v-for="(report, index) in reports"
        :key="report.id"
        class="history-row"
        @click="emit('open', report)"
      >
        <span class="history-date"
          ><span class="history-date-icon"><History :size="16" /></span
          >{{ dateLabel(report.completedAt) }}<small v-if="index === 0">最新</small></span
        ><span>{{ report.networkEnabled ? '本机 + 公网出口' : '本机配置' }}</span
        ><span class="history-result"
          ><span class="positive">{{ report.counts.pass }} 通过</span
          ><span v-if="report.counts.warn + report.counts.fail" class="attention"
            >{{ report.counts.warn + report.counts.fail }} 需关注</span
          ><span>{{ report.counts.manual + report.counts.skipped }} 待确认</span></span
        ><ChevronRight :size="16" />
      </button>
    </div>
  </section>
</template>
