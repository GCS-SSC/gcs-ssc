<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local display helpers are self-documenting and not public APIs */
import { computed } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import type { FundingCaseAgreementProfileRow } from '~~/shared/types/funding-case-agreement-ui'

const { profile } = defineProps<{
  profile: FundingCaseAgreementProfileRow
}>()

const { t, n } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { formatDate } = useDateHelpers()
const localePath = useLocalePath()
const agreementProfileExtensionContext = computed(() => ({
  kind: 'agreement.profile',
  mode: 'read',
  agreementId: profile?.id ? String(profile.id) : undefined,
  streamId: profile?.egcs_fc_transferpaymentstream ? String(profile.egcs_fc_transferpaymentstream) : undefined,
  ownerType: 'fundingcaseagreement',
  ownerId: profile?.id ? String(profile.id) : undefined,
  profile
}))

const profileStreamId = computed(() => profile?.egcs_fc_transferpaymentstream ? String(profile.egcs_fc_transferpaymentstream) : '')

const riskRatingLabel = computed(() => {
  const label = getBilingualValue(profile, 'risk_rating_name', '')
  if (label) {
    return label
  }

  return displayValue(profile.egcs_fc_riskscore)
})

const formatPercent = (value: string | number | null | undefined) => {
  if (value === undefined || value === null || value === '') {
    return '-'
  }

  return n(Number(value) / 100, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

const displayValue = (value: string | number | boolean | null | undefined) => {
  if (value === undefined || value === null || value === '') {
    return '-'
  }

  if (typeof value === 'boolean') {
    return value ? t('common.yes') : t('common.no')
  }

  return String(value)
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8 py-4">
    <CommonSection :title="t('agreement.sections.classification')" badge="01">
      <CommonValueCard :label="t('agreement.agency')" :value="getBilingualValue(profile, 'agency_name', '-')" />
      <CommonValueCard :label="t('agreement.program')" :value="getBilingualValue(profile, 'program_name', '-')" />
      <CommonValueCard :label="t('agreement.stream')" :value="getBilingualValue(profile, 'stream_name', '-')" />
      <CommonValueCard :label="t('agreement.agreement_subtype')" :value="getBilingualValue(profile, 'agreement_subtype_name', '-')" />
      <CommonValueCard :label="t('agreement.agreement_number')" :value="displayValue(profile.egcs_fc_agreementnumber)" />
      <CommonValueCard :label="t('agreement.financial_system_number')" :value="displayValue(profile.egcs_fc_financialsystemnumber)" />
      <CommonValueCard :label="t('agreement.further_distribution')" :value="displayValue(profile.egcs_fc_furtherdistribution)" />
      <CommonValueCard :label="t('agreement.authorized_assistance_start_date')" :value="formatDate(profile.egcs_fc_authorizedassistancestartdate)" />
      <CommonValueCard :label="t('agreement.authorized_assistance_end_date')" :value="formatDate(profile.egcs_fc_authorizedassistanceenddate)" />
      <NuxtLink
        :to="localePath(appRouteLocations.transferPaymentDetail(String(profile.program_id)))"
        class="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <CommonValueCard :label="t('agreement.program_link')" :value="getBilingualValue(profile, 'program_name', '-')" />
      </NuxtLink>
      <NuxtLink
        :to="localePath(appRouteLocations.transferPaymentStreamDetail(String(profile.program_id), String(profile.egcs_fc_transferpaymentstream)))"
        class="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <CommonValueCard :label="t('agreement.stream_route')" :value="getBilingualValue(profile, 'stream_name', '-')" />
      </NuxtLink>
      <ExtensionSlotHost
        v-if="profileStreamId"
        slot-name="agreement.profile.classification.fields"
        :stream-id="profileStreamId"
        permission-action="read"
        :context="agreementProfileExtensionContext" />
    </CommonSection>

    <CommonSection :title="t('agreement.sections.profile')" badge="02">
      <CommonValueCard :label="t('agreement.title_en')" :value="displayValue(profile.egcs_fc_title_en)" />
      <CommonValueCard :label="t('agreement.title_fr')" :value="displayValue(profile.egcs_fc_title_fr)" />
      <CommonValueCard :label="t('agreement.description_en')" :value="displayValue(profile.egcs_fc_description_en)" />
      <CommonValueCard :label="t('agreement.description_fr')" :value="displayValue(profile.egcs_fc_description_fr)" />
      <ExtensionSlotHost
        v-if="profileStreamId"
        slot-name="agreement.profile.profile.fields"
        :stream-id="profileStreamId"
        permission-action="read"
        :context="agreementProfileExtensionContext" />
    </CommonSection>

    <CommonSection :title="t('agreement.sections.risk_management')" badge="03">
      <CommonValueCard :label="t('agreement.holdback')" :value="formatPercent(profile.egcs_fc_holdback)" />
      <CommonValueCard :label="t('agreement.holdback_basis')" :value="getBilingualValue(profile, 'holdback_basis_name', '-')" />
      <CommonValueCard :label="t('agreement.risk_score')" :value="riskRatingLabel" />
      <ExtensionSlotHost
        v-if="profileStreamId"
        slot-name="agreement.profile.risk-management.fields"
        :stream-id="profileStreamId"
        permission-action="read"
        :context="agreementProfileExtensionContext" />
    </CommonSection>

    <ExtensionSlotHost
      v-if="profileStreamId"
      slot-name="agreement.profile.sections.after"
      :stream-id="profileStreamId"
      permission-action="read"
      :context="agreementProfileExtensionContext" />
    <AgreementFieldsCustomFields v-if="profile && profileStreamId" :model-value="profile.egcs_fc_customfields ?? {}" :stream-id="profileStreamId" :agreement-id="String(profile.id)" permission-action="read" readonly />
  </div>
</template>
