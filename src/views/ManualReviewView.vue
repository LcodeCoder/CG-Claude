<script setup lang="ts">
import { useUiText } from '../i18n'
import { computed, ref, nextTick } from 'vue'
import { ArrowUpRight, Check, Info, ListChecks, MessageSquareText } from '@lucide/vue'
import { manualItems } from '../../shared/types'
import type { ManualReview, ManualReviewRequest } from '../../shared/types'
import ManualActionGuide from '../components/ManualActionGuide.vue'
import { manualGuidance } from '../../shared/manual-guidance'
import type { LocalActionId } from '../../shared/local-actions'
import GuardDialog from '../components/GuardDialog.vue'
import { referencesForManualItem } from '../../shared/references'

const { t } = useUiText()

const emit = defineEmits<{ references: [id: string] }>()
const props = defineProps<{
  reviews: ManualReview[]
  platform: string
  timezone?: string
  openAction: (action: LocalActionId) => Promise<boolean>
  busy: boolean
  save: (request: ManualReviewRequest) => Promise<boolean>
  reset: () => Promise<boolean>
}>()
const confirmed = computed(() => props.reviews.filter((review) => review.checked).length)
const editingId = ref<(typeof manualItems)[number]['id']>()
const note = ref('')
const resetOpen = ref(false)
const currentItem = computed(() => manualItems.find((item) => item.id === editingId.value))
function reviewFor(id: string) {
  return props.reviews.find((review) => review.id === id)
}
function dateLabel(date: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}
async function toggle(id: (typeof manualItems)[number]['id']) {
  const review = reviewFor(id)
  await props.save({ id, checked: !review?.checked, note: review?.note ?? '' })
  await nextTick()
  // Saving temporarily disables the control; return the keyboard to the same item.
  document
    .getElementById('manual-item-' + id)
    ?.querySelector<HTMLInputElement>('input')
    ?.focus({ preventScroll: true })
}
function edit(id: (typeof manualItems)[number]['id']) {
  editingId.value = id
  note.value = reviewFor(id)?.note ?? ''
}
async function saveNote() {
  if (!editingId.value) return
  if (
    await props.save({
      id: editingId.value,
      checked: reviewFor(editingId.value)?.checked ?? false,
      note: note.value,
    })
  )
    editingId.value = undefined
}
async function resetReviews() {
  if (await props.reset()) resetOpen.value = false
}
</script>
<template>
  <div class="compact-summary">
    <span class="summary-icon amber"><ListChecks :size="23" /></span>
    <div>
      <strong>{{ t('已确认') }} {{ confirmed }} / {{ manualItems.length }} {{ t('项') }}</strong>
      <p>{{ t('记录保存在本机，重启后仍可查看。勾选代表你已人工复核。') }}</p>
    </div>
    <button class="text-link" :disabled="busy || !reviews.length" @click="resetOpen = true">
      {{ t('重置记录') }}
    </button>
  </div>
  <section class="data-panel checklist-panel" :aria-label="t('人工复核事项')">
    <article
      v-for="item in manualItems"
      :key="item.id"
      :id="'manual-item-' + item.id"
      tabindex="-1"
      class="manual-row"
      :class="{ done: reviewFor(item.id)?.checked }"
    >
      <label class="manual-checkbox">
        <input
          type="checkbox"
          :checked="reviewFor(item.id)?.checked ?? false"
          :disabled="busy"
          :aria-label="t('已确认：') + item.title"
          @change="toggle(item.id)"
        />
        <span><Check :size="14" /></span>
      </label>
      <div class="manual-content">
        <span class="manual-category">{{ t(item.category) }}</span>
        <h3>{{ t(item.title) }}</h3>
        <p>{{ item.description }}</p>
        <details class="manual-instructions">
          <summary>{{ t('配置方法与快捷入口') }}</summary>
          <ManualActionGuide
            :guidance="manualGuidance(item.id, platform, timezone)"
            :platform="platform"
            :busy="busy"
            :open-action="openAction"
          />
        </details>
        <p v-if="reviewFor(item.id)?.note" class="manual-note">
          <MessageSquareText :size="14" />{{ reviewFor(item.id)?.note }}
        </p>
        <span v-if="reviewFor(item.id)?.checked" class="manual-date">
          {{
            reviewFor(item.id)?.checkedAt
              ? t('复核于 ') + dateLabel(reviewFor(item.id)!.checkedAt!)
              : t('由旧版勾选导入，复核时间未知')
          }}
        </span>
      </div>
      <div class="manual-actions">
        <button
          v-if="referencesForManualItem(item.id).length"
          class="text-link"
          @click="emit('references', item.id)"
        >
          {{ t('依据与边界 ·') }} {{ referencesForManualItem(item.id).length }} {{ t('条') }}
        </button>
        <a :href="item.url" class="button subtle" target="_blank" rel="noopener noreferrer"
          >{{ t('打开检查') }}<ArrowUpRight :size="14"
        /></a>
        <button class="text-link" :disabled="busy" @click="edit(item.id)">
          {{ reviewFor(item.id)?.note ? t('编辑备注') : t('添加备注') }}
        </button>
      </div>
    </article>
  </section>
  <div class="footnote">
    <Info :size="14" />{{ t('外部测试网站会看到你访问它时的公网 IP；请按需打开。') }}
  </div>
  <GuardDialog
    :open="Boolean(editingId)"
    :title="t('复核备注')"
    :description="currentItem?.title"
    :locked="busy"
    @close="editingId = undefined"
  >
    <label class="review-note-field"
      >{{ t('记录你确认了什么')
      }}<textarea
        v-model="note"
        :disabled="busy"
        rows="4"
        maxlength="600"
        :placeholder="t('例如：已核对客户端登录方式，与预期一致。')"
      />
    </label>
    <p class="review-note-hint">
      {{ t('备注只保存在本机。请填写简短结论，避免记录密码、密钥或支付信息。') }}
    </p>
    <span class="review-note-count">{{ note.length }} / 600</span>
    <template #footer
      ><button class="button secondary" :disabled="busy" @click="editingId = undefined">
        {{ t('取消') }}</button
      ><button class="button primary" :disabled="busy" @click="saveNote">
        {{ t('保存备注') }}
      </button></template
    >
  </GuardDialog>
  <GuardDialog
    :open="resetOpen"
    :title="t('重置人工复核记录')"
    :description="t('清除这份清单的勾选、复核时间和备注，方便重新检查环境。')"
    :locked="busy"
    @close="resetOpen = false"
  >
    <p>{{ t('检测报告、备份和本机环境配置不受影响。') }}</p>
    <template #footer
      ><button class="button secondary" :disabled="busy" @click="resetOpen = false">
        {{ t('取消') }}</button
      ><button class="button primary" :disabled="busy" @click="resetReviews">
        {{ t('重置记录') }}
      </button></template
    >
  </GuardDialog>
</template>
