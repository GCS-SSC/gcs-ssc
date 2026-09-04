<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local display helpers are self-documenting and not public APIs */
import { computed } from 'vue'
import type { ApplicantRecipientProfileRow } from '~~/shared/types/applicant-recipient-ui'

const { profile } = defineProps<{
  profile: ApplicantRecipientProfileRow
}>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()

const statusLabel = computed(() => t(profile.egcs_ar_active ? 'common.active' : 'common.inactive'))

const displayValue = (value: string | number | null | undefined) => {
  if (value === undefined || value === null || value === '') {
    return '-'
  }

  return String(value)
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8 py-4">
    <CommonSection :title="t('applicant_recipient.sections.classification')" badge="01">
      <CommonValueCard :label="t('applicant_recipient.subtype')" :value="getBilingualValue(profile, 'subtype_name', '-')" />
      <CommonValueCard :label="t('applicant_recipient.status')" :value="statusLabel" />
      <CommonValueCard :label="t('applicant_recipient.lead_agency')" :value="getBilingualValue(profile, 'lead_agency_name', '-')" />
    </CommonSection>

    <CommonSection :title="t('applicant_recipient.sections.identity')" badge="02">
      <CommonValueCard :label="t('applicant_recipient.legal_name_en')" :value="displayValue(profile.egcs_ar_legalname_en)" />
      <CommonValueCard :label="t('applicant_recipient.legal_name_fr')" :value="displayValue(profile.egcs_ar_legalname_fr)" />
      <CommonValueCard :label="t('applicant_recipient.operating_name_en')" :value="displayValue(profile.egcs_ar_operatingname_en)" />
      <CommonValueCard :label="t('applicant_recipient.operating_name_fr')" :value="displayValue(profile.egcs_ar_operatingname_fr)" />
      <CommonValueCard :label="t('applicant_recipient.research_organization_en')" :value="displayValue(profile.egcs_ar_researchorganization_en)" />
      <CommonValueCard :label="t('applicant_recipient.research_organization_fr')" :value="displayValue(profile.egcs_ar_researchorganization_fr)" />
      <CommonValueCard :label="t('applicant_recipient.description_en')" :value="displayValue(profile.egcs_ar_description_en)" />
      <CommonValueCard :label="t('applicant_recipient.description_fr')" :value="displayValue(profile.egcs_ar_description_fr)" />
    </CommonSection>
  </div>
</template>
