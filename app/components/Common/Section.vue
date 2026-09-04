<script setup lang="ts">
const { title, badge, icon, variant, gridCols } = defineProps<{
  title: string
  badge?: string | number
  icon?: string
  variant?: 'default' | 'ghost'
  gridCols?: number | string
}>()
</script>

<template>
  <section class="space-y-6">
    <CommonPageSectionHeader :title="title" :badge="badge" :icon="icon" :variant="variant || 'ghost'" />

    <div
      class="grid grid-cols-1 gap-6"
      :class="[
        gridCols === 2 ? 'md:grid-cols-2' : '',
        gridCols === 3 ? 'md:grid-cols-2 lg:grid-cols-3' : '',
        !gridCols ? 'md:grid-cols-2' : ''
      ]">
      <slot />
    </div>
  </section>
</template>
