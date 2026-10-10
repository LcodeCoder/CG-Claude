<script setup lang="ts">
import { computed } from 'vue'
import { ArchiveRestore, Check, LockKeyhole, RotateCcw } from '@lucide/vue'
import type { BackupSummary, SnapshotSummary } from '../../shared/types'
import { fixLabels } from '../../shared/types'
import { formatDate } from '../lib/format'
const props = defineProps<{
  snapshots: SnapshotSummary[]
  backups: BackupSummary[]
  busy: boolean
  connected: boolean
}>()
const emit = defineEmits<{
  capture: []
  preview: [id: string]
  restore: [backup: BackupSummary]
  overview: []
}>()
const activeBackups = computed(
  () => props.backups.filter((backup) => backup.status === 'applied').length,
)
const latestSnapshot = computed(() =>
  props.snapshots.find(
    (snapshot) => snapshot.purpose !== 'before-restore' && snapshot.status === 'ready',
  ),
)
function formatFixes(ids: BackupSummary['fixIds']) {
  return ids.map((id) => fixLabels[id]).join('、')
}
</script>
<template>
  <section class="snapshot-panel data-panel">
    <div class="panel-heading">
      <div>
        <h2>完整配置快照</h2>
        <p>一次保存本机配置与检测偏好，一次回到配置之前。</p>
      </div>
      <div class="heading-actions">
        <button class="button secondary" :disabled="busy || !connected" @click="emit('capture')">
          <ArchiveRestore :size="15" />保存当前快照</button
        ><button
          class="button primary"
          :disabled="busy || !connected || !latestSnapshot"
          @click="latestSnapshot && emit('preview', latestSnapshot.id)"
        >
          <RotateCcw :size="15" />一键还原之前的配置快照
        </button>
      </div>
    </div>
    <div v-if="!snapshots.length" class="snapshot-empty">
      一键配置和连接设置保存前会自动保存快照，也可以手动保存当前状态。
    </div>
    <article v-for="snapshot in snapshots" :key="snapshot.id" class="snapshot-row">
      <ArchiveRestore :size="19" />
      <div>
        <strong>{{ snapshot.label }}</strong>
        <p>
          {{ formatDate(snapshot.createdAt, true) }} · {{ snapshot.files.length }} 个配置位置 ·
          {{ snapshot.status === 'restored' ? '已还原' : '可还原' }}
        </p>
        <small v-if="snapshot.excludedFiles.length"
          >{{ snapshot.excludedFiles.length }} 个不可读文件未包含在快照中</small
        >
      </div>
      <button
        class="button secondary"
        :disabled="busy || !connected"
        @click="emit('preview', snapshot.id)"
      >
        还原此快照
      </button>
    </article>
  </section>

  <div class="compact-summary">
    <span class="summary-icon green"><ArchiveRestore :size="23" /></span>
    <div>
      <strong>{{ activeBackups }} 份可恢复备份</strong>
      <p>原文件内容仅保存在本机工具目录，恢复前再次校验当前文件。</p>
    </div>
  </div>
  <section class="data-panel">
    <div class="panel-heading">
      <h2>配置修改与恢复记录</h2>
      <span class="quiet-text">{{ backups.length ?? 0 }} 次修改</span>
    </div>
    <div v-if="!backups.length" class="empty-view">
      <ArchiveRestore :size="35" />
      <h2>暂时没有修复备份</h2>
      <p>每次执行修复前会自动保存原始配置。</p>
      <button class="button secondary" @click="emit('overview')">返回环境检测</button>
    </div>
    <article v-for="backup in backups" :key="backup.id" class="backup-row">
      <span class="backup-icon"
        ><ArchiveRestore v-if="backup.status === 'applied'" :size="20" /><Check v-else :size="20"
      /></span>
      <div class="backup-info">
        <div class="backup-title">
          <strong>{{ formatDate(backup.createdAt, true) }}</strong
          ><span class="backup-state" :class="backup.status">{{
            backup.status === 'applied'
              ? '可恢复'
              : backup.status === 'restored'
                ? '已恢复'
                : '修复中断'
          }}</span>
        </div>
        <p>{{ backup.label ?? formatFixes(backup.fixIds) }}</p>
        <div class="backup-paths">
          <code v-for="file in backup.files" :key="file">{{ file }}</code>
        </div>
        <small v-if="backup.restoredAt">已在 {{ formatDate(backup.restoredAt) }} 恢复</small>
      </div>
      <button
        v-if="backup.status === 'applied'"
        class="button secondary"
        :disabled="busy"
        @click="emit('restore', backup)"
      >
        <RotateCcw :size="14" />恢复原配置
      </button>
    </article>
  </section>
  <section class="scope-note">
    <LockKeyhole :size="19" />
    <div>
      <h3>保留你后来的修改</h3>
      <p>
        如果修复后又编辑过配置，自动恢复会停止，防止覆盖新内容。你可以在
        ~/.claude-guard/backups.json 中对照原始备份。
      </p>
    </div>
  </section>
</template>
