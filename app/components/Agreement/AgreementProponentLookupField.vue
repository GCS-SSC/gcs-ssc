<script setup lang="ts">
import { computed } from 'vue'
import type { FundingCaseAgreementApplicantRecipientForm } from '~~/shared/types/funding-case-agreement-ui'

const { state, fetchUrl, label } = defineProps<{
  state: FundingCaseAgreementApplicantRecipientForm
  fetchUrl: string
  label: string
}>()
const { locale } = useI18n()
const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>()
// The parent keys this field by Agreement and relationship. Capture the loaded
// reference once; mutable selection must never relabel a replacement identity.
const originalId = state.id ? String(state.egcs_fc_applicantrecipient ?? '') : ''
const originalNameEn = state.applicant_recipient_name_en
const originalNameFr = state.applicant_recipient_name_fr
const prependItems = computed(() => originalId
  && String(state.egcs_fc_applicantrecipient ?? '') === originalId
  && (originalNameEn || originalNameFr)
  ? [{ value: originalId, label: (locale.value === 'fr' ? originalNameFr || originalNameEn : originalNameEn || originalNameFr) ?? '' }]
  : [])
</script>

<template>
  <CommonServerLookupSelect
    :model-value="state.egcs_fc_applicantrecipient"
    :fetch-url="fetchUrl"
    :prepend-items="prependItems"
    value-key="id"
    label-en-key="label_en"
    label-fr-key="label_fr"
    searchable
    :aria-label="label"
    @update:model-value="value => emit('update:modelValue', value as string | undefined)" />
</template>
