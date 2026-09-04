<script setup lang="ts">
import ChecklistSchemaDetailPage from '~/components/ChecklistSchema/ChecklistSchemaDetailPage.vue'

definePageMeta({ i18n: { paths: { en: '/transfer-payments/[id]/streams/[streamId]/checklist-schemas/[schemaId]', fr: '/paiements-de-transfert/[id]/volets/[streamId]/schemas-listes/[schemaId]' } } })
</script>

<template>
  <ChecklistSchemaDetailPage />
</template>
