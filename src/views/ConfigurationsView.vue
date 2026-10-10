<script setup lang="ts">
import { computed } from 'vue'
import { CircleDot, FileCode2, FolderCog, Info, ScanLine } from '@lucide/vue'
import type { ConfigFileInfo } from '../../shared/types'
const props = defineProps<{ files: ConfigFileInfo[]; busy: boolean; connected: boolean }>()
const emit = defineEmits<{ scan: []; copy: [path: string] }>()
const existingFiles = computed(() => props.files.filter((file) => file.exists).length)
</script>
<template>
  <div class="compact-summary">
    <span class="summary-icon"><FolderCog :size="23" /></span>
    <div>
      <strong>{{ existingFiles }} 个现有配置文件</strong>
      <p>检测 {{ files.length }} 个已知用户配置位置，仅对选定配置生成修改。</p>
    </div>
    <button class="button secondary" :disabled="busy || !connected" @click="emit('scan')">
      <ScanLine :size="15" />检测本机配置
    </button>
  </div>
  <section class="data-panel">
    <div class="panel-heading">
      <h2>本机配置位置</h2>
      <span class="quiet-text">原始内容留在你的电脑上</span>
    </div>
    <div v-for="file in files" :key="file.id" class="config-file-row">
      <span class="file-icon" :class="{ missing: !file.exists }"><FileCode2 :size="20" /></span>
      <div class="config-file-title">
        <strong>{{ file.label }}</strong
        ><button class="path-copy" :title="'复制 ' + file.path" @click="emit('copy', file.path)">
          {{ file.path }}
        </button>
      </div>
      <span class="config-description">{{ file.summary }}</span
      ><span
        class="file-state"
        :class="file.exists ? (file.editable ? 'exists' : 'protected') : 'missing'"
        ><CircleDot :size="11" />{{
          file.exists ? (file.editable ? '已存在' : '需手动处理') : '尚未创建'
        }}</span
      >
    </div>
  </section>
  <section class="scope-note">
    <Info :size="19" />
    <div>
      <h3>修改范围清楚可见</h3>
      <p>
        修复只移除所选代理项或 API 地址覆盖，隐私设置使用官方环境变量。复杂 shell
        表达式、符号链接、项目与托管配置会保留供你手动确认。工具不读取账号密码或系统钥匙串。
      </p>
    </div>
  </section>
</template>
