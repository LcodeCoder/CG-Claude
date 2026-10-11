<script setup lang="ts">
import { computed, ref } from 'vue'
import { browserLanguageOptions } from '../../shared/browser-language'
import type { Preferences } from '../../shared/types'
const draft = defineModel<Preferences>({ required: true })
defineProps<{ prefix: string }>()
const browser = ref<'chrome' | 'edge' | 'firefox' | 'safari'>('chrome')
const guides = {
  chrome: {
    url: 'https://support.google.com/chrome/answer/173424?hl=en',
    steps: [
      '打开 Chrome 设置 → 语言，在首选语言中添加目标英文。',
      '将目标英文移到网页语言列表的第一位；English 与 English (United States) 的地区标记不同。',
      '重新打开浏览器，在原检测网站复检。macOS 的界面语言与网页语言可能分别设置。',
    ],
  },
  edge: {
    url: 'https://support.microsoft.com/en-us/edge/use-microsoft-edge-in-another-language',
    steps: [
      '打开 Edge 设置 → 语言，在首选语言中添加目标英文。',
      '将目标英文移到首选语言列表顶部。',
      '重新打开 Edge，在原检测网站复检。',
    ],
  },
  firefox: {
    url: 'https://support.mozilla.org/en-US/kb/choose-display-languages-multilingual-web-pages',
    steps: [
      '打开 Firefox 设置 → 常规 → 语言；新版也可从「语言 → 网站语言」进入。',
      '在网页内容的语言设置中添加目标英文，移到第一位并保存。',
      '重新打开 Firefox，在原检测网站复检。',
    ],
  },
  safari: {
    url: 'https://support.apple.com/guide/mac-help/change-the-system-language-mh26684/mac',
    steps: [
      '打开 macOS 系统设置 → 通用 → 语言与地区。',
      '核对首选语言与地区；Safari 的界面语言和网站收到的语言标记需分别确认。修改会影响系统中其他应用。',
      '重新打开 Safari，在原检测网站复检。',
    ],
  },
}
const guide = computed(() => guides[browser.value])
</script>
<template>
  <div class="browser-language-preferences">
    <div class="field-row">
      <label :for="`${prefix}-browser-language`"
        >浏览器语言目标<span>检测目标；实际修改在“检测偏好”的外部浏览器配置中执行。</span></label
      >
      <select :id="`${prefix}-browser-language`" v-model="draft.expectedBrowserLanguage">
        <option v-for="option in browserLanguageOptions" :key="option.value" :value="option.value">
          {{ option.title }}
        </option>
      </select>
    </div>
    <details class="browser-language-help">
      <summary>如何设置英文与地区标记</summary>
      <div class="browser-language-help-content">
        <label :for="`${prefix}-language-browser`">选择实际使用的浏览器</label>
        <select :id="`${prefix}-language-browser`" v-model="browser">
          <option value="chrome">Chrome</option>
          <option value="edge">Microsoft Edge</option>
          <option value="firefox">Firefox</option>
          <option value="safari">Safari / macOS</option>
        </select>
        <ol>
          <li v-for="step in guide.steps" :key="step">{{ step }}</li>
        </ol>
        <p>
          目标：<strong lang="en">{{ draft.expectedBrowserLanguage }}</strong
          >。CG 的中文界面和主对话翻译可继续保留。
        </p>
        <a :href="guide.url" target="_blank" rel="noopener noreferrer">查看浏览器官方说明</a>
      </div>
    </details>
  </div>
</template>
