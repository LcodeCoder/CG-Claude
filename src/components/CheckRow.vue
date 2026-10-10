<script setup lang="ts">
import { ChevronDown, Copy, ExternalLink, Wrench, Check } from '@lucide/vue'
import { ref, computed } from 'vue'
import type { CheckResult, FixId } from '../../shared/types'
import { fixLabels } from '../../shared/types'
import StatusBadge from './StatusBadge.vue'
const props = defineProps<{
  check: CheckResult
  expanded: boolean
  selected: FixId[]
  disabled: boolean
  platform?: string
}>()
const emit = defineEmits<{ toggle: []; fix: [id: FixId]; copyError: [] }>()
const copied = ref(false)
const commands: Record<string, string> = {
  timezone:
    'readlink /etc/localtime\nnode -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"',
  'system-proxy': 'scutil --proxy',
  dns: 'scutil --dns',
  'runtime-proxy': 'printenv | cut -d= -f1 | grep -iE "^(https?_proxy|all_proxy|no_proxy)$"',
  'git-proxy': 'git config --show-origin --name-only --get-regexp proxy',
  'npm-proxy': 'npm config get userconfig',
  'claude-cli': 'claude --version',
}
const command = computed(() => {
  if (props.platform === 'win32')
    return props.check.id === 'claude-cli' ? 'claude --version' : undefined
  if (props.platform !== 'darwin' && ['timezone', 'system-proxy', 'dns'].includes(props.check.id))
    return undefined
  return commands[props.check.id]
})
async function copy() {
  try {
    await navigator.clipboard.writeText(command.value!)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    emit('copyError')
  }
}
</script>
<template>
  <article :id="'check-' + props.check.id" class="check-row" :class="{ expanded: props.expanded }">
    <button
      class="check-summary"
      :aria-expanded="props.expanded"
      :aria-controls="'detail-' + props.check.id"
      @click="emit('toggle')"
    >
      <StatusBadge :status="props.check.status" compact />
      <span class="check-title"
        ><strong>{{ props.check.title }}</strong
        ><span>{{ props.check.summary }}</span></span
      >
      <Wrench
        v-if="props.check.fixIds.length"
        class="repairable-icon"
        :size="14"
        aria-label="可预览修复"
      />
      <StatusBadge :status="props.check.status" /><ChevronDown class="chevron" :size="15" />
    </button>
    <div v-if="props.expanded" :id="'detail-' + props.check.id" class="check-detail">
      <p class="check-description">{{ props.check.description }}</p>
      <dl v-if="props.check.evidence.length" class="evidence-table">
        <div v-for="evidence in props.check.evidence" :key="evidence.label + evidence.value">
          <dt>{{ evidence.label }}</dt>
          <dd>{{ evidence.value }}</dd>
        </div>
      </dl>
      <p class="recommendation">{{ props.check.recommendation }}</p>
      <div v-if="command" class="command-block">
        <code>{{ command }}</code
        ><button
          class="icon-button"
          :aria-label="copied ? '已复制命令' : '复制检查命令'"
          @click="copy"
        >
          <Check v-if="copied" :size="15" /><Copy v-else :size="15" />
        </button>
      </div>
      <div class="detail-actions">
        <div class="fix-options">
          <label v-for="id in props.check.fixIds" :key="id" class="inline-check"
            ><input
              type="checkbox"
              :checked="props.selected.includes(id)"
              :disabled="props.disabled"
              @change="emit('fix', id)"
            />{{ fixLabels[id] }}</label
          >
        </div>
        <a
          v-if="props.check.sourceUrl"
          :href="props.check.sourceUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-link"
          ><ExternalLink :size="13" />{{
            props.check.source === 'official' ? '官方说明' : '参考 / 外部检查'
          }}</a
        >
      </div>
    </div>
  </article>
</template>
