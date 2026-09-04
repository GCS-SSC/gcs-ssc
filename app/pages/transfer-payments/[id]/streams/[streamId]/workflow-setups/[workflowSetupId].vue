<script setup lang="ts">
import TransferPaymentWorkflowSetupDetailPage from '~/components/TransferPayment/TransferPaymentWorkflowSetupDetailPage.vue'

definePageMeta({
  i18n: {
    paths: {
      en: '/transfer-payments/[id]/streams/[streamId]/workflow-setups/[workflowSetupId]',
      fr: '/paiements-de-transfert/[id]/volets/[streamId]/configurations-flux-travail/[workflowSetupId]'
    }
  }
})
</script>

<template>
  <TransferPaymentWorkflowSetupDetailPage />
</template>
