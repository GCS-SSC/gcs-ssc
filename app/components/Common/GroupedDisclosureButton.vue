<script setup lang="ts">
import { computed, useAttrs } from 'vue'

defineOptions({ inheritAttrs: false })

const {
  expanded,
  controls,
  label,
  labelEn,
  labelFr
} = defineProps<{
  expanded: boolean
  controls: string
  label?: string
  labelEn?: string
  labelFr?: string
}>()

const emit = defineEmits<{ toggle: [] }>()
const attrs = useAttrs()
const { locale, t } = useI18n()
const resolvedLabel = computed(() => {
  if (label) return label
  if (String(locale.value).startsWith('fr')) return labelFr || labelEn || ''
  return labelEn || labelFr || ''
})
</script>

<template>
  <button
    v-bind="attrs"
    type="button"
    :aria-label="t(expanded ? 'common.collapse_group' : 'common.expand_group', { name: resolvedLabel })"
    :aria-expanded="expanded"
    :aria-controls="controls"
    @click="emit('toggle')">
    <slot />
  </button>
  <span v-if="!expanded" :id="controls" hidden />
</template>
