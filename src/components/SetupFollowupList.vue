<script setup lang="ts">
import { useUiText } from '../i18n'
import { computed } from 'vue'
import { ArrowUpRight, ListChecks } from '@lucide/vue'
import ManualActionGuide from './ManualActionGuide.vue'
import { setupFollowups } from '../../shared/manual-guidance'
import type { ManualReview, ScanReport, SetupJob } from '../../shared/types'
import type { LocalActionId } from '../../shared/local-actions'

const { t } = useUiText()

const props = defineProps<{
  job: SetupJob
  report?: ScanReport
  reviews: ManualReview[]
  platform: string
  busy: boolean
  openAction: (action: LocalActionId) => Promise<boolean>
}>()
const emit = defineEmits<{ manual: [id: string]; check: [id: string]; scan: [] }>()
const items = computed(() => setupFollowups(props.job, props.report, props.reviews, props.platform))
</script>
<template>
  <section class="setup-followups" aria-labelledby="setup-followup-title">
    <div class="followup-heading">
      <ListChecks :size="21" />
      <div>
        <h3 id="setup-followup-title">
          {{
            items.length
              ? t('还需手动完成 {count} 项', { count: items.length })
              : t('没有待处理的手动项')
          }}
        </h3>
        <p v-if="items.length">{{ t('展开查看步骤和设置入口。') }}</p>
      </div>
    </div>
    <p v-if="!report" class="guide-note" role="status">
      {{ t('复检未完成，请重新检测以补齐清单。') }}
    </p>
    <details
      v-for="(item, index) in items"
      :key="item.id"
      class="followup-item"
      :open="index === 0"
    >
      <summary>
        <span>{{ t(item.title) }}</span
        ><small>{{ t(item.category) }}</small>
      </summary>
      <div class="followup-body">
        <p>{{ item.reason }}</p>
        <ManualActionGuide
          :guidance="item.guidance"
          :platform="platform"
          :busy="busy"
          :open-action="openAction"
        />
        <div class="guide-actions">
          <button v-if="item.manualId" class="text-link" @click="emit('manual', item.manualId)">
            {{ t('记录人工复核') }}<ArrowUpRight :size="13" /></button
          ><button v-if="item.checkId" class="text-link" @click="emit('check', item.checkId)">
            {{ t('查看检测详情') }}<ArrowUpRight :size="13" /></button
          ><a
            v-if="item.url"
            class="text-link"
            :href="item.url"
            target="_blank"
            rel="noopener noreferrer"
            >{{ t('打开检查 / 依据') }}<ArrowUpRight :size="13" /></a
          ><span class="guide-source">{{ t('依据 ·') }} {{ item.guidance.section }}</span>
        </div>
      </div>
    </details>
    <button class="button secondary" :disabled="busy" @click="emit('scan')">
      {{ t('完成后重新检测') }}
    </button>
  </section>
</template>
