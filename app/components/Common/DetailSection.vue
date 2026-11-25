<script setup lang="ts">
const { title, description, heading } = defineProps<{
  title: string
  description?: string
  heading?: 'h2' | 'h3'
}>()
</script>

<template>
  <section class="w-full min-w-0 space-y-8" data-section-width="full" data-testid="detail-section">
    <CommonDetailSectionHeader :title="title" :description="description" :heading="heading">
      <template v-if="$slots.actions" #actions>
        <slot name="actions" />
      </template>
    </CommonDetailSectionHeader>
    <div v-if="$slots.notices" class="min-w-0 space-y-3">
      <slot name="notices" />
    </div>
    <div class="min-w-0 space-y-8">
      <slot />
    </div>
  </section>
</template>
