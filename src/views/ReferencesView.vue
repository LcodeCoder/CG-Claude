<script setup lang="ts">
import { projectFindingLabel } from '../lib/project-results'
import { computed, ref, watch } from 'vue'
import { BookOpen, Search, X, Copy } from '@lucide/vue'
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
import type { CheckResult, ProjectFinding } from '../../shared/types'
const props = defineProps<{
  target?: ReferenceTarget
  checks?: CheckResult[]
  projectFindings?: ProjectFinding[]
}>()
const emit = defineEmits<{
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
const readingMode = ref<'summary' | 'full'>(props.target ? 'full' : 'summary')
watch(
  () => props.target,
  () => {
    query.value = ''
    kind.value = 'all'
    topic.value = 'all'
    readingMode.value = props.target ? 'full' : 'summary'
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
      <h2>每个建议，都可以追溯出处</h2>
      <p>
        优先采用当前官方说明，社区实践用于补充排查线索。查看采用方式与判断边界，再决定是否适合你的环境。
      </p>
    </div>
    <span class="reference-updated"
      >最近核对<br /><strong>{{ latestReview }}</strong></span
    >
  </section>
  <div class="reference-toolbar" role="search" aria-label="文献检索工具">
    <label class="search-field"
      ><Search :size="16" /><input
        v-model="query"
        aria-label="搜索参考文献"
        placeholder="搜索文献、发布者或配置名称" /><button
        v-if="query"
        class="icon-button"
        aria-label="清除文献搜索"
        @click="query = ''"
      >
        <X :size="15" /></button
    ></label>
    <label class="reference-select"
      ><span>来源</span
      ><select v-model="kind" aria-label="文献来源">
        <option value="all">全部来源</option>
        <option v-for="(label, id) in referenceKindLabels" :key="id" :value="id">
          {{ label }}
        </option>
      </select></label
    >
    <label class="reference-select"
      ><span>主题</span
      ><select v-model="topic" aria-label="文献主题">
        <option value="all">全部主题</option>
        <option v-for="(label, id) in referenceTopicLabels" :key="id" :value="id">
          {{ label }}
        </option>
      </select></label
    >
  </div>
  <div v-if="target" id="reference-context" tabindex="-1" class="reference-focus">
    <span>{{ target.scope === 'source' ? '正在阅读' : '正在查看依据' }}：{{ selectedTitle }}</span
    ><button class="text-link" @click="emit('clear')">查看全部文献<X :size="14" /></button>
  </div>
  <div class="reference-reading-bar">
    <div class="reference-reading-options" role="group" aria-label="文献阅读方式">
      <span>阅读方式</span>
      <button :aria-pressed="readingMode === 'summary'" @click="readingMode = 'summary'">
        摘要浏览
      </button>
      <button :aria-pressed="readingMode === 'full'" @click="readingMode = 'full'">完整阅读</button>
    </div>
    <button
      class="text-link"
      :disabled="!filtered.length"
      @click="emit('copy', referenceMarkdown(filtered))"
    >
      <Copy :size="14" />复制当前 {{ filtered.length }} 条文献
    </button>
  </div>
  <p class="reference-count" role="status">
    显示 {{ filtered.length }} / {{ references.length }} 条参考文献 ·
    摘要随应用保存在本机，原文链接在外部浏览器打开
  </p>
  <section v-if="!filtered.length" class="data-panel result-empty">
    <BookOpen :size="26" />
    <h3>没有找到相关文献</h3>
    <p>试试“代理”“认证”或“隐私”，也可以清除筛选。</p>
    <button class="text-link" @click="clearFilters">清除筛选</button>
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
