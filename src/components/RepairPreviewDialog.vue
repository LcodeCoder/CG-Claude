<script setup lang="ts">
import { FileCode2, Info, LockKeyhole, LoaderCircle, Check } from '@lucide/vue'
import type { RepairPlan } from '../../shared/types'
import GuardDialog from './GuardDialog.vue'
defineProps<{ record?: RepairPlan; working: boolean }>()
const emit = defineEmits<{ close: []; execute: [] }>()
</script>
<template>
  <GuardDialog
    :open="!!record"
    title="预览配置修复"
    :description="`将修改 ${record?.files.length ?? 0} 个文件，执行前自动保存原始备份。`"
    wide
    :locked="working"
    @close="emit('close')"
    ><div v-for="file in record?.files" :key="file.path" class="file-preview">
      <div class="preview-file-title">
        <FileCode2 :size="16" /><code>{{ file.path }}</code
        ><span v-if="!file.exists">将创建</span><small>{{ file.changes.length }} 项修改</small>
      </div>
      <div v-for="(change, index) in file.changes" :key="change.key + index" class="change-preview">
        <strong>{{ change.key }}</strong>
        <div class="diff-before">
          <span>−</span><code>{{ change.before }}</code>
        </div>
        <div class="diff-after">
          <span>+</span><code>{{ change.after }}</code>
        </div>
      </div>
    </div>
    <div class="preview-notes">
      <p v-for="note in record?.notes" :key="note"><Info :size="14" />{{ note }}</p>
    </div>
    <template #footer
      ><span class="preview-footer-note"
        ><LockKeyhole :size="13" />原始备份包含本机配置，仅保存在本机</span
      ><button class="button secondary" :disabled="working" @click="emit('close')">取消</button
      ><button class="button primary" :disabled="working" @click="emit('execute')">
        <LoaderCircle v-if="working" class="spin" :size="15" /><Check v-else :size="15" />{{
          working ? '正在修复' : '备份并执行修复'
        }}
      </button></template
    ></GuardDialog
  >
</template>
