<script setup lang="ts">
import { computed } from 'vue'
import type { ExtensionPaymentAmountCalculatorItem } from '~~/shared/types/schemas/extensions'
import { getGcsExtensionComponent } from '#gcs-extensions/registry'

const { item, model } = defineProps<{
  item: ExtensionPaymentAmountCalculatorItem
  model: Record<string, unknown>
}>()

const emit = defineEmits<{
  result: [value: Record<string, unknown>]
  extensionPayload: [extensionKey: string, value: Record<string, unknown>]
}>()

const extensionComponent = computed(() => item?.componentName ? getGcsExtensionComponent(item.componentName) : null)
</script>

<template>
  <component
    :is="extensionComponent"
    v-if="extensionComponent"
    :extension-key="item.extensionKey"
    :calculator-id="item.calculatorId"
    :config="item.config"
    :context="item.context"
    :model="model"
    @result="(value: Record<string, unknown>) => emit('result', value)"
    @extension-payload="(value: Record<string, unknown>) => emit('extensionPayload', item.extensionKey, value)" />
</template>
