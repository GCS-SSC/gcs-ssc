<script setup lang="ts">
const { number, title } = defineProps<{
  number: string | number
  title: string
}>()
</script>

<template>
  <section class="space-y-3">
    <CommonPageSectionHeader
      :title="title"
      :badge="number"
      variant="ghost" />

    <slot />
  </section>
</template>
