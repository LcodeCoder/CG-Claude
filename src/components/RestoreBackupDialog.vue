<script setup lang="ts">
import { FileCode2, Info, LoaderCircle, RotateCcw } from '@lucide/vue'
import type { BackupSummary } from '../../shared/types'
import GuardDialog from './GuardDialog.vue'
defineProps<{ record?: BackupSummary; working: boolean }>()
const emit = defineEmits<{ close: []; execute: [] }>()
</script>
<template>
  <GuardDialog
    :open="!!record"
    title="恢复原始配置"
    description="将恢复这次修复前的文件。当前文件若已变化，工具会停止恢复。"
    :locked="working"
    @close="emit('close')"
    ><div class="restore-file-list">
      <div v-for="file in record?.files" :key="file">
        <FileCode2 :size="16" /><code>{{ file }}</code>
      </div>
    </div>
    <div class="dialog-note"><Info :size="15" />恢复后请重新启动终端，使环境变量重新加载。</div>
    <template #footer
      ><button class="button secondary" :disabled="working" @click="emit('close')">取消</button
      ><button class="button primary" :disabled="working" @click="emit('execute')">
        <LoaderCircle v-if="working" class="spin" :size="15" /><RotateCcw
          v-else
          :size="15"
        />恢复原配置
      </button></template
    ></GuardDialog
  >
</template>
