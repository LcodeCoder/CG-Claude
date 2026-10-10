<script setup lang="ts">
import { computed } from 'vue'
import { ExternalLink, ArrowUpRight, ChevronDown, Copy } from '@lucide/vue'
import {
  referenceKindLabels,
  referenceTopicLabels,
  referenceMarkdown,
} from '../../shared/references'
import type { ReferenceEntry } from '../../shared/references'
import { manualItems } from '../../shared/types'
import type { CheckResult, ProjectFinding } from '../../shared/types'
import { projectFindingLabel } from '../lib/project-results'

const props = defineProps<{
  entry: ReferenceEntry
  full: boolean
  checks?: CheckResult[]
  projectFindings?: ProjectFinding[]
}>()
const emit = defineEmits<{
  check: [id: string]
  project: [id: string]
  manual: [id: string]
  copy: [text: string]
}>()
const hostname = computed(() => new URL(props.entry.url).hostname)
const relatedChecks = computed(
  () => props.checks?.filter((check) => props.entry.checkIds.some((id) => id === check.id)) ?? [],
)
const relatedFindings = computed(
  () =>
    props.projectFindings?.filter((finding) => props.entry.projectCheckIds?.includes(finding.id)) ??
    [],
)
const relatedManual = computed(() =>
  manualItems.filter((item) => props.entry.manualItemIds?.includes(item.id)),
)
</script>
<template>
  <article :id="'reference-' + entry.id" class="reference-card data-panel">
    <div class="reference-meta">
      <span class="source-type" :class="{ official: entry.kind === 'official' }">{{
        referenceKindLabels[entry.kind]
      }}</span>
      <span>{{ referenceTopicLabels[entry.topic] }}</span>
      <span>核对于 {{ entry.checkedAt }}</span>
    </div>
    <h3>
      <a :href="entry.url" target="_blank" rel="noopener noreferrer"
        >{{ entry.title }}<ExternalLink :size="16"
      /></a>
    </h3>
    <p class="reference-publisher">
      {{ entry.publisher }} · <span>{{ hostname }}</span>
    </p>
    <p class="reference-takeaway">{{ entry.takeaway }}</p>
    <details class="reference-details" :open="full">
      <summary :aria-label="'采用方式与判断边界：' + entry.title">
        <span>采用方式与判断边界</span><ChevronDown :size="15" />
      </summary>
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
    </details>
    <div v-if="relatedChecks.length" class="reference-checks">
      <span>相关检查</span
      ><button
        v-for="check in relatedChecks"
        :key="check.id"
        class="text-link"
        @click="emit('check', check.id)"
      >
        {{ check.title }}<ArrowUpRight :size="12" />
      </button>
    </div>
    <div v-if="relatedFindings.length" class="reference-checks">
      <span>相关项目检查</span
      ><button
        v-for="finding in relatedFindings"
        :key="finding.id"
        class="text-link"
        @click="emit('project', finding.id)"
      >
        {{ projectFindingLabel(finding) }}<ArrowUpRight :size="12" />
      </button>
    </div>
    <div v-if="relatedManual.length" class="reference-checks">
      <span>关联人工复核</span
      ><button
        v-for="item in relatedManual"
        :key="item.id"
        class="text-link"
        @click="emit('manual', item.id)"
      >
        {{ item.title }}<ArrowUpRight :size="13" />
      </button>
    </div>
    <div class="reference-actions">
      <button
        class="text-link"
        :aria-label="'复制引用：' + entry.title"
        @click="emit('copy', referenceMarkdown([entry]))"
      >
        <Copy :size="13" />复制引用
      </button>
    </div>
  </article>
</template>
