<script setup lang="ts">
import { useUiText } from '../i18n'
import { projectFindingLabel } from '../lib/project-results'
import { computed, nextTick, ref, watch } from 'vue'
import { BookOpen, FileCode2, LoaderCircle, Search, X } from '@lucide/vue'
import { statusLabels } from '../../shared/types'
import type { ProjectFinding, ProjectReport } from '../../shared/types'
import { referencesForProjectFinding } from '../../shared/references'
import { formatDate } from '../lib/format'

const { t } = useUiText()

const projectPath = defineModel<string>({ required: true })
const props = defineProps<{
  report?: ProjectReport
  focusId?: string
  busy: boolean
  working: boolean
  connected: boolean
  desktop: boolean
}>()
const emit = defineEmits<{
  scan: [path: string]
  choose: []
  references: [id: string]
  focus: [id: string]
}>()
type FindingFilter = 'all' | 'issues' | 'pass' | 'manual'
const filter = ref<FindingFilter>('all')
const query = ref('')
watch(
  () => props.report,
  () => {
    filter.value = 'all'
    query.value = ''
  },
)
const filterOptions = computed(() => {
  const counts = props.report?.counts
  return [
    { id: 'all', label: '全部检查', count: props.report?.findings.length ?? 0 },
    { id: 'issues', label: '需要处理 / 关注', count: (counts?.fail ?? 0) + (counts?.warn ?? 0) },
    {
      id: 'manual',
      label: '待确认 / 未检测',
      count: (counts?.manual ?? 0) + (counts?.skipped ?? 0),
    },
    { id: 'pass', label: '检查通过', count: counts?.pass ?? 0 },
  ] as const
})
function matchesGroup(finding: ProjectFinding) {
  if (filter.value === 'issues') return finding.status === 'warn' || finding.status === 'fail'
  if (filter.value === 'manual') return finding.status === 'manual' || finding.status === 'skipped'
  return filter.value === 'all' || finding.status === 'pass'
}
const filtered = computed(
  () =>
    props.report?.findings.filter(
      (finding) =>
        matchesGroup(finding) &&
        [
          projectFindingLabel(finding),
          finding.summary,
          finding.recommendation,
          ...finding.evidence.flatMap((item) => [item.label, item.value]),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query.value.trim().toLowerCase()),
    ) ?? [],
)
async function selectFilter(value: FindingFilter) {
  filter.value = value
  query.value = ''
  await nextTick()
  const first = filtered.value[0]
  if (first) emit('focus', first.id)
}
function clearFilters() {
  filter.value = 'all'
  query.value = ''
}
</script>
<template>
  <form class="project-picker data-panel" @submit.prevent="emit('scan', projectPath.trim())">
    <label for="project-path">{{ t('本地项目目录') }}</label>
    <div>
      <input
        id="project-path"
        v-model.trim="projectPath"
        :placeholder="t('输入项目绝对路径')"
      /><button
        v-if="desktop"
        type="button"
        class="button secondary"
        :disabled="busy"
        @click="emit('choose')"
      >
        {{ t('选择目录') }}
      </button>
      <button class="button primary" :disabled="busy || !projectPath || !connected">
        <LoaderCircle v-if="working" class="spin" :size="16" /><Search v-else :size="16" />{{
          t('扫描项目')
        }}
      </button>
    </div>
    <p>
      {{
        t(
          '检查项目设置覆盖、权限、命令沙箱、Hooks、MCP、代理、TLS、依赖清单和本地 Git 提交。只读取固定位置，凭据值会隐藏；不执行项目命令。',
        )
      }}
    </p>
  </form>
  <section v-if="report" class="data-panel project-results" :aria-label="t('项目扫描结果')">
    <div class="panel-heading">
      <div>
        <h2>{{ report.findings.length }} {{ t('项项目配置检查') }}</h2>
        <p>{{ report.root }}</p>
      </div>
      <span class="quiet-text">{{ t('扫描于') }} {{ formatDate(report.createdAt) }}</span>
    </div>
    <div class="project-result-filters" :aria-label="t('按项目检查状态筛选')">
      <button
        v-for="option in filterOptions"
        :key="option.id"
        type="button"
        :class="{ active: filter === option.id }"
        :aria-pressed="filter === option.id"
        :disabled="option.id !== 'all' && !option.count"
        @click="selectFilter(option.id)"
      >
        <strong>{{ option.count }}</strong
        ><span>{{ t(option.label) }}</span>
      </button>
    </div>
    <div class="project-search-toolbar">
      <label class="search-field"
        ><Search :size="16" /><input
          v-model="query"
          :aria-label="t('搜索项目检查')"
          :placeholder="t('搜索检查、来源或建议')"
      /></label>
      <button v-if="query || filter !== 'all'" class="text-link" @click="clearFilters">
        {{ t('查看全部') }}<X :size="14" />
      </button>
      <span class="quiet-text" role="status"
        >{{ t('显示') }} {{ filtered.length }} / {{ report.findings.length }} {{ t('项') }}</span
      >
    </div>
    <article
      v-for="finding in filtered"
      :id="'project-finding-' + finding.id"
      :key="finding.id"
      class="project-finding"
      :class="{ highlighted: focusId === finding.id }"
      tabindex="-1"
    >
      <span class="project-status" :class="finding.status">{{
        t(statusLabels[finding.status])
      }}</span>
      <div>
        <h3>{{ t(projectFindingLabel(finding)) }}</h3>
        <p>{{ t(finding.summary) }}</p>
        <details
          v-if="finding.evidence.length"
          :open="focusId === finding.id || finding.status === 'fail'"
        >
          <summary>{{ t('查看') }} {{ finding.evidence.length }} {{ t('条证据') }}</summary>
          <dl>
            <template v-for="(evidence, index) in finding.evidence" :key="index">
              <dt>{{ t(evidence.label) }}</dt>
              <dd>{{ evidence.value }}</dd>
            </template>
          </dl>
        </details>
        <p class="project-recommendation">
          <strong>{{ t('建议操作') }}</strong
          >{{ t(finding.recommendation) }}
        </p>
        <button
          v-if="referencesForProjectFinding(finding.id).length"
          class="text-link project-reference-link"
          @click="emit('references', finding.id)"
        >
          <BookOpen :size="14" />{{ t('查看依据 ·') }}
          {{ referencesForProjectFinding(finding.id).length }} {{ t('篇文献') }}
        </button>
      </div>
    </article>
    <div v-if="!filtered.length" class="result-empty">
      <Search :size="26" />
      <h3>{{ t('没有符合筛选的检查') }}</h3>
      <p>{{ t('换一个关键词，或查看全部项目结果。') }}</p>
      <button class="text-link" @click="clearFilters">{{ t('查看全部检查') }}</button>
    </div>
  </section>
  <section v-else class="data-panel empty-view">
    <FileCode2 :size="34" />
    <h2>{{ t('选择项目，检查配置覆盖') }}</h2>
    <p>{{ t('项目中的设置可能覆盖全局配置。扫描后可以按状态筛选、查看证据和对应依据。') }}</p>
  </section>
  <p class="wizard-hint">
    {{
      t(
        '本页检查已列出的配置与元数据。代码缺陷、业务逻辑、其他语言依赖和远端 Git 备份需要项目自己的测试与审查。',
      )
    }}
  </p>
</template>
