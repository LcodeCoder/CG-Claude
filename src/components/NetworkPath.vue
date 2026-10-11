<script setup lang="ts">
import { Globe, Laptop, Network, Radio, Terminal, ArrowRight, ChevronDown } from '@lucide/vue'
import { computed } from 'vue'
import type { ScanReport, CheckStatus, Machine } from '../../shared/types'
import StatusBadge from './StatusBadge.vue'
const props = defineProps<{ report?: ScanReport; machine?: Machine; scanning: boolean }>()
function state(ids: string[]): CheckStatus {
  const checks = props.report?.checks.filter((check) => ids.includes(check.id)) ?? []
  if (!checks.length) return 'skipped'
  for (const status of ['fail', 'warn', 'manual', 'pass', 'skipped'] as const)
    if (checks.some((check) => check.status === status)) return status
  return 'skipped'
}
const nodes = computed(() => [
  {
    name: '浏览器',
    icon: Globe,
    value:
      props.report?.checks.find((check) => check.id === 'browser-timezone')?.evidence[0]?.value ||
      '等待检测',
    status: state(['browser-timezone', 'webrtc']),
  },
  {
    name: '本机',
    icon: Laptop,
    value: props.machine?.platformName || '读取环境',
    status: state(['system-proxy', 'timezone']),
  },
  {
    name: 'DNS 解析',
    icon: Network,
    value: props.report ? '实际出口待复核' : '等待检测',
    status: state(['dns']),
  },
  {
    name: '网络出口',
    icon: Radio,
    value: props.report?.network?.ip || '未开启公网检测',
    status: state(['public-ip', 'route-consistency']),
  },
  {
    name: 'Claude Code',
    icon: Terminal,
    value: props.report?.checks.find((check) => check.id === 'claude-cli')?.summary || '等待检测',
    status: state(['claude-settings', 'claude-endpoint']),
  },
])
</script>
<template>
  <details class="network-path-panel" aria-label="环境连接路径">
    <summary class="panel-caption">
      <span><Network :size="14" />连接路径</span><ChevronDown :size="15" />
    </summary>
    <div class="network-path" :class="{ scanning: props.scanning }">
      <template v-for="(node, index) in nodes" :key="node.name">
        <div class="path-node">
          <div class="path-icon" :class="node.status">
            <component :is="node.icon" :size="23" :stroke-width="1.65" /><StatusBadge
              v-if="props.report"
              :status="node.status"
              compact
            />
          </div>
          <strong>{{ node.name }}</strong
          ><span class="path-value" :title="node.value">{{ node.value }}</span>
        </div>
        <div v-if="index < nodes.length - 1" class="path-connector" aria-hidden="true">
          <span /><ArrowRight :size="13" /><span />
        </div>
      </template>
    </div>
  </details>
</template>
