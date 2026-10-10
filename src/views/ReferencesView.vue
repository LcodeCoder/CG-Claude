<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BookOpen, ExternalLink, Search, X, ArrowUpRight } from '@lucide/vue'
import {
  references,
  referenceKindLabels,
  referenceTopicLabels,
  matchesReferenceTarget,
} from '../../shared/references'
import type { ReferenceKind, ReferenceTopic, ReferenceTarget } from '../../shared/references'
import type { CheckResult, ProjectFinding } from '../../shared/types'
const props = defineProps<{
  target?: ReferenceTarget
  checks?: CheckResult[]
  projectFindings?: ProjectFinding[]
}>()
const emit = defineEmits<{ clear: []; check: [id: string]; project: [id: string] }>()
const query = ref('')
const kind = ref<ReferenceKind | 'all'>('all')
const topic = ref<ReferenceTopic | 'all'>('all')
watch(
  () => props.target,
  () => {
    query.value = ''
    kind.value = 'all'
    topic.value = 'all'
  },
)
const selectedTitle = computed(() => {
  if (!props.target) return ''
  if (props.target.scope === 'source')
    return references.find((entry) => entry.id === props.target?.id)?.title ?? props.target.id
  const items = props.target.scope === 'project' ? props.projectFindings : props.checks
  return items?.find((item) => item.id === props.target?.id)?.title ?? props.target.id
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
function hostname(url: string) {
  return new URL(url).hostname
}
function clearFilters() {
  query.value = ''
  kind.value = 'all'
  topic.value = 'all'
  emit('clear')
}
function relatedProjectFindings(ids?: string[]) {
  return props.projectFindings?.filter((finding) => ids?.includes(finding.id)) ?? []
}
function relatedChecks(ids: string[]) {
  return props.checks?.filter((check) => ids.includes(check.id)) ?? []
}
</script>
<template>
  <section class="reference-intro data-panel">
    <BookOpen :size="24" />
    <div>
      <h2>每个建议，都可以追溯出处</h2>
      <p>
        优先采用当前官方说明，社区实践用于补充排查线索。查看采用方式与判断边界，再决定是否适合你的环境。
      </p>
    </div>
    <span class="reference-updated">最近核对<br /><strong>2026-10-11</strong></span>
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
  <div v-if="target" class="reference-focus">
    <span>正在查看「{{ selectedTitle }}」的依据</span
    ><button class="text-link" @click="emit('clear')">查看全部文献<X :size="14" /></button>
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
    <article
      v-for="entry in filtered"
      :id="'reference-' + entry.id"
      :key="entry.id"
      class="reference-card data-panel"
    >
      <div class="reference-meta">
        <span class="source-type" :class="{ official: entry.kind === 'official' }">{{
          referenceKindLabels[entry.kind]
        }}</span
        ><span>{{ referenceTopicLabels[entry.topic] }}</span
        ><span>核对于 {{ entry.checkedAt }}</span>
      </div>
      <h3>
        <a :href="entry.url" target="_blank" rel="noopener noreferrer"
          >{{ entry.title }}<ExternalLink :size="16"
        /></a>
      </h3>
      <p class="reference-publisher">
        {{ entry.publisher }} · <span>{{ hostname(entry.url) }}</span>
      </p>
      <p class="reference-takeaway">{{ entry.takeaway }}</p>
      <dl class="reference-notes">
        <div>
          <dt>在工具中的用途</dt>
          <dd>{{ entry.application }}</dd>
        </div>
        <div>
          <dt>判断边界</dt>
          <dd>{{ entry.boundary }}</dd>
        </div>
      </dl>
      <div v-if="relatedChecks(entry.checkIds).length" class="reference-checks">
        <span>相关检查</span
        ><button
          v-for="check in relatedChecks(entry.checkIds)"
          :key="check.id"
          class="text-link"
          @click="emit('check', check.id)"
        >
          {{ check.title }}<ArrowUpRight :size="12" />
        </button>
      </div>
      <div v-if="relatedProjectFindings(entry.projectCheckIds).length" class="reference-checks">
        <span>相关项目检查</span>
        <button
          v-for="finding in relatedProjectFindings(entry.projectCheckIds)"
          :key="finding.id"
          class="text-link"
          @click="emit('project', finding.id)"
        >
          {{ finding.title }}<ArrowUpRight :size="12" />
        </button>
      </div>
    </article>
  </div>
</template>
