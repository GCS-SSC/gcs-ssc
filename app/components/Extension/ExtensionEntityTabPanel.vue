<script setup lang="ts">
import { computed } from 'vue'
import type { ExtensionEntityTabItem } from '~~/shared/types/schemas/extensions'
import { getGcsExtensionComponent } from '#gcs-extensions/registry'
import { appRouteLocations } from '~/utils/route-locations'

const { item, recordId } = defineProps<{
  item?: ExtensionEntityTabItem
  recordId?: string
}>()

const localePath = useLocalePath()
const extensionComponent = computed(() => {
  const name = recordId ? item?.detailComponentName : item?.componentName
  return name ? getGcsExtensionComponent(name) : null
})
const navigation = computed(() => {
  if (item?.context.target !== 'agreement' || !item.detailComponentName || !item.context.agreementId) return undefined
  const agreementId = item.context.agreementId
  return {
    collectionHref: localePath(appRouteLocations.agreementDetail(agreementId, { section: item.value })),
    recordHref: (id: string) => localePath(appRouteLocations.agreementExtensionRecordDetail(
      agreementId, item.extensionKey, item.tabId, id
    ))
  }
})
</script>

<template>
  <component
    :is="extensionComponent"
    v-if="extensionComponent && item"
    :class="recordId ? 'flex min-h-0 w-full flex-1 flex-col' : 'block w-full'"
    :extension-key="item.extensionKey"
    :target="item.context.target"
    :context="item.context"
    :agency-id="item.context.target === 'proponent' ? undefined : item.context.agencyId"
    :agencies="item.context.target === 'proponent' ? item.context.agencies : undefined"
    :stream-id="item.context.streamId"
    :agreement-id="item.context.agreementId"
    :applicant-recipient-id="item.context.applicantRecipientId"
    :claim-id="item.context.claimId"
    :monitor-id="item.context.monitorId"
    :payment-id="item.context.paymentId"
    :owner-type="item.context.ownerType"
    :owner-id="item.context.ownerId"
    :scope="item.context.target === 'proponent' ? undefined : item.context.scope"
    :rbac="item.rbac"
    :config="item.config"
    :record-id="recordId"
    :navigation="navigation"
    :can-update="item.permissions?.canUpdate ?? false"
    :can-delete="item.permissions?.canDelete ?? false"
    :can-work="item.permissions?.canWork ?? false"
    :agreement-context="item.agreementContext" />
</template>
