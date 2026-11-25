<script setup lang="ts">
import type { ClaimCustomFieldSnapshot } from '~~/shared/types/schemas/agreement-custom-fields'

defineProps<{ value?: ClaimCustomFieldSnapshot[number]['value'] }>()
const { t } = useI18n()
</script>

<template>
  <del class="text-error">
    <span class="sr-only">{{ t('submission.before') }} </span>
    <AgreementSubmissionCustomFieldEvidence v-if="value != null" :value="value" />
    <template v-else>
      {{ t('supplementary_information.no_answer') }}
    </template>
  </del>
</template>
