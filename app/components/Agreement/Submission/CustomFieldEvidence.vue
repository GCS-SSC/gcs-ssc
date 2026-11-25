<script setup lang="ts">
import { computed } from 'vue'
import { isSubmissionStructuredEvidence } from '~/utils/agreement-submission-view'
import type { ClaimCustomFieldSnapshot } from '~~/shared/types/schemas/agreement-custom-fields'
import AgreementSubmissionStructuredEvidence from './StructuredEvidence.vue'
import AgreementSubmissionScalarEvidence from './ScalarEvidence.vue'

type CapturedAnswer = ClaimCustomFieldSnapshot[number]['value']
const { value, previous, label } = defineProps<{ value?: CapturedAnswer; previous?: CapturedAnswer; label?: string }>()
const structured = computed(() => isSubmissionStructuredEvidence(value) ? value : undefined)
const previousStructured = computed(() => isSubmissionStructuredEvidence(previous) ? previous : undefined)
</script>

<template>
  <AgreementSubmissionStructuredEvidence
    v-if="structured || previousStructured"
    :value="structured"
    :previous="previousStructured"
    :compare="previous !== undefined"
    :label="label" />
  <AgreementSubmissionScalarEvidence
    v-else
    :value="isSubmissionStructuredEvidence(value) ? undefined : value"
    :previous="isSubmissionStructuredEvidence(previous) ? undefined : previous" />
</template>
