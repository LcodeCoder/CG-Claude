<script setup lang="ts">
import { useUiText } from '../i18n'
import { ref } from 'vue'
import { ArrowUpRight, Check, Copy, Terminal, Settings } from '@lucide/vue'
import type { ManualGuidance } from '../../shared/manual-guidance'
import type { LocalActionId } from '../../shared/local-actions'
import { localActionSupported } from '../../shared/local-actions'

const { t } = useUiText()

const props = defineProps<{
  guidance: ManualGuidance
  platform: string
  busy: boolean
  openAction?: (action: LocalActionId) => Promise<boolean>
}>()
const copied = ref('')
const copyError = ref('')
const opening = ref(false)
async function copy(text: string, title: string) {
  copyError.value = ''
  try {
    await navigator.clipboard.writeText(text)
    copied.value = title
  } catch {
    copyError.value = '复制未完成，请选中命令手动复制。'
  }
}
async function open(action: LocalActionId) {
  opening.value = true
  try {
    await props.openAction?.(action)
  } finally {
    opening.value = false
  }
}
</script>
<template>
  <div class="manual-guide">
    <ol>
      <li v-for="step in guidance.steps" :key="step">{{ step }}</li>
    </ol>
    <p v-if="guidance.note" class="guide-note">{{ guidance.note }}</p>
    <div class="guide-actions">
      <button
        v-if="guidance.action && localActionSupported(platform, guidance.action) && openAction"
        class="button secondary"
        :disabled="busy || opening"
        @click="open(guidance.action)"
      >
        <Terminal v-if="guidance.action === 'terminal'" :size="15" /><Settings
          v-else
          :size="15"
        />{{ opening ? t('正在打开') : guidance.actionLabel }}
      </button>
      <button
        v-if="guidance.commands?.length && guidance.action !== 'terminal' && openAction"
        class="button subtle"
        :disabled="busy || opening"
        @click="open('terminal')"
      >
        <Terminal :size="15" />{{ t('打开终端') }}
      </button>
      <a
        v-for="link in guidance.links"
        :key="link.url"
        class="text-link"
        :href="link.url"
        target="_blank"
        rel="noopener noreferrer"
        >{{ t(link.title) }}<ArrowUpRight :size="13"
      /></a>
    </div>
    <div v-for="command in guidance.commands" :key="command.title" class="guide-command">
      <div>
        <strong>{{ t(command.title) }}</strong
        ><button
          class="text-link"
          :aria-label="t('复制命令：') + command.title"
          @click="copy(command.text, command.title)"
        >
          <Check v-if="copied === command.title" :size="14" /><Copy v-else :size="14" />{{
            copied === command.title ? t('已复制') : t('复制')
          }}
        </button>
      </div>
      <pre><code>{{ command.text }}</code></pre>
      <p>{{ t(command.expected) }}</p>
    </div>
    <p v-if="guidance.commands?.length" class="guide-note">
      {{ t('打开终端不会自动执行命令，请核对后粘贴运行。') }}
    </p>
    <span class="sr-only" role="status">{{ copied ? t('已复制：') + copied : '' }}</span>
    <p v-if="copyError" role="alert" class="field-error">{{ t(copyError) }}</p>
  </div>
</template>
