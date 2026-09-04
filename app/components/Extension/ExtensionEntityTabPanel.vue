<script setup lang="ts">
import { computed } from 'vue'
import type { ExtensionEntityTabItem } from '~~/shared/types/schemas/extensions'
import { getGcsExtensionComponent } from '#gcs-extensions/registry'

const { item } = defineProps<{
  item?: ExtensionEntityTabItem
}>()

const extensionComponent = computed(() => item ? getGcsExtensionComponent(item.componentName) : null)
</script>

<template>
  <component
    :is="extensionComponent"
    v-if="extensionComponent && item"
    class="block w-full"
    :extension-key="item.extensionKey"
    :target="item.context.target"
    :context="item.context"
    :agency-id="item.context.agencyId"
    :stream-id="item.context.streamId"
    :agreement-id="item.context.agreementId"
    :applicant-recipient-id="item.context.applicantRecipientId"
    :claim-id="item.context.claimId"
    :monitor-id="item.context.monitorId"
    :owner-type="item.context.ownerType"
    :owner-id="item.context.ownerId"
    :scope="item.context.scope"
    :rbac="item.rbac"
    :config="item.config" />
</template>
