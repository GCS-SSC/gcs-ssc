<script setup lang="ts">
import CommonReviewsTab from '~/components/Common/ReviewsTab.vue'

const { applicantRecipientId, canUpdate = false } = defineProps<{
  applicantRecipientId: string
  canUpdate?: boolean
}>()
</script>

<template>
  <section data-help-target="proponent.reviews.content" data-help-kind="section" data-help-view="proponent.reviews" class="flex w-full min-w-0 flex-col">
    <CommonReviewsTab

      entity-type="applicantrecipient"
      :entity-id="applicantRecipientId"
      :can-update="canUpdate" />
  </section>
</template>
