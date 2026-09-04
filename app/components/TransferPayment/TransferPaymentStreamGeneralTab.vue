<script setup lang="ts">
import type { TransferPaymentStreamItem } from '~~/shared/types/schemas'

const { stream } = defineProps<{
  stream: TransferPaymentStreamItem & { parent_name_en?: string; parent_name_fr?: string }
}>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8 py-4">
    <CommonSection :title="t('agency.detail.core_info')" badge="01">
      <CommonValueCard :label="t('transfer_payment.name_en')" :value="stream.egcs_tp_name_en" />
      <CommonValueCard :label="t('transfer_payment.name_fr')" :value="stream.egcs_tp_name_fr" />
      <CommonValueCard :label="t('transfer_payment.abbreviation_en')" :value="stream.egcs_tp_abbreviation_en" />
      <CommonValueCard :label="t('transfer_payment.abbreviation_fr')" :value="stream.egcs_tp_abbreviation_fr" />
      <CommonValueCard :label="t('transfer_payment.parent_stream')" :value="getBilingualValue(stream, 'parent_name', '-')" />
      <CommonValueCard :label="t('transfer_payment.objective_en')" :value="stream.egcs_tp_objective_en" />
      <CommonValueCard :label="t('transfer_payment.objective_fr')" :value="stream.egcs_tp_objective_fr" />
      <CommonValueCard
        :label="t('transfer_payment.allows_further_distribution')"
        :value="stream.egcs_tp_allowsfurtherdistribution ? t('common.yes') : t('common.no')" />
    </CommonSection>
  </div>
</template>
