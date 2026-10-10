<script setup lang="ts">
import { ArrowUpRight, LockKeyhole, Terminal } from '@lucide/vue'
import BrandMark from '../components/BrandMark.vue'
import TroubleshootingGuide from '../components/TroubleshootingGuide.vue'
import type { ManualReviewId } from '../../shared/types'
defineProps<{ version: string }>()
const emit = defineEmits<{
  references: []
  check: [id: string]
  source: [id: string]
  manual: [id: ManualReviewId]
}>()
</script>
<template>
  <section class="about-intro data-panel">
    <BrandMark large />
    <h2>CG Claude</h2>
    <p>检测、预览、修复、恢复。<br />一个直接操作本机配置的环境工作台。</p>
    <span class="version-label">v{{ version }}</span>
  </section>
  <div class="about-grid">
    <section class="data-panel about-card">
      <Terminal :size="22" />
      <h3>使用方式</h3>
      <ol>
        <li>按实际网络方式设置检测偏好。</li>
        <li>开始本机检测；公网查询可选开启。</li>
        <li>选择修复项目，核对具体修改。</li>
        <li>执行修复后复检，重新启动终端。</li>
        <li>需要回退时，打开「备份恢复」。</li>
      </ol>
    </section>
    <section class="data-panel about-card">
      <LockKeyhole :size="22" />
      <h3>数据与范围</h3>
      <p>
        本机服务仅监听 127.0.0.1。配置、报告和备份保存在本机。网络检测开启时访问
        ipinfo.io、api.ipify.org 和 Google STUN；请求不包含配置与密钥。
      </p>
      <p>DNS 泄漏、账号支付与平台限制不会根据本机信息猜测。需要人工核对的结果会明确标记。</p>
    </section>
  </div>
  <TroubleshootingGuide
    @check="emit('check', $event)"
    @source="emit('source', $event)"
    @manual="emit('manual', $event)"
  />
  <section class="data-panel sources-panel">
    <div class="panel-heading">
      <h2>参考文献</h2>
      <button class="text-link" @click="emit('references')">
        查看完整文献库<ArrowUpRight :size="14" />
      </button>
    </div>
    <p class="quiet-text">
      官方说明、项目文档、社区记录与外部检测分别标注。每条文献包含核对日期、采用方式和判断边界。
    </p>
  </section>
</template>
