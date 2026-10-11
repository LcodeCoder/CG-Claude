<script setup lang="ts">
import { useUiText } from '../i18n'
import { usageModeOptions } from '../../shared/usage-modes'
import { privacyCompatibilityNote } from '../../shared/privacy'
import { Check, Info, Laptop, LoaderCircle, LockKeyhole, Network } from '@lucide/vue'
import type { Preferences } from '../../shared/types'
import type {
  BrowserLanguageConfiguration,
  BrowserLanguageRequest,
  BrowserLanguagePreview,
} from '../../shared/browser-configuration'
import BrowserLanguageConfigurator from '../components/BrowserLanguageConfigurator.vue'
import TimezonePreferences from '../components/TimezonePreferences.vue'
import BrowserLanguagePreferences from '../components/BrowserLanguagePreferences.vue'

const { t } = useUiText()

const draft = defineModel<Preferences>({ required: true })
defineProps<{
  busy: boolean
  working: boolean
  connected: boolean
  changed: boolean
  browserLanguages?: BrowserLanguageConfiguration
  previewBrowserLanguage: (
    value: BrowserLanguageRequest,
  ) => Promise<BrowserLanguagePreview | undefined>
  applyBrowserLanguage: (id: string) => Promise<boolean>
  restoreBrowserLanguage: (id: string) => Promise<boolean>
}>()
const emit = defineEmits<{ save: [preferences: Preferences] }>()
</script>
<template>
  <form class="settings-panel data-panel" @submit.prevent="emit('save', { ...draft })">
    <div class="settings-section">
      <div class="settings-section-heading">
        <Network :size="20" />
        <div>
          <h2>{{ t('网络与服务') }}</h2>
          <p>{{ t('根据你实际使用的方式判断哪些配置需要保留。') }}</p>
        </div>
      </div>
      <div class="field-row">
        <label for="route-mode"
          >{{ t('网络模式') }}<span>{{ t('使用 TUN 时才建议移除持久代理配置。') }}</span></label
        ><select id="route-mode" v-model="draft.routeMode">
          <option value="system">{{ t('系统 / HTTP 代理') }}</option>
          <option value="tun">{{ t('TUN 全流量接管') }}</option>
          <option value="custom">{{ t('自定义路由') }}</option>
        </select>
      </div>
      <div class="field-row">
        <label for="usage-mode"
          >{{ t('Claude 使用方式')
          }}<span>{{ t('自定义或云平台模式会保留相关 API 配置。') }}</span></label
        ><select id="usage-mode" v-model="draft.usageMode">
          <option v-for="option in usageModeOptions" :key="option.value" :value="option.value">
            {{ t(option.title) }}
          </option>
        </select>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-heading">
        <Laptop :size="20" />
        <div>
          <h2>{{ t('环境期望值') }}</h2>
          <p>{{ t('时区按明确目标检测，出口地区可另外选择。') }}</p>
        </div>
      </div>
      <TimezonePreferences v-model="draft" prefix="settings" />
      <BrowserLanguagePreferences v-model="draft" prefix="settings" />
      <div class="field-row">
        <label for="expected-country"
          >{{ t('期望出口国家 / 地区')
          }}<span>{{ t('这是网络核对条件，与服务实际支持资格不同。') }}</span></label
        ><select id="expected-country" v-model="draft.expectedCountry">
          <option value="">{{ t('不指定期望地区') }}</option>
          <option value="US">{{ t('美国 (US)') }}</option>
          <option value="TW">{{ t('台湾 (TW)') }}</option>
          <option value="SG">{{ t('新加坡 (SG)') }}</option>
          <option value="JP">{{ t('日本 (JP)') }}</option>
          <option value="GB">{{ t('英国 (GB)') }}</option>
          <option value="DE">{{ t('德国 (DE)') }}</option>
          <option value="CA">{{ t('加拿大 (CA)') }}</option>
          <option value="AU">{{ t('澳大利亚 (AU)') }}</option>
          <option value="CN">{{ t('中国 (CN)') }}</option>
          <option value="HK">{{ t('香港 (HK)') }}</option>
        </select>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-heading">
        <LockKeyhole :size="20" />
        <div>
          <h2>{{ t('Claude Code 隐私偏好') }}</h2>
          <p>{{ t('修改偏好后，仍需在修复预览中执行配置写入。') }}</p>
        </div>
      </div>
      <label class="radio-card" :class="{ selected: draft.privacy === 'balanced' }"
        ><input v-model="draft.privacy" type="radio" value="balanced" name="privacy" /><span
          ><strong>{{ t('关闭使用指标与错误报告') }}</strong
          ><small>{{ t('设置 DISABLE_TELEMETRY 与 DISABLE_ERROR_REPORTING。') }}</small></span
        ></label
      ><label class="radio-card" :class="{ selected: draft.privacy === 'minimal' }"
        ><input v-model="draft.privacy" type="radio" value="minimal" name="privacy" /><span
          ><strong>{{ t('关闭全部非必要流量') }}</strong
          ><small>{{ t('另外设置 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC。') }}</small></span
        ></label
      >
      <p class="privacy-impact">
        <Info :size="15" />{{ privacyCompatibilityNote }} {{ t('已有设置保留。') }}
      </p>
    </div>
    <div class="settings-footer">
      <span>{{ changed ? t('有尚未保存的偏好') : t('偏好已同步到本机') }}</span
      ><button class="button primary" :disabled="busy || !connected || !changed">
        <LoaderCircle v-if="working" class="spin" :size="15" /><Check v-else :size="15" />{{
          t('保存检测偏好')
        }}
      </button>
    </div>
  </form>
  <BrowserLanguageConfigurator
    :configuration="browserLanguages"
    :language="draft.expectedBrowserLanguage"
    :busy="busy"
    :connected="connected"
    :preview="previewBrowserLanguage"
    :apply="applyBrowserLanguage"
    :restore="restoreBrowserLanguage"
  />
</template>
