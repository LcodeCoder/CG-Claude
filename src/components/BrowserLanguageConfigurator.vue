<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Globe, RotateCcw, Check } from '@lucide/vue'
import type {
  BrowserLanguageConfiguration,
  BrowserLanguageRequest,
  BrowserLanguagePreview,
} from '../../shared/browser-configuration'
import GuardDialog from './GuardDialog.vue'
import { formatDate } from '../lib/format'
const props = defineProps<{
  configuration?: BrowserLanguageConfiguration
  language: BrowserLanguageRequest['language']
  busy: boolean
  connected: boolean
  backupsOnly?: boolean
  preview: (request: BrowserLanguageRequest) => Promise<BrowserLanguagePreview | undefined>
  apply: (id: string) => Promise<boolean>
  restore: (id: string) => Promise<boolean>
}>()
const selected = ref('')
const appLanguage = ref(true)
const plan = ref<BrowserLanguagePreview>()
const restoreId = ref('')
const profile = computed(() =>
  props.configuration?.profiles.find((profile) => profile.id === selected.value),
)
const enabled = computed(() => !props.busy && props.connected)
watch(
  () => props.configuration?.profiles,
  (profiles) => {
    if (!profiles?.some((profile) => profile.id === selected.value))
      selected.value = profiles?.[0]?.id ?? ''
  },
  { immediate: true },
)
async function prepare() {
  plan.value = await props.preview({
    profileId: selected.value,
    language: props.language,
    appLanguage: Boolean(appLanguage.value && profile.value?.appLanguageSupported),
  })
}
async function apply() {
  if (plan.value && (await props.apply(plan.value.id))) plan.value = undefined
}
async function restore() {
  if (restoreId.value && (await props.restore(restoreId.value))) restoreId.value = ''
}
</script>
<template>
  <section class="data-panel browser-configuration">
    <div class="panel-heading">
      <h2><Globe :size="18" />{{ backupsOnly ? '浏览器语言备份' : '外部浏览器语言配置' }}</h2>
    </div>
    <template v-if="!backupsOnly">
      <p class="browser-scope-note">修改所选浏览器。CG 内置窗口的检测结果与它独立。</p>
      <div class="field-row">
        <label for="external-browser-profile"
          >浏览器与用户配置<span>完全退出所选浏览器后保存，重开后生效。</span></label
        >
        <select
          id="external-browser-profile"
          v-model="selected"
          :disabled="!enabled || !configuration?.profiles.length"
        >
          <option v-if="!configuration?.profiles.length" value="">没有发现支持的用户配置</option>
          <option v-for="item in configuration?.profiles" :key="item.id" :value="item.id">
            {{ item.title }}
          </option>
        </select>
      </div>
      <div v-if="profile" class="browser-language-values">
        <div>
          <span>当前首选</span><code>{{ profile.selected }}</code>
        </div>
        <div>
          <span>目标</span><code>{{ language }}</code>
        </div>
      </div>
      <label v-if="profile?.appLanguageSupported" class="inline-check browser-app-language"
        ><input
          v-model="appLanguage"
          type="checkbox"
          :disabled="!enabled"
        />同时将这个浏览器的应用语言设为英文</label
      >
      <p v-if="profile?.problem" class="form-error">{{ profile.problem }}</p>
      <p v-for="problem in configuration?.problems" :key="problem" class="form-error">
        {{ problem }}
      </p>
      <div class="browser-configuration-actions">
        <span>修改前自动备份，保留其他浏览器设置。</span
        ><button
          type="button"
          class="button primary"
          :disabled="!enabled || !profile || !!profile.problem"
          @click="prepare"
        >
          预览并配置 {{ profile?.title.split(' · ')[0] ?? '浏览器' }}
        </button>
      </div>
    </template>
    <div v-if="configuration?.backups.length" class="browser-language-backups">
      <article v-for="backup in configuration.backups" :key="backup.id">
        <div>
          <strong>{{ backup.title }}</strong
          ><small
            >{{ formatDate(backup.createdAt, true) }} ·
            {{
              backup.status === 'restored'
                ? '已还原'
                : backup.status === 'prepared'
                  ? '写入待核对，原设置已备份'
                  : `已保存 ${backup.language}`
            }}</small
          >
        </div>
        <button
          type="button"
          class="button secondary"
          :disabled="!enabled || backup.status === 'restored'"
          @click="restoreId = backup.id"
        >
          <RotateCcw :size="14" />还原语言
        </button>
      </article>
    </div>
    <p v-else-if="backupsOnly" class="browser-scope-note">配置浏览器语言后，原设置会保存在这里。</p>
  </section>
  <GuardDialog :open="!!plan" title="配置浏览器语言" :locked="busy" @close="plan = undefined">
    <template v-if="plan"
      ><p class="browser-confirm-target">{{ plan.profile.title }}</p>
      <div class="browser-language-values">
        <div>
          <span>修改前</span><code>{{ plan.before }}</code>
        </div>
        <div>
          <span>修改后</span><code>{{ plan.after }}</code>
        </div>
      </div>
      <p v-if="plan.appLanguage">同时设置这个浏览器的应用语言，影响该浏览器的所有用户配置。</p>
      <p>请先完全退出所选浏览器（Mac：⌘Q）。保存后重新打开，并在同一个浏览器里复检。</p>
      <details>
        <summary>查看配置位置</summary>
        <code class="browser-config-path">{{ plan.profile.file }}</code>
      </details></template
    >
    <template #footer
      ><button type="button" class="button secondary" :disabled="busy" @click="plan = undefined">
        取消</button
      ><button type="button" class="button primary" :disabled="!enabled" @click="apply">
        <Check :size="15" />备份并保存语言
      </button></template
    >
  </GuardDialog>
  <GuardDialog :open="!!restoreId" title="还原浏览器语言" :locked="busy" @close="restoreId = ''">
    <p>完全退出对应浏览器后，将它的语言恢复到修改前。其他浏览器设置保留。</p>
    <template #footer
      ><button type="button" class="button secondary" :disabled="busy" @click="restoreId = ''">
        取消</button
      ><button type="button" class="button primary" :disabled="!enabled" @click="restore">
        还原原语言
      </button></template
    >
  </GuardDialog>
</template>
