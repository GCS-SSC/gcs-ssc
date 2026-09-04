<script setup lang="ts">
import { computed, useAttrs, useSlots } from 'vue'
import type { GcsExtensionSlot, GcsExtensionSlotContext } from '~~/shared/utils/extensions'

defineOptions({
  inheritAttrs: false
})

const {
  modelValue,
  streamId,
  agencyId,
  extensionSlotName,
  extensionContext,
  extensionPermissionAction = 'read'
} = defineProps<{
  modelValue?: string | null
  streamId?: string
  agencyId?: string
  extensionSlotName?: GcsExtensionSlot
  extensionContext?: GcsExtensionSlotContext
  extensionPermissionAction?: 'create' | 'read' | 'update'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const attrs = useAttrs()
const slots = useSlots()

const hasExtensionHost = computed(() =>
  (Boolean(streamId) || Boolean(agencyId))
  && Boolean(extensionSlotName)
  && Boolean(extensionContext)
)

const hasAfterContent = computed(() =>
  hasExtensionHost.value
  || Boolean(slots.after)
)
</script>

<template>
  <template v-if="!hasAfterContent">
    <UTextarea
      :model-value="modelValue ?? ''"
      v-bind="attrs"
      @update:model-value="value => emit('update:modelValue', value)" />
  </template>

  <div v-else class="space-y-2">
    <UTextarea
      :model-value="modelValue ?? ''"
      v-bind="attrs"
      @update:model-value="value => emit('update:modelValue', value)" />

    <slot name="after" />

    <ExtensionSlotHost
      v-if="hasExtensionHost && extensionSlotName"
      :slot-name="extensionSlotName"
      :stream-id="streamId"
      :agency-id="agencyId"
      :permission-action="extensionPermissionAction"
      :context="extensionContext" />
  </div>
</template>
