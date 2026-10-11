<script setup lang="ts">
import { computed } from 'vue'
import { ExternalLink, ArrowUpRight, ChevronDown, Copy } from '@lucide/vue'
import { referenceKindLabels, referenceMarkdown } from '../../shared/references'
import type { ReferenceEntry } from '../../shared/references'
import { manualItems } from '../../shared/types'
import type { CheckResult, ProjectFinding } from '../../shared/types'
import { referenceAudits, referenceAuditDate } from '../../shared/reference-audit'
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
const audit = computed(() => referenceAudits[props.entry.id])
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
    <details class="reference-details" :open="full">
      <summary :aria-label="'采用方式与相关检查：' + entry.title">
        <span>采用方式与相关检查</span><ChevronDown :size="15" />
      </summary>
      <p class="reference-takeaway">{{ entry.takeaway }}</p>
      <dl class="reference-notes">
        <div>
          <dt>采用方式</dt>
          <dd>{{ entry.application }}</dd>
        </div>
        <div v-if="audit">
          <dt>逐项核验</dt>
          <dd>{{ referenceAuditDate }} · {{ audit.section }}<br />{{ audit.finding }}</dd>
        </div>
        <div>
          <dt>判断边界</dt>
          <dd>{{ entry.boundary }}</dd>
        </div>
      </dl>
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
        <span>人工复核</span
        ><button
          v-for="item in relatedManual"
          :key="item.id"
          class="text-link"
          @click="emit('manual', item.id)"
        >
          {{ item.title }}<ArrowUpRight :size="13" />
        </button>
      </div>
    </details>
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
