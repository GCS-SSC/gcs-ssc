<script setup lang="ts">
import TransferPaymentApprovalTemplateDetailPage from '~/components/TransferPayment/TransferPaymentApprovalTemplateDetailPage.vue'

definePageMeta({
  i18n: {
    paths: {
      en: '/transfer-payments/[id]/streams/[streamId]/approval-templates/[templateId]',
      fr: '/paiements-de-transfert/[id]/volets/[streamId]/modeles-approbation/[templateId]'
    }
  }
})
</script>

<template>
  <TransferPaymentApprovalTemplateDetailPage />
</template>
