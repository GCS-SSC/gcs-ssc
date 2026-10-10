<script setup lang="ts">
const { title, description, showHeader = true, showDescription = true } = defineProps<{
  title: string
  description: string
  showHeader?: boolean
  showDescription?: boolean
}>()
</script>

<template>
  <div class="min-w-0 space-y-6">
    <CommonDetailSectionHeader v-if="showHeader" :title="title" :description="showDescription ? description : undefined">
      <template v-if="$slots.action" #actions>
        <slot name="action" />
      </template>
    </CommonDetailSectionHeader>
    <p v-if="!showHeader && showDescription && description" class="text-sm text-muted">
      {{ description }}
    </p>
    <div v-if="!showHeader && $slots.action" class="flex justify-end">
      <slot name="action" />
    </div>

    <div v-if="$slots.notices" class="min-w-0 space-y-3">
      <slot name="notices" />
    </div>

    <div class="min-w-0 space-y-8">
      <slot />
    </div>
  </div>
</template>
