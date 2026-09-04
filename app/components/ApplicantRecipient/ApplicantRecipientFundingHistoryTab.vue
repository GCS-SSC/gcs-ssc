<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local table presentation helpers are self-documenting */
import { getPaginationRowModel } from '@tanstack/table-core'
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { FundingHistoryRow, VisibleFundingHistoryRow } from '~/types/funding-history'
import { appRouteLocations } from '~/utils/route-locations'
import { formatMoneyText, type Money } from '~~/shared/utils/money'

const {
  applicantRecipientId,
  applicantRecipientLabel,
  canCreate = false
} = defineProps<{
  applicantRecipientId: string
  applicantRecipientLabel: string
  canCreate?: boolean
}>()

const fundingHistoryUrl = computed(() =>
  `/api/applicant-recipients/${applicantRecipientId}/funding-history`
)

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()

const {
  search,
  pagination,
  items,
  totalRecords,
  status,
  refresh
} = useResourceTable<FundingHistoryRow>({
  fetchUrl: fundingHistoryUrl
})

const isWizardOpen: Ref<boolean> = ref(false)
const selectedHistory: Ref<VisibleFundingHistoryRow | null> = ref(null)

watch(() => applicantRecipientId, () => {
  isWizardOpen.value = false
  selectedHistory.value = null
})

const columns: TableColumnInput<FundingHistoryRow>[] = [
  { accessorKey: 'source', headerKey: 'applicant_recipient.funding_history.fields.source' },
  { id: 'agency', headerKey: 'applicant_recipient.funding_history.fields.agency' },
  { id: 'program', headerKey: 'applicant_recipient.funding_history.fields.program' },
  { id: 'agreementNumber', headerKey: 'applicant_recipient.funding_history.fields.agreement_number' },
  { id: 'title', headerKey: 'applicant_recipient.funding_history.fields.title' },
  { id: 'dates', headerKey: 'applicant_recipient.funding_history.fields.dates' },
  { id: 'amount', headerKey: 'applicant_recipient.funding_history.fields.amount_currency' },
  { id: 'actions', headerKey: 'common.actions' }
]

const isVisible = (row: FundingHistoryRow): row is VisibleFundingHistoryRow => !row.restricted
const localized = (english?: string | null, french?: string | null): string => {
  const primary = locale.value === 'fr' ? french : english
  const secondary = locale.value === 'fr' ? english : french
  return primary || secondary || t('common.none')
}

const formatDate = (value?: string | null): string => {
  if (!value) return t('common.none')
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return t('common.none')
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(date)
}

const formatMoney = (amount: Money, currency: string): string =>
  formatMoneyText(amount, locale.value, currency.toUpperCase())

const openCreate = () => {
  selectedHistory.value = null
  isWizardOpen.value = true
}

const openEdit = (history: VisibleFundingHistoryRow) => {
  selectedHistory.value = history
  isWizardOpen.value = true
}

const openSystemAgreement = async (history: VisibleFundingHistoryRow) => {
  if (!history.agreementId) return
  await navigateTo(localePath(appRouteLocations.agreementDetail(String(history.agreementId))))
}

const unlink = async (history: VisibleFundingHistoryRow) => {
  if (!history.historyId) return
  try {
    const deleted = await confirmDeleteRequest(
      `/api/applicant-recipients/${applicantRecipientId}/funding-history/${history.historyId}`,
      {
        title: t('applicant_recipient.funding_history.unlink.title'),
        description: t('applicant_recipient.funding_history.unlink.description')
      }
    )
    if (deleted) await refresh()
  } catch (error: unknown) {
    showError(error)
  }
}

const menuItems = (history: VisibleFundingHistoryRow) => [[
  ...(history.canUpdate
    ? [{
        label: t('common.edit'),
        icon: 'i-lucide-pencil',
        onSelect: () => openEdit(history)
      }]
    : []),
  ...(history.canDelete
    ? [{
        label: t('applicant_recipient.funding_history.actions.unlink'),
        icon: 'i-lucide-unlink',
        color: 'error' as const,
        onSelect: () => unlink(history)
      }]
    : [])
]]

const hasExternalActions = (history: VisibleFundingHistoryRow): boolean => Boolean(history.canUpdate || history.canDelete)
const visibleRows = computed(() => items.value)
</script>

<template>
  <div class="w-full min-w-0 max-w-full space-y-4 overflow-hidden">
    <div class="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <UIcon name="i-lucide-history" class="mt-0.5 size-5 shrink-0 text-zinc-500" />
      <p class="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {{ t('applicant_recipient.funding_history.description') }}
      </p>
    </div>

    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="visibleRows"
      :columns="columns"
      :total-records="totalRecords"
      :loading="status === 'pending'"
      :request-status="status"
      :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
      :button-label="t('applicant_recipient.funding_history.actions.add_external')"
      :show-button="canCreate"
      :search-placeholder="t('applicant_recipient.funding_history.search')"
      table-class="min-w-[1100px]"
      @add="openCreate"
      @retry="refresh">
      <template #source-cell="{ row }">
        <CommonStatusBadge
          :variant="row.original.source === 'system' ? 'info' : 'meta'"
          :label="t(`applicant_recipient.funding_history.source.${row.original.source}`)" />
      </template>

      <template #agency-cell="{ row }">
        <span v-if="isVisible(row.original)" class="font-medium text-zinc-800 dark:text-zinc-200">
          {{ localized(row.original.agencyNameEn, row.original.agencyNameFr) }}
        </span>
        <span v-else class="inline-flex items-center gap-2 font-medium text-red-700 dark:text-red-300">
          <UIcon name="i-lucide-lock-keyhole" class="size-4" />
          {{ t('applicant_recipient.funding_history.restricted') }}
        </span>
      </template>

      <template #program-cell="{ row }">
        <span v-if="isVisible(row.original)" class="font-medium text-zinc-700 dark:text-zinc-300">
          {{ localized(row.original.programNameEn, row.original.programNameFr) }}
        </span>
        <span v-else aria-hidden="true">{{ t('common.none') }}</span>
      </template>

      <template #agreementNumber-cell="{ row }">
        <span v-if="isVisible(row.original)" class="font-mono text-sm font-semibold">
          {{ row.original.agreementNumber }}
        </span>
        <span v-else aria-hidden="true">{{ t('common.none') }}</span>
      </template>

      <template #title-cell="{ row }">
        <ULink
          v-if="isVisible(row.original) && row.original.source === 'system' && row.original.agreementId"
          :to="localePath(appRouteLocations.agreementDetail(String(row.original.agreementId)))"
          class="font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white">
          {{ localized(row.original.titleEn, row.original.titleFr) }}
        </ULink>
        <span v-else-if="isVisible(row.original)" class="font-medium">
          {{ localized(row.original.titleEn, row.original.titleFr) }}
        </span>
        <span v-else aria-hidden="true">{{ t('common.none') }}</span>
      </template>

      <template #dates-cell="{ row }">
        <span v-if="isVisible(row.original)" class="text-sm leading-5 text-zinc-600 dark:text-zinc-400">
          {{ formatDate(row.original.startDate) }}<br>
          {{ formatDate(row.original.endDate) }}
        </span>
        <span v-else aria-hidden="true">{{ t('common.none') }}</span>
      </template>

      <template #amount-cell="{ row }">
        <div v-if="isVisible(row.original)" class="space-y-1 whitespace-nowrap">
          <div v-for="total in row.original.totals || []" :key="total.currency" class="font-mono text-sm font-semibold">
            {{ formatMoney(total.amount, total.currency) }}
          </div>
          <span v-if="!row.original.totals?.length">{{ t('common.none') }}</span>
        </div>
        <span v-else aria-hidden="true">{{ t('common.none') }}</span>
      </template>

      <template #actions-cell="{ row }">
        <div v-if="isVisible(row.original)" class="flex justify-end">
          <UButton
            v-if="row.original.source === 'system' && row.original.agreementId"
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            :aria-label="t('common.open')"
            @click="openSystemAgreement(row.original)" />
          <UDropdownMenu v-else-if="row.original.source === 'external' && hasExternalActions(row.original)" :items="menuItems(row.original)">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              :aria-label="t('common.actions')" />
          </UDropdownMenu>
        </div>
      </template>
    </CommonResourceLayoutCard>

    <ApplicantRecipientFundingHistoryWizardModal
      v-model:open="isWizardOpen"
      :applicant-recipient-id="applicantRecipientId"
      :applicant-recipient-label="applicantRecipientLabel"
      :history="selectedHistory"
      @saved="refresh" />
  </div>
</template>

<style scoped>
:deep(table) {
  width: 100%;
  table-layout: fixed;
}

:deep(th),
:deep(td) {
  overflow-wrap: anywhere;
  white-space: normal;
}

:deep(th:nth-child(1)) { width: 11%; }
:deep(th:nth-child(2)) { width: 12%; }
:deep(th:nth-child(3)) { width: 18%; }
:deep(th:nth-child(4)) { width: 12%; }
:deep(th:nth-child(5)) { width: 18%; }
:deep(th:nth-child(6)) { width: 12%; }
:deep(th:nth-child(7)) { width: 11%; }
:deep(th:nth-child(8)) { width: 6%; }
</style>
