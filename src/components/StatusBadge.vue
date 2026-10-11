<script setup lang="ts">
import { useUiText } from '../i18n'
import { Check, TriangleAlert, CircleHelp, Minus, X } from '@lucide/vue'
import type { CheckStatus } from '../../shared/types'
import { statusLabels } from '../../shared/types'

const { t } = useUiText()

const props = defineProps<{ status: CheckStatus; compact?: boolean }>()
const icons = { pass: Check, warn: TriangleAlert, fail: X, manual: CircleHelp, skipped: Minus }
</script>
<template>
  <span class="status-badge" :class="[props.status, { compact: props.compact }]">
    <component :is="icons[props.status]" :size="12" :stroke-width="2.4" aria-hidden="true" />
    <span v-if="!props.compact">{{ t(statusLabels[props.status]) }}</span>
  </span>
</template>
