<script setup lang="ts">
const { wrap = true } = defineProps<{
  statusId?: string | null
  isCompleted?: boolean
  wrap?: boolean
}>()
</script>

<template>
  <div class="flex items-center gap-2" :class="wrap ? 'flex-wrap' : 'flex-nowrap'">
    <CommonStatusBadge v-if="statusId" :status-id="statusId" />
    <CommonStatusBadge v-if="isCompleted" variant="successful" :label="$t('common.complete')" />
  </div>
</template>
