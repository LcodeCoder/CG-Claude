<script setup lang="ts">
import { useUiText } from '../i18n'
import { computed, ref } from 'vue'
import { ArrowRight, Languages } from '@lucide/vue'
import BrandMark from '../components/BrandMark.vue'
import TranslationModelSettings from '../components/TranslationModelSettings.vue'
import type {
  TranslationConfiguration,
  TranslationRequest,
  TranslationTestResult,
} from '../../shared/translation'

defineProps<{
  configuration?: TranslationConfiguration
  busy: boolean
  connected: boolean
  save: (request: TranslationRequest) => Promise<boolean>
  test: (request: TranslationRequest) => Promise<TranslationTestResult | undefined>
}>()
import '../styles/translation.css'

const { t } = useUiText()

// Preview text stays in this view; it is never submitted to Claude or a translation service.
const showOriginal = ref(false)
const example = {
  chinesePrompt: '请检查这个项目，并修复测试。',
  englishPrompt: 'Check this project and fix the tests.',
  englishReply: 'I will inspect the project, identify the failing tests, and fix them.',
  chineseReply: '我会检查项目，定位失败的测试并修复。',
}
const displayedReply = computed(() =>
  showOriginal.value ? example.englishReply : example.chineseReply,
)
</script>

<template>
  <div class="translation-view">
    <div class="translation-status" role="status">
      <Languages :size="18" aria-hidden="true" />
      <div>
        <strong>{{ t('Claude Code 接入') }}</strong>
        <p>{{ t('尚未接入原生终端。可先配置模型并测试双向翻译。') }}</p>
      </div>
      <span class="translation-label">{{ t('未接入') }}</span>
    </div>

    <TranslationModelSettings
      :configuration="configuration"
      :busy="busy"
      :connected="connected"
      :save="save"
      :test="test"
    />

    <details class="translation-example-details">
      <summary>{{ t('查看主对话翻译流程') }}</summary>
      <section class="translation-panel" aria-labelledby="translation-flow-title">
        <div class="translation-section-heading">
          <h2 id="translation-flow-title">{{ t('主对话流程') }}</h2>
          <span class="translation-example-label">{{ t('示例') }}</span>
        </div>
        <ol class="translation-flow" :aria-label="t('中文提问与回复的翻译流程')">
          <li>
            <span class="translation-step-number" aria-hidden="true">1</span>
            <h3>{{ t('输入中文') }}</h3>
            <p lang="zh-CN">{{ example.chinesePrompt }}</p>
            <ArrowRight class="translation-flow-arrow" :size="18" aria-hidden="true" />
          </li>
          <li>
            <span class="translation-step-number" aria-hidden="true">2</span>
            <h3>{{ t('英文提交') }}</h3>
            <p lang="en">{{ example.englishPrompt }}</p>
            <ArrowRight class="translation-flow-arrow" :size="18" aria-hidden="true" />
          </li>
          <li>
            <span class="translation-step-number" aria-hidden="true">3</span>
            <h3>{{ t('中文展示') }}</h3>
            <p lang="zh-CN">{{ example.chineseReply }}</p>
          </li>
        </ol>
        <p class="translation-flow-note">{{ t('译文只用于显示，继续对话使用英文原文。') }}</p>
      </section>

      <section class="translation-panel" aria-labelledby="translation-preview-title">
        <div class="translation-section-heading">
          <h2 id="translation-preview-title">{{ t('回复预览') }}</h2>
          <div class="translation-display-options" role="group" :aria-label="t('示例回复显示语言')">
            <button type="button" :aria-pressed="!showOriginal" @click="showOriginal = false">
              {{ t('中文显示') }}
            </button>
            <button type="button" :aria-pressed="showOriginal" @click="showOriginal = true">
              {{ t('英文原文') }}
            </button>
          </div>
        </div>
        <div class="translation-message">
          <BrandMark />
          <div>
            <strong
              >Claude <span class="translation-example-label">{{ t('对话示例') }}</span></strong
            >
            <p :lang="showOriginal ? 'en' : 'zh-CN'">{{ displayedReply }}</p>
          </div>
        </div>
      </section>
    </details>

    <section class="translation-panel translation-scope" aria-labelledby="translation-scope-title">
      <h2 id="translation-scope-title">{{ t('翻译范围') }}</h2>
      <dl>
        <div>
          <dt>{{ t('双向翻译') }}</dt>
          <dd>{{ t('你的提问、主对话回复') }}</dd>
        </div>
        <div>
          <dt>{{ t('保留原文') }}</dt>
          <dd>{{ t('思考、工具调用、参数与结果') }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>
