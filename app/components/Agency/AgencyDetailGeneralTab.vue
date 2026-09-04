<script setup lang="ts">
import { computed } from 'vue'
import type { AgencyProfileItem } from '~~/shared/types/schemas'

const { agency } = defineProps<{
  agency: AgencyProfileItem
}>()

const { t } = useI18n()

const statusLabel = computed(() => t(agency.egcs_ay_active ? 'common.active' : 'common.inactive'))
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8 py-4">
    <div class="space-y-8">
      <div class="space-y-8">
        <CommonSection :title="t('agency.detail.core_info')" badge="01">
          <CommonValueCard
            :label="t('agency.detail.english_profile')"
            :value="agency.egcs_ay_name_en"
            :sub-value="agency.egcs_ay_abbreviation_en" />

          <CommonValueCard
            :label="t('agency.detail.french_profile')"
            :value="agency.egcs_ay_name_fr"
            :sub-value="agency.egcs_ay_abbreviation_fr" />
        </CommonSection>

        <CommonSection :title="t('agency.detail.system_config')" badge="02">
          <CommonValueCard
            :label="t('agency.detail.gwcoa_link')"
            :value="agency.egcs_ay_gwcoa_number"
            :sub-value="t('agency.detail.chart_of_accounts')"
            icon="i-lucide-landmark"
            variant="ghost" />

          <CommonValueCard
            :label="t('agency.detail.financial_link')"
            :value="agency.egcs_ay_agencyfinancialsystemid"
            :sub-value="t('agency.detail.external_id')"
            icon="i-lucide-database"
            variant="ghost" />

          <CommonValueCard
            :label="t('agency.detail.op_status')"
            :value="statusLabel"
            :sub-value="t('agency.detail.lifecycle')"
            icon="i-lucide-shield-check"
            variant="ghost"
            :color="agency.egcs_ay_active ? 'success' : 'neutral'" />
        </CommonSection>
      </div>
    </div>
  </div>
</template>
