<script setup lang="ts">
defineProps<{ large?: boolean }>()
</script>
<template>
  <span class="brand-mark" :class="{ large }" aria-hidden="true">
    <img src="/logo.svg" alt="" width="40" height="40" />
  </span>
</template>
