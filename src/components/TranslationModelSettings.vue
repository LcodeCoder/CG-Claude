<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Check, Eye, EyeOff, FlaskConical, LoaderCircle, Save } from '@lucide/vue'
import { translationRequestSchema, translationEndpoint } from '../../shared/translation'
import type {
  TranslationConfiguration,
  TranslationRequest,
  TranslationSettings,
  TranslationTestResult,
} from '../../shared/translation'
const props = defineProps<{
  configuration?: TranslationConfiguration
  busy: boolean
  connected: boolean
  save: (request: TranslationRequest) => Promise<boolean>
  test: (request: TranslationRequest) => Promise<TranslationTestResult | undefined>
}>()
const initial: TranslationSettings = {
  protocol: 'openai-compatible',
  baseUrl: '',
  model: '',
  auth: 'api-key',
  tokenLimitParameter: 'max_tokens',
  timeoutSeconds: 20,
}
const draft = reactive<TranslationSettings>({ ...initial })
const apiKey = ref('')
const showKey = ref(false)
const form = ref<HTMLFormElement>()
const formError = ref('')
const action = ref<'saving' | 'testing'>()
const result = ref<TranslationTestResult>()
watch(
  () => props.configuration?.savedAt,
  () => {
    Object.assign(draft, props.configuration?.settings ?? initial)
    apiKey.value = ''
    showKey.value = false
  },
  { immediate: true },
)
watch(
  () => JSON.stringify([draft, apiKey.value]),
  () => {
    result.value = undefined
    formError.value = ''
  },
)
watch(
  () => draft.auth,
  (value) => {
    if (value === 'none') apiKey.value = ''
  },
)
const endpoint = computed(() => {
  try {
    return translationEndpoint(draft.baseUrl, draft.protocol)
  } catch {
    return ''
  }
})
const savedKeyUsable = computed(() => {
  const saved = props.configuration?.settings
  return Boolean(
    props.configuration?.hasApiKey &&
    saved &&
    draft.protocol === saved.protocol &&
    endpoint.value === translationEndpoint(saved.baseUrl, saved.protocol),
  )
})
const changed = computed(() =>
  Boolean(
    apiKey.value ||
    !props.configuration?.settings ||
    JSON.stringify(draft) !== JSON.stringify(props.configuration.settings),
  ),
)
const disabled = computed(() => props.busy || !props.connected || Boolean(action.value))
function request() {
  if (!form.value?.reportValidity()) return
  const parsed = translationRequestSchema.safeParse({
    ...draft,
    ...(apiKey.value.trim() ? { apiKey: apiKey.value.trim() } : {}),
  })
  if (!parsed.success) {
    formError.value = parsed.error.issues[0]?.message ?? '请检查模型设置'
    return
  }
  if (draft.auth === 'api-key' && !apiKey.value.trim() && !savedKeyUsable.value) {
    formError.value = '请填写 API 密钥；更换地址或协议后需要重新填写。'
    return
  }
  return parsed.data
}
async function save() {
  if (disabled.value) return
  const value = request()
  if (!value) return
  action.value = 'saving'
  try {
    if (await props.save(value)) {
      apiKey.value = ''
      showKey.value = false
    }
  } finally {
    action.value = undefined
  }
}
async function test() {
  if (disabled.value) return
  const value = request()
  if (!value) return
  action.value = 'testing'
  result.value = undefined
  try {
    result.value = await props.test(value)
  } finally {
    action.value = undefined
  }
}
</script>

<template>
  <section class="translation-panel" aria-labelledby="translation-model-title">
    <div class="translation-section-heading">
      <div>
        <h2 id="translation-model-title">翻译模型</h2>
        <p class="translation-subtitle">中译英和英译中使用同一个模型。</p>
      </div>
      <span class="translation-save-status">{{
        configuration?.savedAt ? (changed ? '有未保存的修改' : '已保存到本机') : '尚未配置'
      }}</span>
    </div>
    <form ref="form" class="translation-settings-form" @submit.prevent="save">
      <fieldset :disabled="disabled">
        <legend class="sr-only">翻译服务配置</legend>
        <div class="translation-settings-grid">
          <label for="translation-protocol"
            >接口协议
            <select id="translation-protocol" v-model="draft.protocol">
              <option value="openai-compatible">OpenAI 兼容 / Chat Completions</option>
              <option value="anthropic">Anthropic / Messages</option>
            </select>
          </label>
          <label for="translation-model"
            >模型名称
            <input
              id="translation-model"
              v-model.trim="draft.model"
              required
              maxlength="200"
              placeholder="填写服务提供的模型 ID"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <label for="translation-url" class="translation-field-wide"
            >API 地址
            <input
              id="translation-url"
              v-model.trim="draft.baseUrl"
              type="url"
              required
              maxlength="2048"
              placeholder="https://api.example.com/v1"
              autocomplete="off"
              spellcheck="false"
              aria-describedby="translation-url-hint"
            />
            <small id="translation-url-hint"
              >可填 /v1 基础地址或完整接口地址；本机服务支持 HTTP。</small
            >
          </label>
          <label for="translation-auth"
            >身份验证
            <select id="translation-auth" v-model="draft.auth">
              <option value="api-key">API 密钥</option>
              <option value="none">无需密钥（本机或自托管服务）</option>
            </select>
          </label>
          <label for="translation-timeout"
            >测试超时
            <select id="translation-timeout" v-model.number="draft.timeoutSeconds">
              <option :value="10">10 秒</option>
              <option :value="20">20 秒</option>
              <option :value="30">30 秒</option>
              <option :value="60">60 秒</option>
            </select>
          </label>
          <div v-if="draft.auth === 'api-key'" class="translation-field-wide translation-key-field">
            <label for="translation-key">API 密钥</label>
            <div class="translation-key-input">
              <input
                id="translation-key"
                v-model="apiKey"
                :type="showKey ? 'text' : 'password'"
                maxlength="4096"
                :placeholder="savedKeyUsable ? '已保存；留空保留原密钥' : '填写翻译服务的 API 密钥'"
                autocomplete="new-password"
                spellcheck="false"
                autocapitalize="off"
                aria-describedby="translation-key-hint"
              />
              <button
                type="button"
                :aria-label="showKey ? '隐藏密钥' : '显示密钥'"
                :aria-pressed="showKey"
                @click="showKey = !showKey"
              >
                <EyeOff v-if="showKey" :size="18" /><Eye v-else :size="18" />
              </button>
            </div>
            <small id="translation-key-hint"
              >密钥在本机加密保存，界面不读取已存密钥。无需密钥时会清除原密钥。</small
            >
          </div>
        </div>
        <details v-if="draft.protocol === 'openai-compatible'" class="translation-advanced">
          <summary>兼容性设置</summary>
          <label for="translation-token-limit"
            >输出上限参数<select id="translation-token-limit" v-model="draft.tokenLimitParameter">
              <option value="max_tokens">max_tokens（常见兼容服务）</option>
              <option value="max_completion_tokens">
                max_completion_tokens（当前 OpenAI 接口）
              </option>
            </select></label
          >
          <p>测试上限为 512 tokens；如服务不支持所选参数，可切换后重试。</p>
        </details>
      </fieldset>
      <p v-if="formError" class="translation-form-error" role="alert">{{ formError }}</p>
      <div class="translation-settings-footer">
        <p>测试会发送两段示例文本，可能消耗 API 额度。</p>
        <div class="translation-settings-actions">
          <button class="button secondary" type="button" :disabled="disabled" @click="test">
            <LoaderCircle v-if="action === 'testing'" class="spin" :size="16" /><FlaskConical
              v-else
              :size="16"
            />{{ action === 'testing' ? '正在测试' : '测试双向翻译' }}
          </button>
          <button class="button primary" :disabled="disabled || !changed">
            <LoaderCircle v-if="action === 'saving'" class="spin" :size="16" /><Save
              v-else
              :size="16"
            />保存设置
          </button>
        </div>
      </div>
    </form>
    <div v-if="result" class="translation-test-result" role="status" aria-live="polite">
      <div class="translation-test-heading">
        <Check :size="18" /><strong>双向测试通过</strong
        ><span>{{ (result.durationMs / 1000).toFixed(1) }} 秒</span>
      </div>
      <dl>
        <div v-for="sample in result.samples" :key="sample.direction">
          <dt>{{ sample.direction === 'zh-en' ? '中译英' : '英译中' }}</dt>
          <dd :lang="sample.direction === 'zh-en' ? 'en' : 'zh-CN'">{{ sample.translated }}</dd>
        </div>
      </dl>
      <p>
        结果来自当前模型；{{
          changed ? '当前设置还未保存。' : '模型连接可用，Claude Code 尚未接入。'
        }}
      </p>
    </div>
  </section>
</template>
