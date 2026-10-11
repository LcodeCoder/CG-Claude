<script setup lang="ts">
import { useUiText } from '../i18n'
import type {
  BrowserLanguageConfiguration,
  BrowserLanguageRequest,
  BrowserLanguagePreview,
} from '../../shared/browser-configuration'
import BrowserLanguageConfigurator from '../components/BrowserLanguageConfigurator.vue'
import { computed } from 'vue'
import { ArchiveRestore, Check, LockKeyhole, RotateCcw } from '@lucide/vue'
import type { BackupSummary, SnapshotSummary } from '../../shared/types'
import { fixLabels } from '../../shared/types'
import { formatDate } from '../lib/format'

const { t } = useUiText()

const props = defineProps<{
  browserLanguages?: BrowserLanguageConfiguration
  previewBrowserLanguage: (
    value: BrowserLanguageRequest,
  ) => Promise<BrowserLanguagePreview | undefined>
  applyBrowserLanguage: (id: string) => Promise<boolean>
  restoreBrowserLanguage: (id: string) => Promise<boolean>
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
  <BrowserLanguageConfigurator
    backups-only
    language="en-US"
    :configuration="browserLanguages"
    :busy="busy"
    :connected="connected"
    :preview="previewBrowserLanguage"
    :apply="applyBrowserLanguage"
    :restore="restoreBrowserLanguage"
  />
  <section class="snapshot-panel data-panel">
    <div class="panel-heading">
      <div>
        <h2>{{ t('完整配置快照') }}</h2>
        <p>{{ t('保存本机配置、时区、TZ、可读取的自动时区开关与检测偏好。') }}</p>
      </div>
      <div class="heading-actions">
        <button class="button secondary" :disabled="busy || !connected" @click="emit('capture')">
          <ArchiveRestore :size="15" />{{ t('保存当前快照') }}</button
        ><button
          class="button primary"
          :disabled="busy || !connected || !latestSnapshot"
          @click="latestSnapshot && emit('preview', latestSnapshot.id)"
        >
          <RotateCcw :size="15" />{{ t('一键还原之前的配置快照') }}
        </button>
      </div>
    </div>
    <div v-if="!snapshots.length" class="snapshot-empty">
      {{ t('一键配置和连接设置保存前会自动保存快照，也可以手动保存当前状态。') }}
    </div>
    <article v-for="snapshot in snapshots" :key="snapshot.id" class="snapshot-row">
      <ArchiveRestore :size="19" />
      <div>
        <strong>{{ snapshot.label }}</strong>
        <p>
          {{ formatDate(snapshot.createdAt, true) }} · {{ snapshot.files.length }}
          {{ t('个配置位置 ·') }} {{ snapshot.status === 'restored' ? t('已还原') : t('可还原') }}
        </p>
        <small v-if="snapshot.timezone?.system"
          >{{ t('系统时区：') }}{{ snapshot.timezone.system }} {{ t('· 包含 TZ')
          }}<span v-if="snapshot.timezone.automatic !== undefined">
            {{ t('· 自动时区') }}{{ snapshot.timezone.automatic ? t('开启') : t('关闭') }}</span
          ></small
        >
        <small v-if="snapshot.restoredAt"
          >{{ t('已在') }} {{ formatDate(snapshot.restoredAt, true) }} {{ t('还原') }}</small
        >
        <details v-if="snapshot.excludedFiles.length" class="snapshot-exclusions">
          <summary>{{ snapshot.excludedFiles.length }} {{ t('个文件未包含 · 查看详情') }}</summary>
          <p>{{ t('这些配置当时无法安全读取，还原时会保留其当前状态。请手动核对。') }}</p>
          <div class="backup-paths">
            <code v-for="file in snapshot.excludedFiles" :key="file">{{ file }}</code>
          </div>
        </details>
      </div>
      <button
        class="button secondary"
        :disabled="busy || !connected"
        @click="emit('preview', snapshot.id)"
      >
        {{ t('还原此快照') }}
      </button>
    </article>
  </section>

  <div class="compact-summary">
    <span class="summary-icon green"><ArchiveRestore :size="23" /></span>
    <div>
      <strong>{{ activeBackups }} {{ t('份可恢复备份') }}</strong>
      <p>{{ t('原文件内容仅保存在本机工具目录，恢复前再次校验当前文件。') }}</p>
    </div>
  </div>
  <section class="data-panel">
    <div class="panel-heading">
      <h2>{{ t('配置修改与恢复记录') }}</h2>
      <span class="quiet-text">{{ backups.length ?? 0 }} {{ t('次修改') }}</span>
    </div>
    <div v-if="!backups.length" class="empty-view">
      <ArchiveRestore :size="35" />
      <h2>{{ t('暂时没有修复备份') }}</h2>
      <p>{{ t('每次执行修复前会自动保存原始配置。') }}</p>
      <button class="button secondary" @click="emit('overview')">{{ t('返回环境检测') }}</button>
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
              ? t('可恢复')
              : backup.status === 'restored'
                ? t('已恢复')
                : t('修复中断')
          }}</span>
        </div>
        <p>{{ backup.label ?? formatFixes(backup.fixIds) }}</p>
        <div class="backup-paths">
          <code v-for="file in backup.files" :key="file">{{ file }}</code>
        </div>
        <small v-if="backup.restoredAt"
          >{{ t('已在') }} {{ formatDate(backup.restoredAt) }} {{ t('恢复') }}</small
        >
      </div>
      <button
        v-if="backup.status === 'applied'"
        class="button secondary"
        :disabled="busy || !connected"
        @click="emit('restore', backup)"
      >
        <RotateCcw :size="14" />{{ t('恢复原配置') }}
      </button>
    </article>
  </section>
  <section class="scope-note">
    <LockKeyhole :size="19" />
    <div>
      <h3>{{ t('保留你后来的修改') }}</h3>
      <p>
        {{
          t(
            '如果修复后又编辑过配置，自动恢复会停止，防止覆盖新内容。你可以在 ~/.claude-guard/backups.json 中对照原始备份。',
          )
        }}
      </p>
    </div>
  </section>
</template>
