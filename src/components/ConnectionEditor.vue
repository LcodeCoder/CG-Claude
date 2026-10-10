<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { BookOpen, Check, ChevronDown, Settings2, ShieldCheck } from '@lucide/vue'
import { connectionFields, connectionValueError } from '../../shared/connections'
import type {
  ConnectionConfiguration,
  ConnectionKey,
  ConnectionRequest,
} from '../../shared/connections'
import type { RepairPlan } from '../../shared/types'
import { formatDate } from '../lib/format'
import GuardDialog from './GuardDialog.vue'
import '../styles/connections.css'
const props = defineProps<{
  config?: ConnectionConfiguration
  busy: boolean
  connected: boolean
  preview: (request: ConnectionRequest) => Promise<RepairPlan | undefined>
  save: (id: string) => Promise<boolean>
}>()
const emit = defineEmits<{ references: []; backups: []; scan: [] }>()
type Action = 'keep' | 'set' | 'remove'
const drafts = ref(
  Object.fromEntries(
    connectionFields.map((field) => [field.key, { action: 'keep' as Action, value: '' }]),
  ) as Record<ConnectionKey, { action: Action; value: string }>,
)
const expanded = ref(false)
const plan = ref<RepairPlan>()
const attempted = ref(false)
const saved = ref(false)
const savedNotice = ref<HTMLElement>()
const selectedCount = computed(
  () => connectionFields.filter((field) => drafts.value[field.key].action !== 'keep').length,
)
function current(key: ConnectionKey) {
  return props.config?.fields.find((field) => field.key === key)?.current ?? '尚未读取此文件'
}
function fieldError(key: ConnectionKey) {
  const draft = drafts.value[key]
  return draft.action === 'set' ? connectionValueError(key, draft.value) : undefined
}
async function prepare() {
  attempted.value = true
  const invalid = connectionFields.find((field) => fieldError(field.key))
  if (!selectedCount.value) return
  if (invalid) {
    await nextTick()
    document.getElementById('value-' + invalid.key)?.focus()
    return
  }
  const changes = connectionFields
    .filter((field) => drafts.value[field.key].action !== 'keep')
    .map((field) => ({
      key: field.key,
      value: drafts.value[field.key].action === 'remove' ? null : drafts.value[field.key].value,
    }))
  plan.value = await props.preview({ changes })
}
async function apply() {
  if (!plan.value || !(await props.save(plan.value.id))) return
  plan.value = undefined
  saved.value = true
  attempted.value = false
  for (const field of connectionFields) drafts.value[field.key] = { action: 'keep', value: '' }
  await nextTick()
  savedNotice.value?.focus({ preventScroll: true })
  savedNotice.value?.scrollIntoView({ block: 'nearest' })
}
</script>
<template>
  <section class="connection-panel data-panel" aria-label="Claude Code 用户连接设置">
    <div class="panel-heading">
      <div>
        <h2>配置代理与网关</h2>
        <p>在本机保存连接设置，修改前先核对预览。</p>
      </div>
      <button
        class="button secondary"
        :aria-expanded="expanded"
        aria-controls="connection-form"
        :disabled="busy || !connected"
        @click="expanded = !expanded"
      >
        <Settings2 :size="15" />{{ expanded ? '收起设置' : '编辑连接设置'
        }}<ChevronDown :size="14" :class="{ rotated: expanded }" />
      </button>
    </div>
    <form v-if="expanded" id="connection-form" class="connection-form" @submit.prevent="prepare">
      <div class="connection-scope">
        <strong>目标文件：{{ config?.path ?? '~/.claude/settings.json' }}</strong>
        <p>默认保持全部现有设置。只选择要修改的项；当前地址里的凭据、路径和查询参数会隐藏。</p>
        <p>
          对 HTTP(S)_PROXY / NO_PROXY 的操作会一起处理此文件中同名的小写项，具体变化会列在预览中。
        </p>
        <button type="button" class="text-link" @click="emit('references')">
          <BookOpen :size="14" />查看网络配置依据
        </button>
      </div>
      <div v-if="!config?.editable" class="notice error-notice" role="status">
        {{ config?.reason ?? '本机配置尚未读取，请重新连接后再编辑。' }}
      </div>
      <fieldset :disabled="busy || !connected || !config?.editable">
        <legend class="sr-only">选择需要修改的连接设置</legend>
        <div v-for="field in connectionFields" :key="field.key" class="connection-field">
          <div class="connection-field-heading">
            <label :for="'action-' + field.key"
              >{{ field.title }}<code>{{ field.key }}</code></label
            >
            <select
              :id="'action-' + field.key"
              v-model="drafts[field.key].action"
              :aria-label="field.title + '操作'"
              @change="saved = false"
            >
              <option value="keep">保持当前</option>
              <option value="set">设置新值</option>
              <option value="remove">移除此项</option>
            </select>
          </div>
          <p class="connection-current">{{ current(field.key) }}</p>
          <template v-if="drafts[field.key].action === 'set'">
            <input
              :id="'value-' + field.key"
              v-model="drafts[field.key].value"
              :aria-label="field.title + '新值'"
              :placeholder="field.placeholder"
              :aria-invalid="attempted && Boolean(fieldError(field.key))"
              :aria-describedby="
                'help-' +
                field.key +
                (attempted && fieldError(field.key) ? ' error-' + field.key : '')
              "
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              maxlength="2048"
              @input="saved = false"
            />
            <p
              v-if="attempted && fieldError(field.key)"
              :id="'error-' + field.key"
              class="connection-field-error"
              role="alert"
            >
              {{ fieldError(field.key) }}
            </p>
          </template>
          <p v-else-if="drafts[field.key].action === 'remove'" class="connection-remove-note">
            将移除此文件中的对应项，其他配置层仍可能生效。
          </p>
          <p :id="'help-' + field.key" class="connection-help">{{ field.help }}</p>
        </div>
      </fieldset>
      <div class="connection-actions">
        <span>{{
          selectedCount ? '已选择 ' + selectedCount + ' 个配置项' : '请选择需要修改的项'
        }}</span>
        <button
          class="button primary"
          :disabled="busy || !connected || !config?.editable || !selectedCount"
        >
          预览连接修改
        </button>
      </div>
      <div v-if="saved" ref="savedNotice" class="connection-saved" role="status" tabindex="-1">
        <Check :size="17" />
        <div>
          <strong>设置已保存，原配置可以还原</strong>
          <p>重新启动 Claude Code，再通过 /status 核对实际生效。也可以先做本机复检。</p>
          <button type="button" class="text-link" @click="emit('scan')">检测保存后的配置</button>
          <button type="button" class="text-link" @click="emit('backups')">查看快照与备份</button>
        </div>
      </div>
    </form>
  </section>
  <GuardDialog
    :open="Boolean(plan)"
    title="预览连接设置修改"
    wide
    :locked="busy"
    description="确认目标文件和每一项变化，保存前会自动创建快照。"
    @close="plan = undefined"
  >
    <template v-if="plan">
      <div v-for="file in plan.files" :key="file.path" class="connection-preview-file">
        <h3>{{ file.path }}<small v-if="!file.exists">保存时创建此文件</small></h3>
        <div v-for="change in file.changes" :key="change.key" class="connection-preview-change">
          <strong>{{ change.key }}</strong>
          <dl>
            <dt>当前</dt>
            <dd>{{ change.before }}</dd>
            <dt>保存后</dt>
            <dd>{{ change.after }}</dd>
          </dl>
        </div>
      </div>
      <ul class="connection-preview-notes">
        <li v-for="note in plan.notes" :key="note">{{ note }}</li>
      </ul>
      <p class="quiet-text">
        预览有效至 {{ formatDate(plan.expiresAt, true) }}，期间文件变化会停止保存。
      </p>
    </template>
    <template #footer
      ><button class="button secondary" :disabled="busy" @click="plan = undefined">返回编辑</button>
      <button class="button primary" :disabled="busy || !connected" @click="apply">
        <ShieldCheck :size="15" />保存并创建快照
      </button>
    </template>
  </GuardDialog>
</template>
