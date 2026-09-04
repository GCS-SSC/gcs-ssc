<script setup lang="ts">
import TransferPaymentReviewSetupDetailPage from '~/components/TransferPayment/TransferPaymentReviewSetupDetailPage.vue'

definePageMeta({
  i18n: {
    paths: {
      en: '/transfer-payments/[id]/streams/[streamId]/review-setups/[reviewSetupId]',
      fr: '/paiements-de-transfert/[id]/volets/[streamId]/configurations-examen/[reviewSetupId]'
    }
  }
})
</script>

<template>
  <TransferPaymentReviewSetupDetailPage />
</template>
