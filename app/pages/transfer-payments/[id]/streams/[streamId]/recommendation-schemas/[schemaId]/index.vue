<script setup lang="ts">
import RecommendationSchemaDetailPage from '~/components/RecommendationSchema/RecommendationSchemaDetailPage.vue'

definePageMeta({
  i18n: {
    paths: {
      en: '/transfer-payments/[id]/streams/[streamId]/recommendation-schemas/[schemaId]',
      fr: '/paiements-de-transfert/[id]/volets/[streamId]/schemas-recommandation/[schemaId]'
    }
  }
})
</script>

<template>
  <RecommendationSchemaDetailPage />
</template>
