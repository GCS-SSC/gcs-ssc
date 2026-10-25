<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const { text, label } = defineProps<{ text: string, label: string }>()
const { t } = useI18n()
const open = ref(false)
const trigger = ref<HTMLButtonElement | null>(null)
const portalTarget = computed(() => trigger.value?.closest<HTMLElement>('[role="dialog"]') ?? true)
watch(() => text, () => {
  open.value = false
})
</script>

<template>
  <UTooltip v-model:open="open" :portal="portalTarget" :content="{ collisionBoundary: portalTarget === true ? undefined : portalTarget }" :text="text" disable-closing-trigger :ui="{ content: 'max-w-sm whitespace-pre-wrap text-sm', text: 'whitespace-pre-wrap' }">
    <button
      ref="trigger"
      type="button"
      class="inline-flex size-6 shrink-0 items-center justify-center cursor-help rounded text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :aria-label="label ? t('field_tooltips.help_for_field', { field: label }) : t('field_tooltips.title')"
      @click.stop="open = !open">
      <UIcon name="i-lucide-circle-help" class="size-4" aria-hidden="true" />
    </button>
  </UTooltip>
</template>
