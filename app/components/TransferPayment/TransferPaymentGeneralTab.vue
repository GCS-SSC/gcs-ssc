<script setup lang="ts">
import type { TransferPaymentProfileItem } from '~~/shared/types/schemas'

const { profile, formatDate } = defineProps<{
  profile: TransferPaymentProfileItem
  formatDate: (value: string | Date | null | undefined) => string
}>()

const { t } = useI18n()
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8 py-4">
    <CommonSection :title="t('agency.detail.core_info')" badge="01">
      <CommonValueCard :label="t('transfer_payment.name_en')" :value="profile.egcs_tp_name_en" />
      <CommonValueCard :label="t('transfer_payment.name_fr')" :value="profile.egcs_tp_name_fr" />
      <CommonValueCard :label="t('transfer_payment.abbreviation_en')" :value="profile.egcs_tp_abbreviation_en" />
      <CommonValueCard :label="t('transfer_payment.abbreviation_fr')" :value="profile.egcs_tp_abbreviation_fr" />
      <CommonValueCard :label="t('transfer_payment.purpose_en')" :value="profile.egcs_tp_purpose_en" />
      <CommonValueCard :label="t('transfer_payment.purpose_fr')" :value="profile.egcs_tp_purpose_fr" />
      <CommonValueCard :label="t('transfer_payment.start_date')" :value="formatDate(profile.egcs_tp_datestart)" />
      <CommonValueCard :label="t('transfer_payment.end_date')" :value="formatDate(profile.egcs_tp_dateend)" />
      <UCard class="border-none bg-white shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:ring-zinc-800">
        <div class="space-y-1">
          <p class="mb-2 text-xs leading-none font-black tracking-widest text-zinc-400 uppercase dark:text-zinc-500">
            {{ t('transfer_payment.terms_link') }}
          </p>
          <a
            class="text-primary text-sm font-black break-all underline underline-offset-2"
            :href="profile.egcs_tp_tclink"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="t('transfer_payment.terms_link')">
            {{ profile.egcs_tp_tclink }}
          </a>
        </div>
      </UCard>
    </CommonSection>
  </div>
</template>
