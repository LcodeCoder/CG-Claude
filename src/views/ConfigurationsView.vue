<script setup lang="ts">
import { useUiText } from '../i18n'
import { computed, ref } from 'vue'
import { CircleDot, Copy, FileCode2, ScanLine } from '@lucide/vue'
import type { ConfigFileInfo, RepairPlan } from '../../shared/types'
import type { ConnectionConfiguration, ConnectionRequest } from '../../shared/connections'
import ConnectionEditor from '../components/ConnectionEditor.vue'

import '../styles/configurations.css'

const { t } = useUiText()

const props = defineProps<{
  files: ConfigFileInfo[]
  busy: boolean
  connected: boolean
  connection?: ConnectionConfiguration
  preview: (request: ConnectionRequest) => Promise<RepairPlan | undefined>
  save: (id: string) => Promise<boolean>
}>()
const emit = defineEmits<{ scan: []; copy: [path: string]; references: []; backups: [] }>()
const filter = ref<'existing' | 'missing' | 'all'>('existing')
const existingFiles = computed(() => props.files.filter((file) => file.exists).length)
const visibleFiles = computed(() =>
  props.files.filter((file) =>
    filter.value === 'all' ? true : filter.value === 'existing' ? file.exists : !file.exists,
  ),
)
const groups = computed(() =>
  [
    {
      id: 'claude',
      label: 'Claude Code',
      matches: (file: ConfigFileInfo) => file.id.startsWith('claude'),
    },
    {
      id: 'terminal',
      label: '终端',
      matches: (file: ConfigFileInfo) => !/^(claude|npm|git)/.test(file.id),
    },
    {
      id: 'tools',
      label: '开发工具',
      matches: (file: ConfigFileInfo) => /^(npm|git)/.test(file.id),
    },
  ]
    .map((group) => ({ ...group, files: visibleFiles.value.filter(group.matches) }))
    .filter((group) => group.files.length),
)
</script>
<template>
  <ConnectionEditor
    :config="connection"
    :busy="busy"
    :connected="connected"
    :preview="preview"
    :save="save"
    @scan="emit('scan')"
    @references="emit('references')"
    @backups="emit('backups')"
  />
  <section class="data-panel configuration-files" aria-labelledby="config-files-title">
    <div class="panel-heading">
      <h2 id="config-files-title">{{ t('配置文件') }}</h2>
      <button class="button secondary" :disabled="busy || !connected" @click="emit('scan')">
        <ScanLine :size="15" />{{ t('检测配置') }}
      </button>
    </div>
    <div class="config-list-toolbar">
      <div class="filter-tabs" role="group" :aria-label="t('筛选配置文件')">
        <button
          :aria-pressed="filter === 'existing'"
          :class="{ active: filter === 'existing' }"
          @click="filter = 'existing'"
        >
          {{ t('已存在') }} <span>{{ existingFiles }}</span>
        </button>
        <button
          :aria-pressed="filter === 'missing'"
          :class="{ active: filter === 'missing' }"
          @click="filter = 'missing'"
        >
          {{ t('未创建') }} <span>{{ files.length - existingFiles }}</span>
        </button>
        <button
          :aria-pressed="filter === 'all'"
          :class="{ active: filter === 'all' }"
          @click="filter = 'all'"
        >
          {{ t('全部') }}
        </button>
      </div>
      <span class="sr-only" role="status"
        >{{ t('显示') }} {{ visibleFiles.length }} {{ t('个配置文件') }}</span
      >
    </div>
    <div v-if="!visibleFiles.length" class="config-list-empty">
      <FileCode2 :size="24" />
      <p>{{ filter === 'existing' ? t('还没有现有配置文件') : t('所有配置位置都已创建') }}</p>
      <button v-if="filter === 'existing'" class="text-link" @click="filter = 'all'">
        {{ t('查看可配置的位置') }}
      </button>
    </div>
    <section v-for="group in groups" :key="group.id" :aria-labelledby="'config-group-' + group.id">
      <h3 :id="'config-group-' + group.id" class="config-group-heading">{{ t(group.label) }}</h3>
      <div v-for="file in group.files" :key="file.id" class="config-file-row">
        <span class="file-icon" :class="{ missing: !file.exists }"><FileCode2 :size="18" /></span>
        <div class="config-file-title">
          <strong>{{ file.label }}</strong>
          <button
            class="path-copy"
            :aria-label="t('复制配置路径 ') + file.path"
            :title="file.path"
            @click="emit('copy', file.path)"
          >
            <span>{{ file.path }}</span
            ><Copy :size="13" />
          </button>
          <p v-if="!file.editable" class="config-file-description">{{ file.summary }}</p>
        </div>
        <span
          class="file-state"
          :class="!file.editable ? 'protected' : file.exists ? 'exists' : 'missing'"
        >
          <CircleDot :size="11" />{{
            !file.editable ? t('需手动处理') : file.exists ? t('已存在') : t('未创建')
          }}
        </span>
      </div>
    </section>
    <p v-if="filter !== 'existing'" class="config-list-note">
      {{ t('未创建的文件，仅在配置需要时创建。') }}
    </p>
  </section>
  <details class="config-scope-details">
    <summary>{{ t('修改范围') }}</summary>
    <p>
      {{
        t(
          '每次修改先列出目标文件与字段，确认后保存备份。复杂 shell 表达式、符号链接、项目与托管配置需要手动处理。',
        )
      }}
    </p>
    <p>{{ t('不读取账号密码或系统钥匙串。') }}</p>
  </details>
</template>
