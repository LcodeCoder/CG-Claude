<script setup lang="ts">
import { useUiText } from '../i18n'
import { computed, ref } from 'vue'
import { ArrowUpRight, BookOpen, Compass } from '@lucide/vue'
import type { ManualReviewId } from '../../shared/types'
import { environmentTerms, troubleshootingGuides } from '../content/troubleshooting'

const { t } = useUiText()

const emit = defineEmits<{
  check: [id: string]
  source: [id: string]
  manual: [id: ManualReviewId]
}>()
const selected = ref(troubleshootingGuides[0]!.id)
const guide = computed(() => troubleshootingGuides.find((item) => item.id === selected.value)!)
</script>
<template>
  <section id="troubleshooting" class="data-panel troubleshooting-panel" tabindex="-1">
    <div class="panel-heading">
      <div>
        <h2><Compass :size="21" />{{ t('遇到错误，从这里开始') }}</h2>
        <p>{{ t('选择看到的提示，查看排查步骤与依据。') }}</p>
      </div>
      <span class="help-offline">{{ t('离线可阅读') }}</span>
    </div>
    <div class="troubleshooting-choices" :aria-label="t('选择错误类型')">
      <button
        v-for="item in troubleshootingGuides"
        :key="item.id"
        :aria-pressed="selected === item.id"
        aria-controls="troubleshooting-detail"
        @click="selected = item.id"
      >
        {{ t(item.title) }}
      </button>
    </div>
    <div
      id="troubleshooting-detail"
      class="troubleshooting-detail"
      role="region"
      aria-labelledby="troubleshooting-title"
    >
      <h3 id="troubleshooting-title">{{ guide.title }}</h3>
      <p class="troubleshooting-codes">{{ guide.codes }}</p>
      <p class="troubleshooting-meaning">{{ guide.meaning }}</p>
      <ol>
        <li v-for="step in guide.steps" :key="step">{{ step }}</li>
      </ol>
      <div class="troubleshooting-actions">
        <button
          v-for="check in guide.checks"
          :key="check.id"
          class="text-link"
          @click="emit('check', check.id)"
        >
          {{ check.label }}<ArrowUpRight :size="13" />
        </button>
        <button v-if="guide.manual" class="text-link" @click="emit('manual', guide.manual!)">
          {{ t('打开人工复核') }}<ArrowUpRight :size="13" />
        </button>
        <button class="text-link" @click="emit('source', guide.source)">
          <BookOpen :size="14" />{{ t('查看原文依据') }}
        </button>
      </div>
    </div>
    <p class="troubleshooting-boundary">
      {{
        t(
          'API 状态码需要结合 error.type 和实际服务核对。网关可能返回自己的错误；本页不发送认证或付费请求。',
        )
      }}
    </p>
  </section>
  <section class="data-panel terms-panel" aria-labelledby="environment-terms-title">
    <h2 id="environment-terms-title">{{ t('读懂常见术语') }}</h2>
    <dl>
      <div v-for="item in environmentTerms" :key="item.term">
        <dt>{{ item.term }}</dt>
        <dd>{{ item.definition }}</dd>
      </div>
    </dl>
  </section>
</template>
<style src="../styles/help.css"></style>
