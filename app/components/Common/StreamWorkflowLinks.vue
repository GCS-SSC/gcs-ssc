<script setup lang="ts">
const { transferPaymentId, streamId, agencyId, entityType, canUpdate = false } = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId: string
  entityType: string
  canUpdate?: boolean
}>()
</script>

<template>
  <TransferPaymentWorkflowSetupsTab
    :transfer-payment-id="transferPaymentId"
    :stream-id="streamId"
    :agency-id="agencyId"
    :entity-type="entityType"
    :can-update-child="canUpdate"
    :can-delete-child="false" />
</template>
