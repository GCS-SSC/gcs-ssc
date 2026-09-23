<script setup lang="ts">
import AgencyWorkflowSetupDetailPage from '~/components/Agency/AgencyWorkflowSetupDetailPage.vue'

definePageMeta({
  i18n: {
    paths: {
      en: '/agencies/[id]/workflows/[workflowSetupId]',
      fr: '/agences/[id]/configurations-flux-travail/[workflowSetupId]'
    }
  }
})
</script>

<template>
  <AgencyWorkflowSetupDetailPage />
</template>
