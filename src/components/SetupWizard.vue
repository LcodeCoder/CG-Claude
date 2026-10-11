<script setup lang="ts">
import SetupFollowupList from './SetupFollowupList.vue'
import { setupFollowupReport } from '../../shared/manual-guidance'
import type { LocalActionId } from '../../shared/local-actions'
import TimezonePreferences from './TimezonePreferences.vue'
import BrowserLanguagePreferences from './BrowserLanguagePreferences.vue'
import { usageModeOptions, usageModeLabel } from '../../shared/usage-modes'
import { articleModeDifferences } from '../../shared/article-audit'
import { privacyCompatibilityNote } from '../../shared/privacy'
import { ref, reactive, computed, watch } from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  CircleCheck,
  CircleDashed,
  FolderCog,
  GitBranch,
  LoaderCircle,
  LockKeyhole,
  Network,
  Play,
  RefreshCw,
  ShieldCheck,
  SkipForward,
  TriangleAlert,
} from '@lucide/vue'
import GuardDialog from './GuardDialog.vue'
import { defaultPreferences, fixIds, fixLabels, setupNodeLabels } from '../../shared/types'
import type {
  Bootstrap,
  FixId,
  Preferences,
  SetupJob,
  SetupPreview,
  SetupRequest,
} from '../../shared/types'
const props = defineProps<{
  open: boolean
  resume: boolean
  boot?: Bootstrap
  preview?: SetupPreview
  job?: SetupJob
  working: boolean
  connected: boolean
  openAction: (action: LocalActionId) => Promise<boolean>
  prepare: (request: SetupRequest) => Promise<boolean>
  start: () => Promise<boolean>
}>()
const emit = defineEmits<{
  close: []
  backups: []
  report: []
  manual: [id: string]
  check: [id: string]
  scan: []
}>()
const step = ref(0)
const draft = reactive<Preferences>({ ...defaultPreferences })
const selected = ref<FixId[]>([])
const timezone = reactive({ system: true, terminal: true })
const steps = ['网络模式', 'Claude 服务', '隐私偏好', '修改范围', '确认并执行']
const fieldError = ref('')
const running = computed(() => props.job?.status === 'running')
const followupReport = computed(
  () => props.job && setupFollowupReport(props.job, props.boot?.reports ?? []),
)
const completed = computed(
  () =>
    props.job?.nodes.filter((node) => ['succeeded', 'skipped'].includes(node.status)).length ?? 0,
)
const failedCount = computed(
  () => props.job?.nodes.filter((node) => node.enabled && node.status === 'skipped').length ?? 0,
)
const changedFiles = computed(
  () =>
    new Set(props.preview?.nodes.flatMap((node) => node.files.map((file) => file.path)) ?? []).size,
)
const activeNode = computed(() =>
  props.job?.nodes.find((node) => ['running', 'retrying'].includes(node.status)),
)
const eligible = (id: FixId) =>
  /-proxy$/.test(id)
    ? draft.routeMode === 'tun'
    : /-endpoint$/.test(id)
      ? draft.usageMode === 'official'
      : true
function useArticlePreset() {
  Object.assign(draft, {
    timezoneMode: 'article',
    expectedTimezone: 'Asia/Taipei',
    routeMode: 'tun',
    privacy: 'minimal',
  })
  selected.value = [...new Set([...selected.value, ...fixIds.filter((id) => /-proxy$/.test(id))])]
}
const differences = computed(() => articleModeDifferences(draft))
const routeNames = { system: '系统 / HTTP 代理', tun: 'TUN 全流量接管', custom: '自定义路由' }

watch(
  () => props.open,
  (open) => {
    if (!open) return
    step.value = props.resume && props.job ? 5 : 0
    Object.assign(draft, props.boot?.preferences ?? defaultPreferences)
    // Restoring an API endpoint is always an explicit opt-in in the scope step.
    selected.value = fixIds.filter((id) => eligible(id) && !/-endpoint$/.test(id))
    timezone.system = true
    timezone.terminal = true
    fieldError.value = ''
  },
)
watch(
  () => [draft.routeMode, draft.usageMode],
  () => {
    selected.value = selected.value.filter(eligible)
  },
)
function toggle(id: FixId) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((value) => value !== id)
    : [...selected.value, id]
}
async function next() {
  fieldError.value = ''
  if (step.value === 0 && draft.timezoneMode === 'manual') {
    if (!draft.expectedTimezone.trim()) {
      fieldError.value = '手动模式需要选择一个目标时区'
      return
    }
    try {
      new Intl.DateTimeFormat('en', { timeZone: draft.expectedTimezone })
    } catch {
      fieldError.value = '请输入有效的 IANA 时区，例如 Asia/Taipei'
      return
    }
  }
  if (step.value === 0 && draft.routeMode === 'tun')
    selected.value = [...new Set([...selected.value, ...fixIds.filter((id) => /-proxy$/.test(id))])]
  if (step.value === 3) {
    if (
      await props.prepare({
        preferences: { ...draft },
        fixIds: [...selected.value],
        timezone: { ...timezone },
      })
    )
      step.value = 4
  } else step.value++
}
async function execute() {
  if (await props.start()) step.value = 5
}
const title = computed(() =>
  step.value === 5
    ? running.value
      ? '正在完成配置'
      : failedCount.value || props.job?.status === 'interrupted'
        ? '配置流程已结束'
        : '自动配置完成'
    : '一键配置完成',
)
</script>

<template>
  <GuardDialog
    :open="props.open"
    :scroll-key="step"
    :title="title"
    :description="
      step === 5
        ? '按节点顺序执行；失败重试 3 次后跳过，继续下一项。'
        : '逐项选择适合你的设置，确认后写入本机配置。'
    "
    wide
    :locked="props.working"
    @close="emit('close')"
  >
    <template v-if="step < 5">
      <p v-if="step === 4 && differences.length" class="wizard-hint">
        本次与原文方案有
        {{ differences.length }} 项偏好差异；复检按你的选择判断，文献页保留原文对照。
      </p>
      <ol class="wizard-steps" aria-label="配置步骤">
        <li
          v-for="(label, index) in steps"
          :key="label"
          :class="{ active: step === index, done: step > index }"
          :aria-current="step === index ? 'step' : undefined"
        >
          <span
            ><Check v-if="step > index" :size="13" /><template v-else>{{
              index + 1
            }}</template></span
          >{{ label }}
        </li>
      </ol>
      <div v-if="step === 0" class="wizard-section">
        <div class="wizard-section-heading">
          <Network :size="24" />
          <div>
            <h3>网络接入方式</h3>
            <p>选择当前已经启用的方式，工具会据此决定保留或移除代理字段。</p>
          </div>
        </div>
        <div class="article-preset">
          <span>原文方案：台北 · TUN · 关闭非必要流量</span
          ><button class="text-link" @click="useArticlePreset">按原文填入</button>
        </div>
        <label
          v-for="option in [
            {
              value: 'system',
              title: '系统 / HTTP 代理',
              description: '保留 shell、npm 和 Git 中已有的代理配置。',
            },
            {
              value: 'tun',
              title: 'TUN 全流量接管',
              description: '将移除重复的持久代理字段，请先在代理软件中启用 TUN。',
            },
            {
              value: 'custom',
              title: '自定义路由',
              description: '保留现有代理，检查其他本机配置。',
            },
          ]"
          :key="option.value"
          class="radio-card"
          :class="{ selected: draft.routeMode === option.value }"
          ><input
            v-model="draft.routeMode"
            type="radio"
            name="setup-route"
            :value="option.value"
          /><span
            ><strong>{{ option.title }}</strong
            ><small>{{ option.description }}</small></span
          ></label
        >
        <TimezonePreferences v-model="draft" prefix="setup" configure />
        <BrowserLanguagePreferences v-model="draft" prefix="setup" />
        <div class="wizard-fields">
          <label
            >期望出口地区<select v-model="draft.expectedCountry">
              <option value="">不指定</option>
              <option
                v-for="country in ['US', 'TW', 'SG', 'JP', 'GB', 'DE', 'CA', 'AU', 'CN', 'HK']"
                :key="country"
                :value="country"
              >
                {{ country }}
              </option>
            </select></label
          >
        </div>
        <p class="wizard-hint">出口地区用于检测对照；网络接入需提前在代理软件中启用。</p>
      </div>
      <div v-else-if="step === 1" class="wizard-section">
        <div class="wizard-section-heading">
          <ShieldCheck :size="24" />
          <div>
            <h3>你使用哪种 Claude 服务？</h3>
            <p>已有 API 地址默认保留，恢复官方地址需要在修改范围中主动勾选。</p>
          </div>
        </div>
        <label
          v-for="option in usageModeOptions"
          :key="option.value"
          class="radio-card"
          :class="{ selected: draft.usageMode === option.value }"
          ><input
            v-model="draft.usageMode"
            type="radio"
            name="setup-usage"
            :value="option.value"
          /><span
            ><strong>{{ option.title }}</strong
            ><small>{{ option.description }}</small></span
          ></label
        >
      </div>
      <div v-else-if="step === 2" class="wizard-section">
        <div class="wizard-section-heading">
          <LockKeyhole :size="24" />
          <div>
            <h3>选择 Claude Code 隐私设置</h3>
            <p>配置会写入 ~/.claude/settings.json，并保留其他设置。</p>
          </div>
        </div>
        <label class="radio-card" :class="{ selected: draft.privacy === 'balanced' }"
          ><input v-model="draft.privacy" type="radio" name="setup-privacy" value="balanced" /><span
            ><strong>关闭使用指标与错误报告</strong
            ><small>设置 DISABLE_TELEMETRY 与 DISABLE_ERROR_REPORTING。</small></span
          ></label
        >
        <label class="radio-card" :class="{ selected: draft.privacy === 'minimal' }"
          ><input v-model="draft.privacy" type="radio" name="setup-privacy" value="minimal" /><span
            ><strong>关闭全部非必要流量</strong
            ><small>另外设置 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC。</small></span
          ></label
        >
        <div class="wizard-note">
          <TriangleAlert :size="18" />
          <p>{{ privacyCompatibilityNote }} 已有的隐私设置会保留。</p>
        </div>
      </div>
      <div v-else-if="step === 3" class="wizard-section">
        <div class="wizard-section-heading">
          <FolderCog :size="24" />
          <div>
            <h3>确认本次修改范围</h3>
            <p>每个选择对应一个独立执行节点，可以在这里取消。</p>
          </div>
        </div>
        <label class="setup-scope-item">
          <input v-model="timezone.system" type="checkbox" />
          <span
            ><strong>设置系统时区</strong><small>按所选目标配置；可能需要管理员授权</small></span
          >
        </label>
        <label class="setup-scope-item">
          <input v-model="timezone.terminal" type="checkbox" />
          <span
            ><strong>配置终端与 Claude Code TZ</strong
            ><small>保存启动配置；已有终端和 Claude Code 会话需重开</small></span
          >
        </label>
        <label
          v-for="id in fixIds"
          :key="id"
          class="setup-scope-item"
          :class="{ disabled: !eligible(id) }"
          ><input
            type="checkbox"
            :checked="selected.includes(id)"
            :disabled="!eligible(id)"
            @change="toggle(id)"
          /><span
            ><strong>{{ fixLabels[id] }}</strong
            ><small>{{
              !eligible(id)
                ? /-proxy$/.test(id)
                  ? '当前网络模式保留此配置'
                  : '当前 Claude 服务方式保留此配置'
                : /-endpoint$/.test(id)
                  ? '主动勾选后才移除已有 API 地址；密钥保留'
                  : id === 'claude-privacy'
                    ? '写入本次选择的隐私设置'
                    : id === 'npm-tls'
                      ? '将 npm 的 strict-ssl=false / 0 恢复为 true'
                      : '仅移除代理字段，保留其他配置'
            }}</small></span
          ></label
        >
        <p class="wizard-hint">
          系统代理、TUN 和 DNS 的实际设置会在复检报告中提示，工具不会代替网络软件启用连接。
        </p>
      </div>
      <div v-else-if="step === 4 && props.preview" class="wizard-section">
        <div class="setup-summary">
          <div>
            <strong>{{ changedFiles }}</strong
            ><span>个文件将修改</span>
          </div>
          <div>
            <strong>{{
              selected.length + Number(timezone.system) + Number(timezone.terminal)
            }}</strong
            ><span>个配置节点已选</span>
          </div>
          <div><strong>3</strong><span>次失败重试上限</span></div>
        </div>
        <p v-if="props.preview.timezoneTarget" class="wizard-hint">
          目标时区：<strong>{{ props.preview.timezoneTarget }}</strong>
        </p>
        <div class="setup-preferences">
          <span>{{ routeNames[draft.routeMode] }}</span
          ><span>{{ usageModeLabel(draft.usageMode) }}</span
          ><span>{{
            draft.privacy === 'minimal' ? '关闭全部非必要流量' : '关闭指标与错误报告'
          }}</span>
        </div>
        <ol class="setup-preview-list">
          <li
            v-for="node in props.preview.nodes"
            :key="node.id"
            :class="{ omitted: !node.enabled }"
          >
            <div class="setup-preview-title">
              <GitBranch :size="15" /><strong>{{ node.title }}</strong
              ><span>{{
                node.enabled
                  ? node.blocked
                    ? '需处理，将尝试执行'
                    : node.files.length
                      ? `${node.files.length} 个文件`
                      : node.id === 'system-timezone' || node.id === 'terminal-timezone'
                        ? '配置并复核'
                        : '检查 / 无需写入'
                  : '保留现有配置'
              }}</span>
            </div>
            <p v-if="node.note">{{ node.note }}</p>
            <div v-for="file in node.files" :key="file.path" class="setup-file">
              <code>{{ file.path }}</code>
              <div v-for="change in file.changes" :key="change.key" class="setup-field-change">
                <code>{{ change.key }}</code
                ><span>{{ change.before }}</span
                ><ArrowRight :size="13" /><span>{{ change.after }}</span>
              </div>
            </div>
          </li>
        </ol>
        <ul class="setup-notes">
          <li v-for="note in props.preview.notes" :key="note">{{ note }}</li>
        </ul>
      </div>
      <p v-if="fieldError" class="wizard-field-error" role="alert">{{ fieldError }}</p>
    </template>
    <template v-else-if="props.job">
      <div
        class="flow-summary"
        :class="{ partial: failedCount || props.job.status === 'interrupted' }"
      >
        <LoaderCircle v-if="running" class="spin" :size="24" /><TriangleAlert
          v-else-if="failedCount || props.job.status === 'interrupted'"
          :size="24"
        /><CheckCheck v-else :size="24" />
        <div>
          <strong>{{
            running
              ? activeNode?.title || '正在准备下一项'
              : props.job.status === 'interrupted'
                ? '流程中断，请重新预览'
                : failedCount
                  ? `${failedCount} 个节点未成功并已跳过`
                  : '所选配置已处理完成'
          }}</strong>
          <p>
            {{
              running
                ? '关闭弹窗后仍会继续执行，可随时回来查看。'
                : props.job.error ||
                  '复检结果会保留仍需关注的环境问题。重新打开终端以加载更新的环境变量。'
            }}
          </p>
        </div>
        <span>{{ completed }} / {{ props.job.nodes.length }}</span>
      </div>
      <div
        class="flow-progress"
        role="progressbar"
        :aria-valuenow="completed"
        :aria-valuemax="props.job.nodes.length"
        aria-valuemin="0"
        aria-label="配置流程进度"
      >
        <span :style="{ width: `${(completed / props.job.nodes.length) * 100}%` }" />
      </div>
      <details class="setup-execution-details" :open="running">
        <summary>自动配置执行记录 · {{ completed }} / {{ props.job.nodes.length }}</summary>
        <ol class="setup-flow" aria-label="配置执行流程">
          <li v-for="(node, index) in props.job.nodes" :key="node.id" :class="node.status">
            <div class="flow-marker">
              <LoaderCircle v-if="node.status === 'running'" class="spin" :size="17" /><RefreshCw
                v-else-if="node.status === 'retrying'"
                class="spin"
                :size="17"
              /><CircleCheck v-else-if="node.status === 'succeeded'" :size="18" /><SkipForward
                v-else-if="node.status === 'skipped'"
                :size="17"
              /><CircleDashed v-else :size="18" />
            </div>
            <div class="flow-node">
              <div class="flow-node-heading">
                <span class="flow-number">{{ String(index + 1).padStart(2, '0') }}</span>
                <h3>{{ node.title }}</h3>
                <span class="flow-state">{{ setupNodeLabels[node.status] }}</span>
              </div>
              <p>{{ node.message }}</p>
              <div class="flow-meta">
                <span v-if="node.attempts"
                  >尝试 {{ node.attempts }} / 4 · 重试 {{ node.retries }} / 3</span
                ><span v-else>{{ node.enabled ? '按顺序执行' : '未选择此项' }}</span
                ><button
                  v-if="node.backupId"
                  class="text-link"
                  :disabled="running"
                  @click="emit('backups')"
                >
                  查看原始备份
                </button>
              </div>
              <details
                v-if="node.history.some((entry) => entry.result === 'failed')"
                class="flow-log"
              >
                <summary>查看每次尝试</summary>
                <ul>
                  <li v-for="entry in node.history" :key="entry.attempt">
                    <span
                      >第 {{ entry.attempt }} 次 ·
                      {{ entry.result === 'failed' ? '失败' : '成功' }}</span
                    >
                    <p>{{ entry.message }}</p>
                  </li>
                </ul>
              </details>
            </div>
          </li>
        </ol>
      </details>
      <SetupFollowupList
        v-if="!running"
        :job="props.job"
        :report="followupReport"
        :reviews="props.boot?.manualReviews ?? []"
        :platform="props.boot?.machine.platform ?? ''"
        :busy="props.working || !props.connected"
        :open-action="props.openAction"
        @manual="emit('manual', $event)"
        @check="emit('check', $event)"
        @scan="emit('scan')"
      />
      <p class="wizard-hint">
        未选择的节点直接保留原配置；执行失败的节点重试 3 次后跳过。处理顺序由上到下。
      </p>
    </template>
    <template #footer>
      <template v-if="step < 5"
        ><button
          class="button secondary"
          :disabled="props.working"
          @click="step ? step-- : emit('close')"
        >
          <ArrowLeft v-if="step" :size="15" />{{ step ? '上一步' : '取消' }}</button
        ><span class="wizard-footer-label">{{ step + 1 }} / 5</span
        ><button
          class="button primary"
          :disabled="props.working || !props.connected"
          @click="step === 4 ? execute() : next()"
        >
          <LoaderCircle v-if="props.working" class="spin" :size="16" /><Play
            v-else-if="step === 4"
            :size="15"
          /><ArrowRight v-else :size="16" />{{
            props.working
              ? '正在准备'
              : step === 3
                ? '预览本机修改'
                : step === 4
                  ? '备份并开始配置'
                  : '下一步'
          }}
        </button></template
      >
      <template v-else
        ><button class="button secondary" @click="emit('close')">
          {{ running ? '收起，继续执行' : '关闭' }}</button
        ><button
          v-if="!running && props.job?.reportId"
          class="button primary"
          @click="emit('report')"
        >
          <ShieldCheck :size="16" />查看复检报告
        </button></template
      >
    </template>
  </GuardDialog>
</template>
