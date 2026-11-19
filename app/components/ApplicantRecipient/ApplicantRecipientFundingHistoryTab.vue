<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { useResourceRequest } from '~/composables/useResourceRequest'
import type { EntityAssignmentRoster } from '~/composables/useEntityAssignmentRoster'
/* eslint-disable jsdoc/require-jsdoc -- local table presentation helpers are self-documenting */
import { getPaginationRowModel } from '@tanstack/table-core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { tableFilter } from '~/composables/useTablePreferences'
import type { FundingHistoryRow, VisibleFundingHistoryRow } from '~/types/funding-history'
import { appRouteLocations } from '~/utils/route-locations'
import { AssignedListViewSchema } from '~~/shared/types/schemas/assigned-list-view'
import { formatMoneyText, type Money } from '~~/shared/utils/money'

const {
  applicantRecipientId,
  applicantRecipientLabel,
  canCreate = false,
  canCreateRole = false
} = defineProps<{
  applicantRecipientId: string
  applicantRecipientLabel: string
  canCreate?: boolean
  canCreateRole?: boolean
}>()

const fundingHistoryUrl = computed(() =>
  `/api/applicant-recipients/${applicantRecipientId}/funding-history`
)

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { canAny, permissionsReady } = useCan()
const canFilterAgreements = computed(() => permissionsReady.value && canAny('agreement', 'read'))
const { showError } = useApiErrorToast()
const toast = useLocalizedToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()

let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
const listView = ref('all')
const preferenceFilters = { listView: tableFilter(listView, 'all', undefined, value => AssignedListViewSchema.safeParse(value).success) }
watch(canFilterAgreements, (allowed, previouslyAllowed) => {
  if (previouslyAllowed && !allowed && listView.value !== 'all') listView.value = 'all'
}, { flush: 'sync' })
const listViewQuery = computed(() => ({ list_view: canFilterAgreements.value ? listView.value : 'all' }))

const {
  search,
  pagination,
  items,
  totalRecords,
  status,
  refresh
} = useResourceTable<FundingHistoryRow>({
  query: listViewQuery,
  fetchUrl: fundingHistoryUrl
})

watch([listViewQuery, () => applicantRecipientId], () => {
  pagination.value.pageIndex = 0
}, { flush: 'sync' })

const deletingHistoryId: Ref<string | null> = ref(null)
const deleteContext = useActionContext({
  identity: [() => applicantRecipientId, deletingHistoryId],
  authority: () => canAny('applicant_recipient', 'delete', ['global', 'agency']),
  eligible: () => items.value.some(row => !row.restricted && row.historyId === deletingHistoryId.value && row.canDeleteRole === true && row.canDelete === true)
})
const isWizardOpen: Ref<boolean> = ref(false)
const selectedHistory: Ref<VisibleFundingHistoryRow | null> = ref(null)
const contactAgreement: Ref<{ id: string; label: string } | null> = ref(null)
const contactsOpen = computed({
  get: () => contactAgreement.value !== null,
  set: (open: boolean) => { if (!open) contactAgreement.value = null }
})
const { user, permissionRevision } = useAuth()
const { data: contactRoster, status: contactsStatus, error: contactsError, refresh: refreshContacts } = useResourceRequest<EntityAssignmentRoster>({
  identity: () => JSON.stringify([applicantRecipientId, contactAgreement.value?.id, user.value?.id, permissionRevision.value]),
  enabled: () => contactAgreement.value !== null,
  refreshData: 'clear',
  failureData: 'clear',
  load: signal => $fetch<EntityAssignmentRoster, string>(`/api/entity-assignments/fundingcaseagreement/${contactAgreement.value?.id}`, { signal })
})
const openContacts = (history: VisibleFundingHistoryRow) => {
  if (history.source !== 'system' || !history.agreementId) return
  contactAgreement.value = { id: history.agreementId, label: history.agreementNumber }
}

watch(() => applicantRecipientId, () => {
  isWizardOpen.value = false
  selectedHistory.value = null
  contactAgreement.value = null
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
const selectedAcceptedHistory = computed(() => items.value.filter(isVisible).find(row => row.historyId === selectedHistory.value?.historyId))
const hasSummary = (row: FundingHistoryRow): boolean => typeof row.agreementNumber === 'string'
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

const formatMoney = (amount: Money): string =>
  formatMoneyText(amount, locale.value)

const warnPrerequisite = () => toast.add({ title: toast.localized('common.warning'), description: toast.localized('workflow.action_prerequisite_unavailable'), color: 'warning' })
const actionPending: Ref<boolean> = ref(false)
const checkPrerequisite = async (action: 'create' | 'update' | 'delete', history?: VisibleFundingHistoryRow) => {
  if (actionPending.value) return false
  actionPending.value = true
  const ownerId = applicantRecipientId
  try {
    if (action === 'create') {
      const profile = await $fetch<{ can_create_child_records?: boolean }, string>(`/api/applicant-recipients/${ownerId}`)
      if (disposed || ownerId !== applicantRecipientId) return false
      if (profile.can_create_child_records) return true
    } else {
      let page = 1
      while (true) {
        const response = await $fetch<{ items: FundingHistoryRow[]; total: number }, string>(`/api/applicant-recipients/${ownerId}/funding-history`, { query: { page, limit: 100, search: history?.agreementNumber } })
        if (disposed || ownerId !== applicantRecipientId) return false
        const row = response.items.find(item => !item.restricted && item.historyId === history?.historyId)
        if (row && !row.restricted) {
          if (action === 'update' ? row.canUpdate : row.canDelete) return true
          break
        }
        if (page * 100 >= response.total || response.items.length === 0) break
        page += 1
      }
    }
    warnPrerequisite()
  } catch (error: unknown) {
    if (!disposed && ownerId === applicantRecipientId) showError(error)
  } finally {
    actionPending.value = false
  }
  return false
}
const openCreate = async () => {
  if (!await checkPrerequisite('create')) return
  selectedHistory.value = null
  isWizardOpen.value = true
}

const openEdit = async (history: VisibleFundingHistoryRow) => {
  if (!await checkPrerequisite('update', history)) return
  selectedHistory.value = history
  isWizardOpen.value = true
}

const openSystemAgreement = async (history: VisibleFundingHistoryRow) => {
  if (!history.agreementId) return
  await navigateTo(localePath(appRouteLocations.agreementDetail(String(history.agreementId))))
}

const unlink = async (history: VisibleFundingHistoryRow) => {
  const ownerId = applicantRecipientId
  const historyId = history.historyId
  if (!historyId || deletingHistoryId.value) return
  deletingHistoryId.value = historyId
  const operation = deleteContext.capture()
  const current = () => !disposed && ownerId === applicantRecipientId && Boolean(operation?.canDispatch())
  try {
    if (!operation) {
      warnPrerequisite()
      return
    }
    if (!await checkPrerequisite('delete', history) || !current()) return
    const deleted = await confirmDeleteRequest(
      `/api/applicant-recipients/${ownerId}/funding-history/${historyId}`,
      {
        operation,
        target: { id: historyId, resolve: () => items.value.find(row => !row.restricted && row.historyId === historyId), eligible: row => !row.restricted && row.canDeleteRole === true && row.canDelete === true },
        title: t('applicant_recipient.funding_history.unlink.title'),
        description: t('applicant_recipient.funding_history.unlink.description'),
        shouldProceed: current
      }
    )
    if (deleted && operation.isCurrent()) await refresh()
  } catch (error: unknown) {
    if (operation?.isCurrent()) showError(error)
  } finally {
    deletingHistoryId.value = null
  }
}

const menuItems = (history: VisibleFundingHistoryRow) => [[
  ...(history.canUpdateRole
    ? [{
        label: t('common.edit'),
        icon: 'i-lucide-pencil',
        onSelect: () => openEdit(history)
      }]
    : []),
  ...(history.canDeleteRole
    ? [{
        label: t('applicant_recipient.funding_history.actions.unlink'),
        icon: 'i-lucide-unlink',
        color: 'error' as const,
        onSelect: () => unlink(history)
      }]
    : [])
]]

const hasExternalActions = (history: VisibleFundingHistoryRow): boolean => Boolean(history.canUpdateRole || history.canDeleteRole)
const visibleRows = computed(() => items.value)
</script>

<template>
  <div data-help-target="proponent.funding-history.content" data-help-kind="section" data-help-view="proponent.funding-history" class="w-full min-w-0 max-w-full space-y-4 overflow-hidden" data-field-scope="applicant-recipient.funding-history-tab">
    <div class="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <UIcon name="i-lucide-history" class="mt-0.5 size-5 shrink-0 text-zinc-500" />
      <p class="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {{ t('applicant_recipient.funding_history.description') }}
      </p>
    </div>

    <CommonResourceLayout
      v-model:search="search"
      v-model:pagination="pagination" table-id="applicant-recipient.funding-history"
      help-add-target="proponent.funding-history.add"
      help-search-target="proponent.funding-history.search"
      :data="visibleRows"
      :columns="columns"
      :preference-filters="preferenceFilters"
      :total-records="totalRecords"
      :loading="status === 'pending'"
      :request-status="status"
      :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
      :button-label="t('applicant_recipient.funding_history.actions.add_external')"
      :show-button="canCreateRole"
      :search-placeholder="t('applicant_recipient.funding_history.search')"
      table-class="min-w-[1100px]"
      @add="openCreate"
      @retry="refresh">
      <template #filters>
        <CommonAssignedListViewSelect v-if="canFilterAgreements" v-model="listView" data-field-label-en="List view" data-field-label-fr="Vue de la liste" resource="agreement" data-ui-target="applicant-recipient.funding-history-tab.listView" />
      </template>
      <template #source-cell="{ row }">
        <CommonStatusBadge
          :variant="row.original.source === 'system' ? 'info' : 'meta'"
          :label="t(`applicant_recipient.funding_history.source.${row.original.source}`)" />
      </template>

      <template #agency-cell="{ row }">
        <span v-if="hasSummary(row.original)" class="font-medium text-zinc-800 dark:text-zinc-200">
          {{ localized(row.original.agencyNameEn, row.original.agencyNameFr) }}
        </span>
        <span v-else class="inline-flex items-center gap-2 font-medium text-red-700 dark:text-red-300">
          <UIcon name="i-lucide-lock-keyhole" class="size-4" />
          {{ t('applicant_recipient.funding_history.restricted') }}
        </span>
      </template>

      <template #program-cell="{ row }">
        <span v-if="hasSummary(row.original)" class="font-medium text-zinc-700 dark:text-zinc-300">
          {{ localized(row.original.programNameEn, row.original.programNameFr) }}
        </span>
        <span v-else aria-hidden="true">{{ t('common.none') }}</span>
      </template>

      <template #agreementNumber-cell="{ row }">
        <span v-if="hasSummary(row.original)" class="font-mono text-sm font-semibold">
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
        <span v-else-if="hasSummary(row.original)" class="font-medium">
          {{ localized(row.original.titleEn, row.original.titleFr) }}
        </span>
        <span v-else aria-hidden="true">{{ t('common.none') }}</span>
      </template>

      <template #dates-cell="{ row }">
        <span v-if="hasSummary(row.original)" class="text-sm leading-5 text-zinc-600 dark:text-zinc-400">
          {{ formatDate(row.original.startDate) }}<br>
          {{ formatDate(row.original.endDate) }}
        </span>
        <span v-else aria-hidden="true">{{ t('common.none') }}</span>
      </template>

      <template #amount-cell="{ row }">
        <div v-if="hasSummary(row.original)" class="space-y-1 whitespace-nowrap">
          <div v-for="total in row.original.totals || []" :key="total.currency" class="font-mono text-sm font-semibold">
            {{ formatMoney(total.amount) }}
          </div>
          <span v-if="!row.original.totals?.length">{{ t('common.none') }}</span>
        </div>
        <span v-else aria-hidden="true">{{ t('common.none') }}</span>
      </template>

      <template #actions-cell="{ row }">
        <div v-if="isVisible(row.original)" class="flex justify-end">
          <CommonActionButton
            v-if="row.original.source === 'system' && row.original.agreementId"
            icon="i-lucide-contact"
            color="neutral"
            variant="ghost"
            :aria-label="t('applicant_recipient.funding_history.actions.view_contacts')"
            @click="openContacts(row.original)" />
          <CommonActionButton
            v-if="row.original.source === 'system' && row.original.agreementId"
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            :aria-label="t('common.open')"
            @click="openSystemAgreement(row.original)" />
          <UDropdownMenu v-else-if="row.original.source === 'external' && hasExternalActions(row.original)" :items="menuItems(row.original)">
            <CommonActionButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              :aria-label="t('common.actions')" />
          </UDropdownMenu>
        </div>
      </template>
    </CommonResourceLayout>

    <UModal
      v-model:open="contactsOpen"
      :title="t('applicant_recipient.funding_history.contacts_title')"
      :description="contactAgreement?.label"
      :ui="{ content: 'sm:max-w-2xl', body: 'max-h-[60vh] overflow-y-auto' }">
      <template #body>
        <div v-if="contactsStatus === 'pending'" role="status" :aria-label="t('common.loading')" class="space-y-3">
          <USkeleton v-for="index in 2" :key="index" class="h-16 w-full" />
        </div>
        <CommonErrorNotice v-else-if="contactsError" :title="t('assignments.load_failed')" :description="t('assignments.load_failed_description')">
          <template #actions>
            <UButton :label="t('common.retry')" @click="refreshContacts" />
          </template>
        </CommonErrorNotice>
        <ul v-else-if="contactRoster?.assignments.length" class="divide-y divide-default">
          <li v-for="assignment in contactRoster.assignments" :key="assignment.user_id" class="space-y-1 py-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{{ assignment.name }}</span>
              <UBadge v-if="assignment.is_primary" color="primary" variant="subtle">
                {{ t('assignments.primary') }}
              </UBadge>
              <UBadge v-if="assignment.is_inactive" color="neutral" variant="subtle">
                {{ t('assignments.inactive') }}
              </UBadge>
            </div>
            <ULink :to="`mailto:${assignment.email}`" class="break-all text-sm">{{ assignment.email }}</ULink>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">
          {{ t('assignments.empty') }}
        </p>
      </template>
      <template #footer>
        <UButton :label="t('common.close')" color="neutral" variant="outline" @click="contactsOpen = false" />
      </template>
    </UModal>

    <ApplicantRecipientFundingHistoryWizardModal
      v-model:open="isWizardOpen"
      :applicant-recipient-id="applicantRecipientId"
      :applicant-recipient-label="applicantRecipientLabel"
      :history="selectedHistory"
      :can-create="canCreate"
      :can-create-role="canCreateRole"
      :can-update="selectedAcceptedHistory?.canUpdate === true"
      :can-update-role="selectedAcceptedHistory?.canUpdateRole === true"
      @saved="refresh" />
  </div>
</template>

<style scoped>
:deep(table) {
  width: 100%;
  table-layout: fixed;
}

:deep(th) {
  overflow-wrap: normal;
  word-break: normal;
  white-space: normal;
}

:deep(td) {
  overflow-wrap: anywhere;
  white-space: normal;
}

:deep(th:nth-child(1)) { width: 11%; }
:deep(th:nth-child(2)) { width: 12%; }
:deep(th:nth-child(3)) { width: 14%; }
:deep(th:nth-child(4)) { width: 12%; }
:deep(th:nth-child(5)) { width: 17%; }
:deep(th:nth-child(6)) { width: 12%; }
:deep(th:nth-child(7)) { width: 11%; }
:deep(th:nth-child(8)) { width: 11%; }
</style>
