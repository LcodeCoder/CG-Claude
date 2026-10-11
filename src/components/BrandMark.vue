<script setup lang="ts">
import packageMetadata from '../../package.json'
const logoUrl = `/logo.svg?v=${packageMetadata.version}`
defineProps<{ large?: boolean }>()
</script>
<template>
  <span class="brand-mark" :class="{ large }" aria-hidden="true">
    <img :src="logoUrl" alt="" width="40" height="40" />
  </span>
</template>
