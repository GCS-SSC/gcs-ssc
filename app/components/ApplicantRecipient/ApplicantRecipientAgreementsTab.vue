<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local navigation helpers are self-documenting and not public APIs */
import { getPaginationRowModel } from '@tanstack/table-core'
import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import type { FundingCaseAgreementProfileRow } from '~~/shared/types/funding-case-agreement-ui'

const { applicantRecipientId } = defineProps<{
  applicantRecipientId: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const permissions = useCan()
const { getBilingualValue } = useBilingualValue()

const {
  search,
  pagination,
  items: agreements,
  totalRecords,
  status,
  refresh
} = useResourceTable<FundingCaseAgreementProfileRow>({
  fetchUrl: `/api/applicant-recipients/${applicantRecipientId}/agreements`
})

const canCreateAgreement: ComputedRef<boolean> = computed(() => {
  if (typeof permissions.canAny !== 'function') {
    return false
  }

  return permissions.canAny('agreement', 'create')
})

const columns: TableColumnInput<FundingCaseAgreementProfileRow>[] = [
  { accessorKey: 'egcs_fc_agreementnumber', headerKey: 'agreement.agreement_number' },
  { accessorKey: 'egcs_fc_title_en', headerKey: 'agreement.title_en' },
  { id: 'program', headerKey: 'agreement.program' },
  { id: 'stream', headerKey: 'agreement.stream' },
  { accessorKey: 'egcs_fc_agreementtype', headerKey: 'agreement.agreement_type' },
  { id: 'actions', headerKey: 'common.actions' }
]

const getAgreementTypeLabel = (value?: string) => {
  if (!value) {
    return '-'
  }

  return t(`enums.agreement_type.${value}`)
}

const openCreateAgreement = async () => {
  await navigateTo(localePath({
    ...appRouteLocations.agreementCreate(),
    query: {
      applicant_recipient_id: applicantRecipientId
    }
  }))
}

const openAgreement = async (agreement: FundingCaseAgreementProfileRow) => {
  await navigateTo(localePath(appRouteLocations.agreementDetail(String(agreement.id))))
}
</script>

<template>
  <CommonResourceLayoutCard
    v-model:search="search"
    v-model:pagination="pagination"
    class="w-full"
    :data="agreements"
    :columns="columns"
    :total-records="totalRecords"
    :loading="status === 'pending'"
    :request-status="status"
    :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
    :button-label="t('agreement.new')"
    :show-button="canCreateAgreement"
    :search-placeholder="t('applicant_recipient.agreements.search')"
    @add="openCreateAgreement"
    @retry="refresh">
    <template #egcs_fc_title_en-cell="{ row }">
      <CommonBilingualName
        :name-en="row.original.egcs_fc_title_en"
        :name-fr="row.original.egcs_fc_title_fr"
        :to="localePath(appRouteLocations.agreementDetail(String(row.original.id)))" />
    </template>

    <template #program-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ getBilingualValue(row.original, 'program_name', '-') }}
      </span>
    </template>

    <template #stream-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ getBilingualValue(row.original, 'stream_name', '-') }}
      </span>
    </template>

    <template #egcs_fc_agreementtype-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ getAgreementTypeLabel(row.original.egcs_fc_agreementtype) }}
      </span>
    </template>

    <template #actions-cell="{ row }">
      <UButton
        icon="i-lucide-arrow-right"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="t('common.open')"
        @click="openAgreement(row.original)" />
    </template>
  </CommonResourceLayoutCard>
</template>
