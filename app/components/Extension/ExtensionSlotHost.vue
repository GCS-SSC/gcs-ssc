<script setup lang="ts">
import type { GcsExtensionJsonConfig, GcsExtensionSlot, GcsExtensionSlotContext } from '~~/shared/utils/extensions'
import type { ExtensionRuntimeResponse } from '~~/shared/types/schemas/extensions'
import { getGcsExtensionComponent } from '#gcs-extensions/registry'

const {
  slotName,
  streamId,
  agencyId,
  permissionAction = 'read',
  context = {}
} = defineProps<{
  slotName: GcsExtensionSlot
  streamId?: string
  agencyId?: string
  permissionAction?: 'create' | 'read' | 'update'
  context?: GcsExtensionSlotContext
}>()

const applicantRecipientId = computed(() => {
  const value = context && 'applicantRecipientId' in context ? context.applicantRecipientId : undefined
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  return undefined
})

const agreementId = computed(() => {
  if (context && 'agreementId' in context) {
    const value = context.agreementId
    if (typeof value === 'string' || typeof value === 'number') return String(value)
  }
  const textareaContext = context && 'textarea' in context && typeof context.textarea === 'object'
    && context.textarea !== null
    ? context.textarea
    : undefined
  if (textareaContext && 'entityType' in textareaContext && textareaContext.entityType === 'fundingcaseagreement') {
    const value = 'entityId' in textareaContext ? textareaContext.entityId : undefined
    if (typeof value === 'string' || typeof value === 'number') return String(value)
  }
  return undefined
})

/**
 * Builds the empty runtime payload used before the slot fetch resolves.
 *
 * @returns Empty runtime slot response.
 */
const defaultResponse = (): ExtensionRuntimeResponse => ({
  slot: slotName,
  streamId,
  items: []
})

const runtimeQuery = computed(() => ({
  slot: slotName,
  ...(streamId ? { streamId } : {}),
  ...(agencyId ? { agencyId } : {}),
  ...(applicantRecipientId.value ? { applicantRecipientId: applicantRecipientId.value } : {}),
  ...(agreementId.value ? { agreementId: agreementId.value } : {}),
  permissionAction
}))
const { data } = useFetch<ExtensionRuntimeResponse, Error, '/api/extensions/runtime'>('/api/extensions/runtime', {
  query: runtimeQuery,
  default: defaultResponse,
  server: false,
  watch: [() => slotName, () => streamId, () => agencyId, () => permissionAction, applicantRecipientId, agreementId]
})

const items = computed(() => data.value?.items ?? [])

/**
 * Resolves the registered client component for a runtime extension slot item.
 *
 * @param componentName - Registered client component name.
 * @returns Vue component definition or undefined when not registered.
 */
const resolveComponent = (componentName: string) => getGcsExtensionComponent(componentName)
</script>

<template>
  <div v-if="items.length > 0" class="space-y-4">
    <component
      :is="resolveComponent(item.componentName)"
      v-for="item in items"
      :key="`${item.extensionKey}:${item.componentName}`"
      :extension-key="item.extensionKey"
      :config="item.config as GcsExtensionJsonConfig"
      :context="context" />
  </div>
</template>
