<script setup lang="ts">
import AssessmentDetailPage from '~/components/Assessment/AssessmentDetailPage.vue'

definePageMeta({
  key: route => JSON.stringify(['assessment', route.params.reviewId]),
  i18n: {
    paths: {
      en: '/assessments/[reviewId]',
      fr: '/evaluations/[reviewId]'
    }
  }
})
</script>

<template>
  <AssessmentDetailPage />
</template>
