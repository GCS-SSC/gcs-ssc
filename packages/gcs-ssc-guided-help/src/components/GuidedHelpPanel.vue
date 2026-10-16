<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import type { GuideDocument } from '../contracts'
import { createGuideRuntime } from '../runtime'
import type { GuideLocale, GuideTargetValue } from '../runtime'

const props = defineProps<{ document: GuideDocument; locale: GuideLocale; currentView: string; initialStepId?: string; initialPath?: string[]; readTargetValue?: (target: string) => GuideTargetValue; notice?: string }>()
const emit = defineEmits<{ select: [stepId: string, path: string[]]; exit: [] }>()
const runtime = shallowRef<ReturnType<typeof createGuideRuntime> | null>(null)
const start = () => {
  runtime.value?.destroy()
  runtime.value = createGuideRuntime({ ...props, onSelect: (id, path) => emit('select', id, path), onExit: () => emit('exit') })
}
onMounted(start)
watch(() => props.document, start)
watch(() => [props.currentView, props.locale, props.notice] as const, () => runtime.value?.updateContext({ currentView: props.currentView, locale: props.locale, notice: props.notice }))
onBeforeUnmount(() => runtime.value?.destroy())
</script>

<template>
  <!-- Driver owns the anchored, accessible popover; no persistent panel. -->
  <span hidden />
</template>
