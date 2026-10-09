<script setup lang="ts">
import { inject } from 'vue'
import { useDetailSectionOwnership } from '~/composables/useDetailSectionOwnership'
import { DETAIL_SECTION_CONTEXT } from '~/utils/detail-sections'

const { title, description } = defineProps<{
  title: string
  description: string
}>()
const ownsHeading = useDetailSectionOwnership(() => title)
const detailSection = inject(DETAIL_SECTION_CONTEXT, null)
</script>

<template>
  <div class="min-w-0 space-y-6">
    <CommonDetailSectionHeader v-if="!ownsHeading" :title="title" :description="description">
      <template v-if="$slots.action" #actions>
        <slot name="action" />
      </template>
    </CommonDetailSectionHeader>
    <p v-if="ownsHeading && description && description !== detailSection?.description.value" class="text-sm text-muted">
      {{ description }}
    </p>
    <div v-if="ownsHeading && $slots.action" class="flex justify-end">
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
