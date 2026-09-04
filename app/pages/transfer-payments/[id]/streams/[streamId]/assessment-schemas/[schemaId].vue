<script setup lang="ts">
import AssessmentSchemaDetailPage from '~/components/AssessmentSchema/AssessmentSchemaDetailPage.vue'

definePageMeta({
  i18n: {
    paths: {
      en: '/transfer-payments/[id]/streams/[streamId]/assessment-schemas/[schemaId]',
      fr: '/paiements-de-transfert/[id]/volets/[streamId]/schemas-evaluation/[schemaId]'
    }
  }
})
</script>

<template>
  <AssessmentSchemaDetailPage />
</template>
