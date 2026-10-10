<script setup lang="ts">
import { Check, Info, Laptop, LoaderCircle, LockKeyhole, Network } from '@lucide/vue'
import type { Preferences } from '../../shared/types'
const draft = defineModel<Preferences>({ required: true })
defineProps<{ busy: boolean; working: boolean; connected: boolean; changed: boolean }>()
const emit = defineEmits<{ save: [preferences: Preferences] }>()
</script>
<template>
  <form class="settings-panel data-panel" @submit.prevent="emit('save', { ...draft })">
    <div class="settings-section">
      <div class="settings-section-heading">
        <Network :size="20" />
        <div>
          <h2>网络与服务</h2>
          <p>根据你实际使用的方式判断哪些配置需要保留。</p>
        </div>
      </div>
      <div class="field-row">
        <label for="route-mode">网络模式<span>使用 TUN 时才建议移除持久代理配置。</span></label
        ><select id="route-mode" v-model="draft.routeMode">
          <option value="system">系统 / HTTP 代理</option>
          <option value="tun">TUN 全流量接管</option>
          <option value="custom">自定义路由</option>
        </select>
      </div>
      <div class="field-row">
        <label for="usage-mode"
          >Claude 使用方式<span>自定义或云平台模式会保留相关 API 配置。</span></label
        ><select id="usage-mode" v-model="draft.usageMode">
          <option value="official">官方默认 API</option>
          <option value="custom">自定义 API / 网关</option>
          <option value="bedrock">Amazon Bedrock</option>
          <option value="vertex">Google Vertex</option>
        </select>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-heading">
        <Laptop :size="20" />
        <div>
          <h2>环境期望值</h2>
          <p>可留空，按实际环境检测；这里的选项不修改系统地区。</p>
        </div>
      </div>
      <div class="field-row">
        <label for="expected-timezone">期望时区<span>发现差异后，先核对本机真实设置。</span></label
        ><select id="expected-timezone" v-model="draft.expectedTimezone">
          <option value="">不指定期望时区</option>
          <option value="Asia/Shanghai">Asia/Shanghai</option>
          <option value="Asia/Taipei">Asia/Taipei</option>
          <option value="Asia/Singapore">Asia/Singapore</option>
          <option value="Asia/Tokyo">Asia/Tokyo</option>
          <option value="America/Los_Angeles">America/Los_Angeles</option>
          <option value="America/New_York">America/New_York</option>
          <option value="Europe/London">Europe/London</option>
          <option value="UTC">UTC</option>
          <option
            v-if="
              draft.expectedTimezone &&
              ![
                'Asia/Shanghai',
                'Asia/Taipei',
                'Asia/Singapore',
                'Asia/Tokyo',
                'America/Los_Angeles',
                'America/New_York',
                'Europe/London',
                'UTC',
              ].includes(draft.expectedTimezone)
            "
            :value="draft.expectedTimezone"
          >
            {{ draft.expectedTimezone }}
          </option>
        </select>
      </div>
      <div class="field-row">
        <label for="expected-country"
          >期望出口国家 / 地区<span>这是网络核对条件，与服务实际支持资格不同。</span></label
        ><select id="expected-country" v-model="draft.expectedCountry">
          <option value="">不指定期望地区</option>
          <option value="US">美国 (US)</option>
          <option value="TW">台湾 (TW)</option>
          <option value="SG">新加坡 (SG)</option>
          <option value="JP">日本 (JP)</option>
          <option value="GB">英国 (GB)</option>
          <option value="DE">德国 (DE)</option>
          <option value="CA">加拿大 (CA)</option>
          <option value="AU">澳大利亚 (AU)</option>
          <option value="CN">中国 (CN)</option>
          <option value="HK">香港 (HK)</option>
        </select>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-heading">
        <LockKeyhole :size="20" />
        <div>
          <h2>Claude Code 隐私偏好</h2>
          <p>修改偏好后，仍需在修复预览中执行配置写入。</p>
        </div>
      </div>
      <label class="radio-card" :class="{ selected: draft.privacy === 'balanced' }"
        ><input v-model="draft.privacy" type="radio" value="balanced" name="privacy" /><span
          ><strong>关闭使用指标与错误报告</strong
          ><small>设置 DISABLE_TELEMETRY 与 DISABLE_ERROR_REPORTING。</small></span
        ></label
      ><label class="radio-card" :class="{ selected: draft.privacy === 'minimal' }"
        ><input v-model="draft.privacy" type="radio" value="minimal" name="privacy" /><span
          ><strong>关闭全部非必要流量</strong
          ><small>另外设置 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC。</small></span
        ></label
      >
      <p class="privacy-impact">
        <Info :size="15" />关闭使用指标或全部非必要流量会关闭功能旗标，Remote Control
        可能不可用。已有设置保留。
      </p>
    </div>
    <div class="settings-footer">
      <span>{{ changed ? '有尚未保存的偏好' : '偏好已同步到本机' }}</span
      ><button class="button primary" :disabled="busy || !connected || !changed">
        <LoaderCircle v-if="working" class="spin" :size="15" /><Check
          v-else
          :size="15"
        />保存检测偏好
      </button>
    </div>
  </form>
</template>
