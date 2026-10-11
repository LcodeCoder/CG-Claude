<script setup lang="ts">
defineProps<{
  id: string
  checked: boolean
  disabled?: boolean
}>()
defineEmits<{ change: [event: Event] }>()
</script>

<template>
  <span class="setting-switch">
    <input
      :id="id"
      type="checkbox"
      role="switch"
      :checked="checked"
      :disabled="disabled"
      @change="$emit('change', $event)"
    />
    <span class="setting-switch-track" aria-hidden="true" />
  </span>
</template>

<style scoped>
.setting-switch {
  position: relative;
  display: inline-flex;
  width: 48px;
  height: 34px;
  flex: 0 0 48px;
  vertical-align: middle;
}
.setting-switch input {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.setting-switch-track {
  position: absolute;
  inset: 4px 2px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--switch-off);
  transition: background-color 160ms ease;
}
.setting-switch-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--switch-thumb);
  box-shadow: 0 1px 3px #0003;
  transition: transform 160ms ease;
}
input:checked + .setting-switch-track {
  background: var(--accent-mark);
}
input:checked + .setting-switch-track::after {
  transform: translateX(18px);
}
input:focus-visible + .setting-switch-track {
  outline: 3px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 3px;
}
input:enabled:hover + .setting-switch-track {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--muted) 10%, transparent);
}
input:disabled {
  cursor: not-allowed;
}
input:disabled + .setting-switch-track {
  opacity: 0.45;
}
</style>
