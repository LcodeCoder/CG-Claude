<script setup lang="ts">
import { useUiText } from '../i18n'
import { computed, ref } from 'vue'
import { ArrowUpRight, ChevronDown, ClipboardList } from '@lucide/vue'
import {
  articleAuditEntries,
  articleAuditGroups,
  articleCoverageLabels,
  articleModeDifferences,
  ARTICLE_AUDIT_DATE,
} from '../../shared/article-audit'
import type { ArticleCoverage } from '../../shared/article-audit'
import { ARTICLE_URL } from '../../shared/timezones'
import { DIAGNOSTIC_RULESET } from '../../shared/diagnostic-checks'
import { manualItems, statusLabels } from '../../shared/types'
import type { ProjectFinding, ScanReport } from '../../shared/types'

const { t } = useUiText()

const props = defineProps<{
  report?: ScanReport
  projectFindings?: ProjectFinding[]
  expanded?: boolean
}>()
const emit = defineEmits<{
  check: [id: string]
  project: [id: string]
  manual: [id: string]
  settings: []
}>()
const filter = ref<ArticleCoverage | 'all'>('all')
const groups = computed(() =>
  Object.entries(articleAuditGroups)
    .map(([id, label]) => ({
      id,
      label,
      entries: articleAuditEntries.filter(
        (entry) =>
          entry.group === id && (filter.value === 'all' || entry.coverage === filter.value),
      ),
    }))
    .filter((group) => group.entries.length),
)
const differences = computed(() => articleModeDifferences(props.report?.preferences))
const counts = Object.fromEntries(
  Object.keys(articleCoverageLabels).map((key) => [
    key,
    articleAuditEntries.filter((entry) => entry.coverage === key).length,
  ]),
)
function checkTitle(id: string) {
  return props.report?.checks.find((check) => check.id === id)?.title ?? '先运行环境检测'
}
function checkStatus(id: string) {
  const check = props.report?.checks.find((check) => check.id === id)
  return check ? statusLabels[check.status] : '未检测'
}
</script>
<template>
  <details id="article-audit" tabindex="-1" class="article-audit data-panel" :open="expanded">
    <summary>
      <ClipboardList :size="22" />
      <span
        ><strong>{{ t('原文逐项对照') }}</strong
        ><small
          >{{ articleAuditEntries.length }} {{ t('项要求与边界 · 核对') }}
          {{ ARTICLE_AUDIT_DATE }}</small
        ></span
      >
      <ChevronDown :size="18" />
    </summary>
    <div class="article-audit-content">
      <p class="article-audit-lead">{{ t('展开条目查看检测证据、修复范围与人工步骤。') }}</p>
      <p class="article-audit-note">{{ t('标签表示检测能力；账号状态需另行复核。') }}</p>
      <div v-if="report && report.ruleset !== DIAGNOSTIC_RULESET" class="article-mode-differences">
        {{ t('这份报告使用旧规则，不能用其“通过”替代当前核对；请先重新检测。') }}
      </div>
      <div v-if="differences.length" class="article-mode-differences">
        <strong>{{ t('本次检测设置与原文默认 B 路线不同') }}</strong>
        <ul>
          <li v-for="difference in differences" :key="difference.id">{{ difference.message }}</li>
        </ul>
        <button class="text-link" @click="emit('settings')">
          {{ t('查看检测偏好') }}<ArrowUpRight :size="14" />
        </button>
      </div>
      <div class="article-audit-filters" role="group" :aria-label="t('原文覆盖范围筛选')">
        <button :aria-pressed="filter === 'all'" @click="filter = 'all'">
          {{ t('全部') }} {{ articleAuditEntries.length }}
        </button>
        <button
          v-for="(label, id) in articleCoverageLabels"
          :key="id"
          :aria-pressed="filter === id"
          @click="filter = id"
        >
          {{ t(label) }} {{ counts[id] }}
        </button>
      </div>
      <details
        v-for="group in groups"
        :key="group.id"
        class="article-audit-group"
        :open="filter !== 'all'"
      >
        <summary>
          <h3>{{ t(group.label) }}</h3>
          <span>{{ group.entries.length }} {{ t('项') }}</span
          ><ChevronDown :size="15" />
        </summary>
        <details v-for="entry in group.entries" :key="entry.id" class="article-audit-row">
          <summary>
            <span
              ><small>{{ t('原文') }} {{ entry.section }}</small
              ><strong>{{ entry.title }}</strong></span
            ><span class="article-coverage" :data-coverage="entry.coverage">{{
              articleCoverageLabels[entry.coverage]
            }}</span
            ><ChevronDown :size="15" />
          </summary>
          <div class="article-audit-detail">
            <dl>
              <div>
                <dt>{{ t('检测与范围') }}</dt>
                <dd>{{ entry.implementation }}</dd>
              </div>
              <div>
                <dt>{{ t('修复与后续') }}</dt>
                <dd>{{ entry.repair }}</dd>
              </div>
            </dl>
            <div
              v-if="
                entry.checkIds?.length || entry.manualIds?.length || entry.projectCheckIds?.length
              "
              class="article-audit-actions"
            >
              <button
                v-for="id in entry.checkIds"
                :key="id"
                class="text-link"
                :disabled="!report?.checks.some((check) => check.id === id)"
                @click="emit('check', id)"
              >
                {{ checkTitle(id) }} · {{ checkStatus(id) }}<ArrowUpRight :size="13" />
              </button>
              <button
                v-for="id in entry.manualIds"
                :key="id"
                class="text-link"
                @click="emit('manual', id)"
              >
                {{ manualItems.find((item) => item.id === id)?.title }}<ArrowUpRight :size="13" />
              </button>
              <button
                v-for="id in entry.projectCheckIds"
                :key="id"
                class="text-link"
                :disabled="!projectFindings?.some((finding) => finding.id === id)"
                @click="emit('project', id)"
              >
                {{
                  projectFindings?.find((finding) => finding.id === id)?.title ??
                  t('需先扫描所选项目')
                }}<ArrowUpRight :size="13" />
              </button>
            </div>
            <small class="article-code-source">{{ t('实现位置：') }}{{ entry.code }}</small>
          </div>
        </details>
      </details>
      <a class="text-link" :href="ARTICLE_URL" target="_blank" rel="noopener noreferrer"
        >{{ t('打开 AYi 原文') }}<ArrowUpRight :size="14"
      /></a>
    </div>
  </details>
</template>
