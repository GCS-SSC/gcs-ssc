<script setup lang="ts">
import { computed, inject } from 'vue'
import { uiTargetRegistry } from '#ui-targets'
import { fieldTooltipKey } from '~/utils/field-tooltip-context'

defineOptions({ inheritAttrs: false })
const { targetKey } = defineProps<{ targetKey: string }>()
const { locale } = useI18n()
const tooltips = inject(fieldTooltipKey, undefined)
const language = computed(() => locale.value.startsWith('fr') ? 'fr' : 'en')
const text = computed(() => tooltips?.value.find(item => item.targetKey === targetKey)?.text[language.value]?.trim() ?? '')
const label = computed(() => uiTargetRegistry.targets.find(target => target.key === targetKey)?.label[language.value] ?? '')
</script>

<template>
  <slot />
  <FieldHelpTooltip v-if="text" :key="targetKey" :text="text" :label="label" />
</template>
