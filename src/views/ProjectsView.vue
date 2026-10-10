<script setup lang="ts">
import { FileCode2, LoaderCircle, Search } from '@lucide/vue'
import { statusLabels } from '../../shared/types'
import type { ProjectReport } from '../../shared/types'
const projectPath = defineModel<string>({ required: true })
defineProps<{
  report?: ProjectReport
  busy: boolean
  working: boolean
  connected: boolean
  desktop: boolean
}>()
const emit = defineEmits<{ scan: [path: string]; choose: [] }>()
</script>
<template>
  <form class="project-picker data-panel" @submit.prevent="emit('scan', projectPath.trim())">
    <label for="project-path">本地项目目录</label>
    <div>
      <input id="project-path" v-model.trim="projectPath" placeholder="输入项目绝对路径" /><button
        v-if="desktop"
        type="button"
        class="button secondary"
        :disabled="busy"
        @click="emit('choose')"
      >
        选择目录</button
      ><button class="button primary" :disabled="busy || !projectPath || !connected">
        <LoaderCircle v-if="working" class="spin" :size="16" /><Search v-else :size="16" />扫描项目
      </button>
    </div>
    <p>
      检查 Claude 项目设置、MCP、npm / Git 代理、TLS、依赖清单和本地 Git
      提交。仅读取固定配置位置，密钥值会隐藏。
    </p>
  </form>
  <section v-if="report" class="data-panel project-results">
    <div class="panel-heading">
      <div>
        <h2>{{ report.findings.length }} 项项目配置检查</h2>
        <p>{{ report.root }}</p>
      </div>
      <span class="quiet-text"
        >{{ report.counts.fail }} 项需处理 · {{ report.counts.warn }} 项需关注</span
      >
    </div>
    <article v-for="finding in report.findings" :key="finding.id" class="project-finding">
      <span class="project-status" :class="finding.status">{{ statusLabels[finding.status] }}</span>
      <div>
        <h3>{{ finding.title }}</h3>
        <p>{{ finding.summary }}</p>
        <dl v-if="finding.evidence.length">
          <template v-for="evidence in finding.evidence" :key="evidence.label"
            ><dt>{{ evidence.label }}</dt>
            <dd>{{ evidence.value }}</dd></template
          >
        </dl>
        <small>{{ finding.recommendation }}</small>
      </div>
    </article>
  </section>
  <section v-else class="data-panel empty-view">
    <FileCode2 :size="34" />
    <h2>选择项目，检查配置覆盖</h2>
    <p>项目中的设置可能覆盖全局配置。扫描后可以逐项对照处理建议。</p>
  </section>
  <p class="wizard-hint">
    本页检查已列出的配置与元数据。代码缺陷、业务逻辑、其他语言依赖和远端 Git
    备份需要项目自己的测试与审查。
  </p>
</template>
