<script setup lang="ts">
import AgencyWorkflowSetupDetailPage from '~/components/Agency/AgencyWorkflowSetupDetailPage.vue'

definePageMeta({
  i18n: {
    paths: {
      en: '/agencies/[id]/workflows/[workflowSetupId]/flow',
      fr: '/agences/[id]/configurations-flux-travail/[workflowSetupId]/flux'
    }
  }
})
</script>

<template>
  <AgencyWorkflowSetupDetailPage flow-only />
</template>
