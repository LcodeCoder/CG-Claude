<script setup lang="ts">
import { computed } from 'vue'
import { ArrowUpRight, ListChecks } from '@lucide/vue'
import ManualActionGuide from './ManualActionGuide.vue'
import { setupFollowups } from '../../shared/manual-guidance'
import type { ManualReview, ScanReport, SetupJob } from '../../shared/types'
import type { LocalActionId } from '../../shared/local-actions'
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
        <h3 id="setup-followup-title">还需要你完成 · {{ items.length }} 项</h3>
        <p>自动配置之外的设置与复核。展开查看步骤、跳转入口和命令。</p>
      </div>
    </div>
    <p v-if="!report" class="guide-note" role="status">
      本次复检报告未生成。清单可能不完整，请先重新检测。
    </p>
    <details
      v-for="(item, index) in items"
      :key="item.id"
      class="followup-item"
      :open="index === 0"
    >
      <summary>
        <span>{{ item.title }}</span
        ><small>{{ item.category }}</small>
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
            记录人工复核<ArrowUpRight :size="13" /></button
          ><button v-if="item.checkId" class="text-link" @click="emit('check', item.checkId)">
            查看检测详情<ArrowUpRight :size="13" /></button
          ><a
            v-if="item.url"
            class="text-link"
            :href="item.url"
            target="_blank"
            rel="noopener noreferrer"
            >打开检查 / 依据<ArrowUpRight :size="13" /></a
          ><span class="guide-source">依据 · {{ item.guidance.section }}</span>
        </div>
      </div>
    </details>
    <button class="button secondary" :disabled="busy" @click="emit('scan')">完成后重新检测</button>
  </section>
</template>
