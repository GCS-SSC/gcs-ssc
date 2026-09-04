<script setup lang="ts">
import ChecklistDetailPage from '~/components/Checklist/ChecklistDetailPage.vue'

definePageMeta({
  i18n: {
    paths: {
      en: '/checklists/[reviewId]',
      fr: '/listes-de-verification/[reviewId]'
    }
  }
})
</script>

<template>
  <ChecklistDetailPage />
</template>
