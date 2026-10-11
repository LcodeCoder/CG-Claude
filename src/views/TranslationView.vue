<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, Languages } from '@lucide/vue'
import BrandMark from '../components/BrandMark.vue'
import '../styles/translation.css'

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
        <strong>原生 Claude Code</strong>
        <p>当前为方案预览，翻译模型和终端接入尚未启用。</p>
      </div>
      <span class="translation-label">方案预览</span>
    </div>

    <section class="translation-panel" aria-labelledby="translation-flow-title">
      <div class="translation-section-heading">
        <h2 id="translation-flow-title">主对话流程</h2>
        <span class="translation-example-label">示例</span>
      </div>
      <ol class="translation-flow" aria-label="中文提问与回复的翻译流程">
        <li>
          <span class="translation-step-number" aria-hidden="true">1</span>
          <h3>输入中文</h3>
          <p lang="zh-CN">{{ example.chinesePrompt }}</p>
          <ArrowRight class="translation-flow-arrow" :size="18" aria-hidden="true" />
        </li>
        <li>
          <span class="translation-step-number" aria-hidden="true">2</span>
          <h3>英文提交</h3>
          <p lang="en">{{ example.englishPrompt }}</p>
          <ArrowRight class="translation-flow-arrow" :size="18" aria-hidden="true" />
        </li>
        <li>
          <span class="translation-step-number" aria-hidden="true">3</span>
          <h3>中文展示</h3>
          <p lang="zh-CN">{{ example.chineseReply }}</p>
        </li>
      </ol>
      <p class="translation-flow-note">译文只用于显示，继续对话使用英文原文。</p>
    </section>

    <section class="translation-panel" aria-labelledby="translation-preview-title">
      <div class="translation-section-heading">
        <h2 id="translation-preview-title">回复预览</h2>
        <div class="translation-display-options" role="group" aria-label="示例回复显示语言">
          <button type="button" :aria-pressed="!showOriginal" @click="showOriginal = false">
            中文显示
          </button>
          <button type="button" :aria-pressed="showOriginal" @click="showOriginal = true">
            英文原文
          </button>
        </div>
      </div>
      <div class="translation-message">
        <BrandMark />
        <div>
          <strong>Claude <span class="translation-example-label">对话示例</span></strong>
          <p :lang="showOriginal ? 'en' : 'zh-CN'">{{ displayedReply }}</p>
        </div>
      </div>
    </section>

    <section class="translation-panel translation-scope" aria-labelledby="translation-scope-title">
      <h2 id="translation-scope-title">翻译范围</h2>
      <dl>
        <div>
          <dt>双向翻译</dt>
          <dd>你的提问、主对话回复</dd>
        </div>
        <div>
          <dt>保留原文</dt>
          <dd>思考、工具调用、参数与结果</dd>
        </div>
      </dl>
    </section>
  </div>
</template>
