<script setup lang="ts">
definePageMeta({ i18n: { paths: { en: '/agencies/[id]/data-collections/[dataCollectionSetupId]', fr: '/agences/[id]/collectes-de-donnees/[dataCollectionSetupId]' } } })
const route = useRoute()
</script>

<template>
  <AgencyDataCollectionDetailPage :key="`${route.params.id}:${route.params.dataCollectionSetupId}`" />
</template>
