<script setup lang="ts">
import { useUiText } from '../i18n'
import { projectFindingLabel } from '../lib/project-results'
import { computed, ref, watch } from 'vue'
import { BookOpen, Search, X, Copy } from '@lucide/vue'
import ArticleAuditPanel from '../components/ArticleAuditPanel.vue'
import ReferenceCard from '../components/ReferenceCard.vue'
import {
  references,
  referenceKindLabels,
  referenceTopicLabels,
  matchesReferenceTarget,
  referenceMarkdown,
} from '../../shared/references'
import type { ReferenceKind, ReferenceTopic, ReferenceTarget } from '../../shared/references'
import { manualItems } from '../../shared/types'
import type { CheckResult, ProjectFinding, ScanReport } from '../../shared/types'

const { t } = useUiText()

const props = defineProps<{
  target?: ReferenceTarget
  report?: ScanReport
  checks?: CheckResult[]
  projectFindings?: ProjectFinding[]
}>()
const emit = defineEmits<{
  settings: []
  clear: []
  check: [id: string]
  project: [id: string]
  manual: [id: string]
  copy: [text: string]
}>()
const latestReview =
  references
    .map((entry) => entry.checkedAt)
    .sort()
    .at(-1) ?? '尚未核对'
const query = ref('')
const kind = ref<ReferenceKind | 'all'>('all')
const topic = ref<ReferenceTopic | 'all'>('all')
const readingMode = ref<'compact' | 'full'>('compact')
watch(
  () => props.target,
  () => {
    query.value = ''
    kind.value = 'all'
    topic.value = 'all'
    readingMode.value = 'compact'
  },
)
const selectedTitle = computed(() => {
  if (!props.target) return ''
  if (props.target.scope === 'source')
    return references.find((entry) => entry.id === props.target?.id)?.title ?? props.target.id
  if (props.target.scope === 'manual')
    return manualItems.find((item) => item.id === props.target?.id)?.title ?? props.target.id
  if (props.target.scope === 'project') {
    const finding = props.projectFindings?.find((item) => item.id === props.target?.id)
    return finding ? projectFindingLabel(finding) : props.target.id
  }
  return props.checks?.find((item) => item.id === props.target?.id)?.title ?? props.target.id
})
const filtered = computed(() =>
  references.filter(
    (entry) =>
      matchesReferenceTarget(entry, props.target) &&
      (kind.value === 'all' || entry.kind === kind.value) &&
      (topic.value === 'all' || entry.topic === topic.value) &&
      [entry.title, entry.publisher, entry.takeaway, entry.application, entry.boundary, entry.url]
        .join(' ')
        .toLowerCase()
        .includes(query.value.trim().toLowerCase()),
  ),
)
function clearFilters() {
  query.value = ''
  kind.value = 'all'
  topic.value = 'all'
  emit('clear')
}
</script>
<template>
  <section id="reference-intro" tabindex="-1" class="reference-intro data-panel">
    <BookOpen :size="24" />
    <div>
      <strong>{{ references.length }} {{ t('条来源') }}</strong>
      <p>{{ t('官方文档与社区记录') }}</p>
    </div>
    <span class="reference-updated">{{ t('核对') }} {{ latestReview }}</span>
  </section>
  <ArticleAuditPanel
    v-if="!target || (target.scope === 'source' && target.id === 'ayi-guide')"
    :report="report"
    :project-findings="projectFindings"
    :expanded="target?.scope === 'source' && target.id === 'ayi-guide'"
    @check="emit('check', $event)"
    @project="emit('project', $event)"
    @manual="emit('manual', $event)"
    @settings="emit('settings')"
  />
  <div class="reference-toolbar" role="search" :aria-label="t('文献检索工具')">
    <label class="search-field"
      ><Search :size="16" /><input
        v-model="query"
        :aria-label="t('搜索参考文献')"
        :placeholder="t('搜索文献、发布者或配置名称')" /><button
        v-if="query"
        class="icon-button"
        :aria-label="t('清除文献搜索')"
        @click="query = ''"
      >
        <X :size="15" /></button
    ></label>
    <label class="reference-select"
      ><span>{{ t('来源') }}</span
      ><select v-model="kind" :aria-label="t('文献来源')">
        <option value="all">{{ t('全部来源') }}</option>
        <option v-for="(label, id) in referenceKindLabels" :key="id" :value="id">
          {{ t(label) }}
        </option>
      </select></label
    >
    <label class="reference-select"
      ><span>{{ t('主题') }}</span
      ><select v-model="topic" :aria-label="t('文献主题')">
        <option value="all">{{ t('全部主题') }}</option>
        <option v-for="(label, id) in referenceTopicLabels" :key="id" :value="id">
          {{ t(label) }}
        </option>
      </select></label
    >
  </div>
  <div v-if="target" id="reference-context" tabindex="-1" class="reference-focus">
    <span
      >{{ target.scope === 'source' ? t('正在阅读') : t('正在查看依据') }}：{{
        selectedTitle
      }}</span
    ><button class="text-link" @click="emit('clear')">
      {{ t('查看全部文献') }}<X :size="14" />
    </button>
  </div>
  <div class="reference-reading-bar">
    <div class="reference-reading-options" role="group" :aria-label="t('文献阅读方式')">
      <button :aria-pressed="readingMode === 'compact'" @click="readingMode = 'compact'">
        {{ t('精简') }}
      </button>
      <button :aria-pressed="readingMode === 'full'" @click="readingMode = 'full'">
        {{ t('详细') }}
      </button>
    </div>
    <button
      class="text-link"
      :disabled="!filtered.length"
      @click="emit('copy', referenceMarkdown(filtered))"
    >
      <Copy :size="14" />{{ t('复制引用') }}
    </button>
  </div>
  <p class="reference-count" role="status">
    {{ filtered.length }} / {{ references.length }} {{ t('条来源') }}
  </p>
  <section v-if="!filtered.length" class="data-panel result-empty">
    <BookOpen :size="26" />
    <h3>{{ t('没有找到相关文献') }}</h3>
    <p>{{ t('试试“代理”“认证”或“隐私”，也可以清除筛选。') }}</p>
    <button class="text-link" @click="clearFilters">{{ t('清除筛选') }}</button>
  </section>
  <div class="reference-list">
    <ReferenceCard
      v-for="entry in filtered"
      :key="entry.id"
      :entry="entry"
      :full="readingMode === 'full'"
      :checks="checks"
      :project-findings="projectFindings"
      @check="emit('check', $event)"
      @project="emit('project', $event)"
      @manual="emit('manual', $event)"
      @copy="emit('copy', $event)"
    />
  </div>
</template>
