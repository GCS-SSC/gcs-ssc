<script setup lang="ts">
import { appRouteLocations } from '~/utils/route-locations'
import type { JournalVoucherRow } from '~~/shared/types/journal-voucher'
import type { TableColumnInput } from '~/composables/useTableColumns'

definePageMeta({ i18n: { paths: { en: '/journal-vouchers', fr: '/pieces-de-journal' } } })
const { t } = useI18n()
const localePath = useLocalePath()
const { canAny } = useCan()
const { formatDate } = useDateHelpers()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('journal-vouchers')
const open = ref(false)
const { search, pagination, items, totalRecords, status, retry } = useResourceTable<JournalVoucherRow>({
  fetchUrl: '/api/journal-vouchers'
})
const columns: TableColumnInput<JournalVoucherRow>[] = [
  { accessorKey: 'egcs_fc_number', headerKey: 'journal_voucher.number' },
  { accessorKey: 'egcs_fc_agreementnumber', headerKey: 'agreement.title' },
  { accessorKey: 'egcs_fc_fiscalyeardisplay', headerKey: 'agreement.payments.fiscal_year' },
  { id: 'requesteddate', accessorKey: 'egcs_fc_requesteddate', headerKey: 'journal_voucher.requested_date' },
  { id: 'status', headerKey: 'common.status' }, { id: 'actions', headerKey: 'common.actions' }
]
const created = async (id: string) => await navigateTo(localePath(appRouteLocations.journalVoucherDetail(id)))
</script>

<template>
  <CommonDetailPage id="journal-vouchers" v-model:collapsed="isHeroCollapsed" data-help-view="journal-vouchers.list" :title="t('journal_voucher.title')">
    <template #body>
      <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-book-open-check" :title="t('journal_voucher.title')" :description="t('journal_voucher.description')" />
      <section data-help-target="journal-vouchers.list.records">
        <CommonResourceLayout v-model:search="search" v-model:pagination="pagination" help-add-target="journal-vouchers.list.add" help-search-target="journal-vouchers.list.search" :data="items" :columns="columns" :total-records="totalRecords" :request-status="status" :loading="status === 'pending'" :button-label="t('journal_voucher.create')" :show-button="canAny('journal_voucher', 'create') && canAny('agreement', 'read')" @add="open = true" @retry="retry">
          <template #requesteddate-cell="{ row }">
            <span class="whitespace-nowrap">{{ formatDate(row.original.egcs_fc_requesteddate) }}</span>
          </template>
          <template #status-cell="{ row }">
            <CommonStatusBadge :status-id="row.original.egcs_fc_status" :is-completed="row.original.isCompleted" />
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <CommonActionButton icon="i-lucide-eye" color="neutral" variant="ghost" :aria-label="t('common.view_details')" :to="localePath(appRouteLocations.journalVoucherDetail(row.original.id))" />
            </div>
          </template>
        </CommonResourceLayout>
      </section>
      <JournalVoucherCreateModal v-model:open="open" @created="created" />
    </template>
  </CommonDetailPage>
</template>
