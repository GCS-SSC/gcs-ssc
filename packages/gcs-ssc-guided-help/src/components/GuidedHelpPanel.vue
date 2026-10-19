<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import type { GuideDocument, TargetLedger } from '../contracts'
import { createGuideRuntime } from '../runtime'
import type { GuideLocale, GuideTargetValue, GuideActionChannel, GuideActionSignal, GuideObservedContext, GuidePresentation } from '../runtime'

const props = defineProps<{ document: GuideDocument; locale: GuideLocale; currentView: string; initialStepId?: string; initialPath?: string[]; readTargetValue?: (target: string) => GuideTargetValue; notice?: string; finishLabel?: string; context?: string; statusMessage?: string; finishDisabled?: boolean; suspended?: boolean; ledger?: TargetLedger; actionChannel?: GuideActionChannel; observedContext?: GuideObservedContext; presentation?: GuidePresentation | null }>()
const emit = defineEmits<{ select: [stepId: string, path: string[]]; exit: []; finish: []; signal: [signal: GuideActionSignal] }>()
const runtime = shallowRef<ReturnType<typeof createGuideRuntime> | null>(null)
const start = () => {
  runtime.value?.destroy()
  runtime.value = createGuideRuntime({ ...props, onSelect: (id, path) => emit('select', id, path), onExit: () => emit('exit'), onSignal: signal => emit('signal', signal), ...(props.finishLabel ? { onFinish: () => emit('finish') } : {}) })
}
onMounted(start)
watch(() => props.document, (document, previous) => {
  if (JSON.stringify(document) !== JSON.stringify(previous)) start()
})
watch(() => [props.currentView, props.locale, props.notice, props.context, props.statusMessage, props.finishDisabled, props.finishLabel, props.suspended, props.observedContext, props.presentation] as const, () => runtime.value?.updateContext({ currentView: props.currentView, locale: props.locale, notice: props.notice, context: props.context, statusMessage: props.statusMessage, finishDisabled: props.finishDisabled, finishLabel: props.finishLabel, suspended: props.suspended, observedContext: props.observedContext, presentation: props.presentation }))
onBeforeUnmount(() => runtime.value?.destroy())
</script>

<template>
  <!-- Driver owns the anchored, accessible popover; no persistent panel. -->
  <span hidden />
</template>
