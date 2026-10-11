<script setup lang="ts">
import { computed } from 'vue'
import type { Preferences } from '../../shared/types'
import {
  ARTICLE_TIMEZONE,
  normalizeTimezone,
  commonTimezones,
  timezoneModeLabels,
  timezoneModes,
} from '../../shared/timezones'

const draft = defineModel<Preferences>({ required: true })
defineProps<{ prefix: string; configure?: boolean }>()
const selectedZone = computed({
  get: () =>
    commonTimezones.some((zone) => zone === draft.value.expectedTimezone)
      ? draft.value.expectedTimezone
      : 'custom',
  set: (value: string) => {
    draft.value.expectedTimezone = value === 'custom' ? '' : value
  },
})
function selectMode() {
  if (draft.value.timezoneMode !== 'manual' && !normalizeTimezone(draft.value.expectedTimezone))
    draft.value.expectedTimezone = ''
  if (draft.value.timezoneMode === 'manual' && !draft.value.expectedTimezone)
    draft.value.expectedTimezone = ARTICLE_TIMEZONE
}
</script>
<template>
  <div class="field-row">
    <label :for="`${prefix}-timezone-mode`"
      >{{ configure ? '目标时区依据' : '时区检测依据'
      }}<span>{{ configure ? '用于配置与复检。' : '选择比较目标。' }}</span></label
    >
    <select :id="`${prefix}-timezone-mode`" v-model="draft.timezoneMode" @change="selectMode">
      <option v-for="mode in timezoneModes" :key="mode" :value="mode">
        {{ timezoneModeLabels[mode] }}
      </option>
    </select>
  </div>
  <template v-if="draft.timezoneMode === 'manual'">
    <div class="field-row">
      <label :for="`${prefix}-expected-timezone`"
        >手动目标时区<span>选择或输入 IANA 时区。</span></label
      >
      <select :id="`${prefix}-expected-timezone`" v-model="selectedZone">
        <option v-for="zone in commonTimezones" :key="zone" :value="zone">{{ zone }}</option>
        <option value="custom">其他 IANA 时区…</option>
      </select>
    </div>
    <div v-if="selectedZone === 'custom'" class="field-row">
      <label :for="`${prefix}-custom-timezone`"
        >其他时区<span>输入完整名称，例如 Europe/Paris。</span></label
      >
      <input
        :id="`${prefix}-custom-timezone`"
        v-model.trim="draft.expectedTimezone"
        placeholder="例如 Europe/Paris"
        autocomplete="off"
      />
    </div>
  </template>
  <p class="timezone-guidance">
    <template v-if="draft.timezoneMode === 'article'"
      >原文目标：{{ ARTICLE_TIMEZONE }}。上海与台北按不同名称判断。</template
    >
    <template v-else-if="draft.timezoneMode === 'exit'"
      >需开启公网检测。使用出口返回的时区；查询失败、缺少时区或出口不一致时待确认。</template
    >
    <template v-else>按所选目标核对，报告标明“手动选择”。</template>
    <span>{{
      configure
        ? '系统时区与终端 TZ 默认自动配置，可在修改范围取消。'
        : '保存此页只更新检测目标；一键配置可设置系统时区与终端 TZ。'
    }}</span>
  </p>
</template>
