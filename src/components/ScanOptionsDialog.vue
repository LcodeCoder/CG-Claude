<script setup lang="ts">
import { useUiText } from '../i18n'
import { FolderCog, LockKeyhole, Play } from '@lucide/vue'
import GuardDialog from './GuardDialog.vue'

const { t } = useUiText()

defineProps<{ open: boolean; busy: boolean }>()
const network = defineModel<boolean>('network', { required: true })
const passes = defineModel<number>('passes', { required: true })
const emit = defineEmits<{ close: []; start: [] }>()
</script>
<template>
  <GuardDialog
    :open="open"
    :title="t('开始环境检测')"
    :description="t('默认检查本机配置。公网检测需要访问外部服务。')"
    :locked="busy"
    @close="emit('close')"
    ><div class="scan-scope">
      <span class="scan-scope-icon"><FolderCog :size="24" /></span>
      <div>
        <strong>{{ t('本机配置检测') }}</strong>
        <p>{{ t('系统时区、代理、shell、npm、git、Claude Code 配置及浏览器设置。') }}</p>
      </div>
      <span class="included-tag">{{ t('默认开启') }}</span>
    </div>
    <label class="network-option" :class="{ selected: network }"
      ><input v-model="network" type="checkbox" /><span
        ><strong>{{ t('包括公网出口与 WebRTC 检测') }}</strong
        ><small>{{
          t(
            '访问 ipinfo.io、api.ipify.org 与 Google STUN。外部服务会看到你的公网 IP；配置和密钥留在本机。',
          )
        }}</small></span
      ></label
    >
    <label class="scan-repeat-option"
      >{{ t('连续检测次数')
      }}<select v-model.number="passes">
        <option :value="1">{{ t('1 遍') }}</option>
        <option :value="2">{{ t('2 遍') }}</option>
        <option :value="3">{{ t('3 遍（核对稳定性）') }}</option>
      </select></label
    >
    <div class="dialog-note"><LockKeyhole :size="15" />{{ t('检测只读取配置，不执行修改。') }}</div>
    <template #footer
      ><button class="button secondary" @click="emit('close')">{{ t('取消') }}</button
      ><button class="button primary" @click="emit('start')">
        <Play :size="13" fill="currentColor" />{{ t('开始检测') }}
      </button></template
    ></GuardDialog
  >
</template>
