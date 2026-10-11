<script setup lang="ts">
import { TriangleAlert, FileCode2, LoaderCircle, RotateCcw } from '@lucide/vue'
import type { SnapshotPreview } from '../../shared/types'
import GuardDialog from './GuardDialog.vue'
defineProps<{ record?: SnapshotPreview; working: boolean }>()
const emit = defineEmits<{ close: []; execute: [] }>()
</script>
<template>
  <GuardDialog
    :open="!!record"
    title="一键还原配置快照"
    :description="`将还原 ${record?.files.length ?? 0} 个配置文件，并恢复快照中的检测偏好。`"
    wide
    :locked="working"
    @close="emit('close')"
    ><div class="wizard-note">
      <TriangleAlert :size="18" />
      <p>
        文件会完整恢复到快照时的内容。还原前先保存当前状态；预览后文件如有变化，本次还原会停止。
      </p>
    </div>
    <p v-if="working" class="dialog-note" role="status">
      <LoaderCircle class="spin" :size="15" />正在还原；如系统弹出授权窗口，请在该窗口完成验证。
    </p>
    <div v-for="file in record?.files" :key="file.path" class="file-preview">
      <div class="preview-file-title">
        <FileCode2 :size="16" /><code>{{ file.path }}</code>
      </div>
      <p class="snapshot-file-note">{{ file.changes[0]?.before }} → {{ file.changes[0]?.after }}</p>
    </div>
    <div v-if="record?.timezoneChanges?.length" class="file-preview">
      <div class="preview-file-title"><RotateCcw :size="16" /><strong>时区与 TZ</strong></div>
      <p v-for="change in record.timezoneChanges" :key="change.key" class="snapshot-file-note">
        {{ change.key }}：{{ change.before }} → {{ change.after }}
      </p>
    </div>
    <p v-if="!record?.files.length" class="wizard-hint">配置文件内容与快照一致。</p>
    <p class="wizard-hint">
      检测偏好：{{ record?.preferencesChanged ? '会恢复为快照中的选择' : '与快照一致' }}
    </p>
    <ul class="setup-notes">
      <li v-for="note in record?.notes" :key="note">{{ note }}</li>
    </ul>
    <template #footer
      ><button class="button secondary" :disabled="working" @click="emit('close')">取消</button
      ><button class="button primary" :disabled="working" @click="emit('execute')">
        <LoaderCircle v-if="working" class="spin" :size="16" /><RotateCcw v-else :size="16" />{{
          working ? '正在还原…' : '保存当前状态并还原'
        }}
      </button></template
    ></GuardDialog
  >
</template>
