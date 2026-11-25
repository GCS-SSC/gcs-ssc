<script setup lang="ts">
import { useId } from 'vue'
import CommonDetailSectionHeader from '~/components/Common/DetailSectionHeader.vue'

const { title, separated = false, emptyMessage } = defineProps<{
  title?: string
  separated?: boolean
  emptyMessage?: string
}>()
const headingId = useId()
</script>

<template>
  <CommonEmptyState v-if="emptyMessage" icon="i-lucide-clipboard-list" :description="emptyMessage" />
  <section
    v-else
    :aria-labelledby="title ? headingId : undefined"
    class="min-w-0 space-y-3 text-base [&_dt]:text-base [&_dt]:font-bold [&_dd]:text-base [&_label[data-slot=label]]:text-base [&_label[data-slot=label]]:font-bold [&_[data-information-field-label]]:text-base [&_[data-information-field-label]]:font-bold [&_input]:text-base [&_textarea]:text-base [&_[role=combobox]]:text-base"
    :class="{ 'border-t border-default pt-5': separated }">
    <slot name="before-heading" />
    <CommonDetailSectionHeader v-if="title" :title="title" :title-id="headingId" heading="h3" />
    <slot :heading-id="title ? headingId : undefined" />
  </section>
</template>
