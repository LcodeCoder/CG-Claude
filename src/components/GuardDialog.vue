<script setup lang="ts">
import { useUiText } from '../i18n'
import { ref, watch, onMounted, inject } from 'vue'
import { notificationKey } from '../lib/notifications'
import { X } from '@lucide/vue'

const { t } = useUiText()

const props = defineProps<{
  open: boolean
  title: string
  description?: string
  wide?: boolean
  locked?: boolean
  scrollKey?: string | number
}>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const notification = inject(notificationKey, undefined)
function sync() {
  if (!dialog.value) return
  if (props.open && !dialog.value.open) dialog.value.showModal()
  if (!props.open && dialog.value.open) dialog.value.close()
}
watch(() => props.open, sync, { flush: 'post' })
watch(
  () => props.scrollKey,
  () => {
    dialog.value?.scrollTo({ top: 0 })
  },
  { flush: 'post' },
)
onMounted(sync)
function cancel(event: Event) {
  event.preventDefault()
  if (!props.locked) emit('close')
}
</script>
<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="guard-dialog"
      :class="{ wide: props.wide }"
      :aria-label="props.title"
      @cancel="cancel"
    >
      <div class="dialog-heading">
        <div>
          <h2>{{ props.title }}</h2>
          <p v-if="props.description">{{ props.description }}</p>
        </div>
        <button
          class="icon-button"
          :aria-label="t('关闭对话框')"
          :disabled="props.locked"
          @click="emit('close')"
        >
          <X :size="19" />
        </button>
      </div>
      <div class="dialog-body"><slot /></div>
      <div class="dialog-footer">
        <p
          v-if="props.open && notification"
          class="dialog-feedback"
          :class="notification.kind"
          :role="notification.kind === 'error' ? 'alert' : 'status'"
        >
          {{ notification.message }}
        </p>
        <slot name="footer" />
      </div>
    </dialog>
  </Teleport>
</template>
