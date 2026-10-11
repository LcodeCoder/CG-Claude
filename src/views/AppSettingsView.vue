<script setup lang="ts">
import { Download, ExternalLink, GitBranch, LoaderCircle, RefreshCw, Star } from '@lucide/vue'
import { computed, nextTick } from 'vue'
import { PROJECT_URL } from '../../shared/app-settings'
import type { AppSettings } from '../../shared/app-settings'
import type { AppSettingsController } from '../composables/useAppSettings'
import { useUiText } from '../i18n'
import { formatDate } from '../lib/format'
import SettingSwitch from '../components/SettingSwitch.vue'

import '../styles/app-settings.css'

const { t } = useUiText()

const props = defineProps<{
  controller: AppSettingsController
  version: string
  busy: boolean
  connected: boolean
}>()
const c = props.controller
const disabled = computed(() => props.busy || !props.connected || c.saving.value || !c.loaded.value)
const startupNotes = {
  browser: '浏览器版不支持开机自启，请使用桌面版。',
  development: '源码或隔离测试模式不会注册开机自启。',
  platform: '此系统暂不支持自动配置，请使用系统的启动应用设置。',
  approval: '请在系统的登录项设置中允许 CG Claude，然后刷新状态。',
  unconfirmed: '系统尚未确认更改。请将应用放入应用程序目录，再检查登录项。',
}
const versionMessages = {
  available: '有新版本可用',
  current: '版本已是最新',
  ahead: '本机版本高于已发布版本',
  unpublished: '未找到公开正式版，请到 GitHub 查看。',
}
// Saving temporarily disables controls; return keyboard focus unless the user moved elsewhere.
async function keepControlFocus(control: HTMLElement, update: () => Promise<void>) {
  const hadFocus = document.activeElement === control
  await update()
  await nextTick()
  if (hadFocus && control.isConnected && document.activeElement === document.body)
    control.focus({ preventScroll: true })
}
// Native controls return to the confirmed value if saving or OS authorization fails.
async function changeStartup(event: Event) {
  const input = event.target as HTMLInputElement
  await keepControlFocus(input, async () => {
    await c.setStartup(input.checked)
    input.checked = c.startup.value.enabled
  })
}
async function changeMotion(event: Event) {
  const input = event.target as HTMLInputElement
  await keepControlFocus(input, async () => {
    await c.save({ reduceMotion: input.checked })
    input.checked = c.settings.value.reduceMotion
  })
}
async function changeLanguage(event: Event) {
  const select = event.target as HTMLSelectElement
  await keepControlFocus(select, async () => {
    await c.save({ language: select.value as AppSettings['language'] })
    select.value = c.settings.value.language
  })
}
async function changeTheme(theme: AppSettings['theme'], event: Event) {
  await keepControlFocus(event.currentTarget as HTMLButtonElement, () => c.save({ theme }))
}
</script>
<template>
  <div class="app-settings-view">
    <div v-if="c.error.value" class="notice error-notice" role="alert">
      <span>{{ t(c.error.value) }}</span
      ><button v-if="!c.loaded.value" class="text-link" @click="c.load">{{ t('重试') }}</button>
    </div>
    <section class="data-panel app-settings-section" aria-labelledby="appearance-title">
      <h2 id="appearance-title">{{ t('外观与语言') }}</h2>
      <div class="app-setting-row">
        <label for="app-language">{{ t('界面语言') }}</label>
        <select
          id="app-language"
          :value="c.settings.value.language"
          :disabled="disabled"
          @change="changeLanguage"
        >
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select>
      </div>
      <div class="app-setting-row">
        <div>
          <strong>{{ t('配色') }}</strong>
        </div>
        <div class="theme-options" role="group" :aria-label="t('配色')">
          <button
            :disabled="disabled"
            :aria-pressed="c.settings.value.theme === 'light'"
            @click="changeTheme('light', $event)"
          >
            <span class="theme-sample light" />{{ t('浅色') }}
          </button>
          <button
            :disabled="disabled"
            :aria-pressed="c.settings.value.theme === 'eye-care'"
            @click="changeTheme('eye-care', $event)"
          >
            <span class="theme-sample warm" />{{ t('护眼') }}
          </button>
          <button
            :disabled="disabled"
            :aria-pressed="c.settings.value.theme === 'dark'"
            @click="changeTheme('dark', $event)"
          >
            <span class="theme-sample dark" />{{ t('深色') }}
          </button>
        </div>
      </div>
      <div class="app-setting-row">
        <label for="app-motion"
          >{{ t('减少动画') }}<span>{{ t('减少过渡、旋转和滚动动画。') }}</span></label
        >
        <SettingSwitch
          id="app-motion"
          :checked="c.settings.value.reduceMotion"
          :disabled="disabled"
          @change="changeMotion"
        />
      </div>
      <p class="settings-save-state" role="status">
        {{ t(c.saving.value ? '正在保存…' : c.feedback.value) }}
      </p>
    </section>
    <section class="data-panel app-settings-section" aria-labelledby="startup-title">
      <h2 id="startup-title">{{ t('启动与窗口') }}</h2>
      <div class="app-setting-row">
        <label for="app-startup"
          >{{ t('开机自启') }}<span>{{ t('登录电脑后启动 CG Claude。') }}</span></label
        >
        <SettingSwitch
          id="app-startup"
          :checked="c.startup.value.enabled"
          :disabled="disabled || c.startupBusy.value || !c.startup.value.supported"
          @change="changeStartup"
        />
      </div>
      <div class="app-setting-note">
        <p v-if="c.startup.value.reason">{{ t(startupNotes[c.startup.value.reason]) }}</p>
        <p v-else>{{ t(c.startup.value.enabled ? '已开启' : '已关闭') }}</p>
        <button v-if="c.startup.value.supported" class="text-link" @click="c.openStartupSettings">
          {{ t('打开系统设置') }}
        </button>
        <button
          v-if="c.startup.value.supported"
          class="text-link"
          :disabled="c.startupBusy.value"
          @click="c.refreshStartup"
        >
          <RefreshCw :size="14" />{{ t('刷新状态') }}
        </button>
      </div>
      <p v-if="c.startupError.value" class="form-error" role="alert">
        {{ t(c.startupError.value) }}
      </p>
      <p class="app-setting-note">
        {{ t('最小化或关闭窗口后保留在菜单栏或托盘；从图标菜单退出应用。') }}
      </p>
    </section>
    <section class="data-panel app-settings-section" aria-labelledby="version-title">
      <h2 id="version-title">{{ t('版本与支持') }}</h2>
      <div class="app-setting-row">
        <div>
          <strong
            >{{ t('当前版本') }} <code>v{{ version }}</code></strong
          >
          <p>{{ t('仅在点击时查询 GitHub，不自动下载安装。') }}</p>
        </div>
        <button
          class="button secondary"
          :disabled="c.checking.value || !connected"
          @click="c.checkVersion"
        >
          <LoaderCircle v-if="c.checking.value" class="spin" :size="15" /><RefreshCw
            v-else
            :size="15"
          />{{ t(c.checking.value ? '正在检查…' : '检查更新') }}
        </button>
      </div>
      <div v-if="c.version.value" class="version-result" role="status">
        <strong
          >{{ t(versionMessages[c.version.value.status])
          }}<span v-if="c.version.value.latestVersion">
            · v{{ c.version.value.latestVersion }}</span
          ></strong
        >
        <small>{{ formatDate(c.version.value.checkedAt, true) }}</small>
        <a
          v-if="c.version.value.releaseUrl"
          class="text-link"
          :href="c.version.value.releaseUrl"
          target="_blank"
          rel="noopener noreferrer"
          ><Download :size="14" />{{ t('查看下载') }}</a
        >
      </div>
      <p v-if="c.versionError.value" class="form-error" role="alert">
        {{ t(c.versionError.value) }}
      </p>
      <div class="app-support-row">
        <div>
          <GitBranch :size="19" />
          <p>{{ t('觉得好用，可以给项目一个 Star。') }}</p>
        </div>
        <a class="button secondary" :href="PROJECT_URL" target="_blank" rel="noopener noreferrer"
          ><Star :size="15" />{{ t('去 GitHub 点 Star') }}</a
        >
      </div>
      <div class="app-support-links">
        <a
          class="text-link"
          :href="PROJECT_URL + '/releases'"
          target="_blank"
          rel="noopener noreferrer"
          >{{ t('查看所有版本') }}<ExternalLink :size="13"
        /></a>
        <a
          class="text-link"
          :href="PROJECT_URL + '/issues'"
          target="_blank"
          rel="noopener noreferrer"
          >{{ t('问题反馈') }}<ExternalLink :size="13"
        /></a>
      </div>
    </section>
  </div>
</template>
