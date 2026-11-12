<script setup lang="ts">
import type { GcsExtensionJsonConfig, GcsExtensionSlot, GcsExtensionSlotContext } from '~~/shared/utils/extensions'
import type { ExtensionRuntimeResponse } from '~~/shared/types/schemas/extensions'
import { getGcsExtensionComponent } from '#gcs-extensions/registry'
import { useResourceRequest } from '~/composables/useResourceRequest'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

const {
  slotName,
  subject,
  streamId,
  agencyId,
  permissionAction = 'read',
  context = {}
} = defineProps<{
  slotName: GcsExtensionSlot
  subject?: 'agency' | 'transfer_payment' | 'agreement' | 'applicant_recipient'
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

const paymentId = computed(() => context && 'paymentId' in context && typeof context.paymentId === 'string'
  ? context.paymentId
  : undefined)

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

const { user, permissionRevision } = useAuth()

const runtimeQuery = computed(() => ({
  slot: slotName,
  ...(subject ? { subject } : {}),
  ...(streamId ? { streamId } : {}),
  ...(agencyId ? { agencyId } : {}),
  ...(applicantRecipientId.value ? { applicantRecipientId: applicantRecipientId.value } : {}),
  ...(agreementId.value ? { agreementId: agreementId.value } : {}),
  ...(paymentId.value ? { paymentId: paymentId.value } : {}),
  permissionAction
}))
const { data, status, error, refresh } = useResourceRequest<ExtensionRuntimeResponse>({
  identity: () => JSON.stringify([runtimeQuery.value, user.value?.id, permissionRevision.value]),
  refreshData: 'clear',
  failureData: 'clear',
  /**
   * Loads contributions for the current authorized slot subject.
   * @param signal - Cancellation owned by the current request.
   * @returns Current slot discovery evidence.
   */
  load: async signal => {
    const requestUrl = getClientRequestUrl('/api/extensions/runtime')
    for (const [key, value] of Object.entries(runtimeQuery.value)) {
      requestUrl.searchParams.set(key, value)
    }
    const response = await fetch(requestUrl, { signal })
    if (!response.ok) await throwFetchResponseError(response)
    return response.json()
  }
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
  <slot v-if="slotName === 'payment.evidence' && status === 'pending'" name="loading" />
  <slot v-else-if="slotName === 'payment.evidence' && error" name="error" :retry="refresh" />
  <div v-else-if="items.length > 0" class="space-y-4">
    <component
      :is="resolveComponent(item.componentName)"
      v-for="item in items"
      :key="`${item.extensionKey}:${item.componentName}`"
      :extension-key="item.extensionKey"
      :config="item.config as GcsExtensionJsonConfig"
      :context="item.agencies ? { ...context, agencies: item.agencies } : context" />
  </div>
</template>
