<script setup lang="ts">
import CommonReviewsTab from '~/components/Common/ReviewsTab.vue'

const { applicantRecipientId, canUpdate = false } = defineProps<{
  applicantRecipientId: string
  canUpdate?: boolean
}>()
</script>

<template>
  <CommonReviewsTab
    entity-type="applicantrecipient"
    :entity-id="applicantRecipientId"
    :can-update="canUpdate" />
</template>
