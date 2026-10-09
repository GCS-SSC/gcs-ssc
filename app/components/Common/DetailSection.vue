<script setup lang="ts">
import { computed, provide } from 'vue'
import { DETAIL_SECTION_CONTEXT } from '~/utils/detail-sections'
import type { DetailSectionWidth } from '~/utils/detail-sections'

const { title, description, width = 'full' } = defineProps<{
  title: string
  description?: string
  width?: DetailSectionWidth
}>()

provide(DETAIL_SECTION_CONTEXT, { title: computed(() => title), description: computed(() => description) })
</script>

<template>
  <section class="min-w-0 space-y-8" :class="width === 'readable' ? 'mx-auto w-full max-w-4xl' : 'w-full'" :data-section-width="width" data-testid="detail-section">
    <CommonDetailSectionHeader :title="title" :description="description">
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
