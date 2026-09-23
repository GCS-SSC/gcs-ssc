<script setup lang="ts">
import TransferPaymentReviewSetupDetailPage from '~/components/TransferPayment/TransferPaymentReviewSetupDetailPage.vue'

definePageMeta({
  i18n: {
    paths: {
      en: '/agencies/[id]/review-sets/[reviewSetId]',
      fr: '/agences/[id]/ensembles-examen/[reviewSetId]'
    }
  }
})
</script>

<template>
  <TransferPaymentReviewSetupDetailPage />
</template>
