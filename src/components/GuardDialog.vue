<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { X } from '@lucide/vue'
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
          aria-label="关闭对话框"
          :disabled="props.locked"
          @click="emit('close')"
        >
          <X :size="19" />
        </button>
      </div>
      <div class="dialog-body"><slot /></div>
      <div class="dialog-footer"><slot name="footer" /></div>
    </dialog>
  </Teleport>
</template>
