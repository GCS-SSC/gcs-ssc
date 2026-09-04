<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
/* eslint-disable jsdoc/require-jsdoc */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useExtensionCreateActions } from '~/composables/useExtensionCreateActions'
import { useDeleteRequestToast } from '~/composables/useDeleteRequestToast'
import { useJsonRequest } from '~/composables/useJsonRequest'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import type {
  FundingCaseAgreementCommitmentForm,
  FundingCaseAgreementCommitmentOverviewRow,
  FundingCaseAgreementCommitmentRow
} from '~~/shared/types/funding-case-agreement-ui'
import { FundingCaseAgreementCommitmentCreateSchema } from '~~/shared/types/schemas'
import { formatMoneyText, sumMoney, type Money } from '~~/shared/utils/money'

type CommitmentTableRow = FundingCaseAgreementCommitmentRow & {
  line_count: number
  total_amount: Money
}

const { agreementId, canCreate, canUpdate, canDelete } = defineProps<{
  agreementId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()
const agreementIdRef = computed(() => agreementId)

const { t, locale } = useI18n()
const statusCatalog = useStatusCatalog()
void statusCatalog.load()
const getStatusLabel = (statusId: string) => {
  const definition = statusCatalog.getById(statusId)
  return definition ? (locale.value === 'fr' ? definition.nameFr : definition.nameEn) : ''
}
const getCommitmentTypeLabel = (row: FundingCaseAgreementCommitmentRow) =>
  locale.value === 'fr'
    ? row.commitment_type_name_fr ?? row.commitment_type_name_en ?? String(row.egcs_fc_type)
    : row.commitment_type_name_en ?? row.commitment_type_name_fr ?? String(row.egcs_fc_type)
const localePath = useLocalePath()
const toast = useToast()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { saveJson } = useJsonRequest()
const { isRecordLocked } = useBusinessStatusState()
const {
  appendActions: extensionAppendCreateActions,
  replacementAction: extensionReplacementCreateAction,
  hasReplacement: hasExtensionCreateReplacement,
  hasConflict: hasExtensionCreateConflict
} = useExtensionCreateActions({
  operation: 'agreement.commitments.create',
  agreementId: agreementIdRef
})

const search: Ref<string> = ref('')
const pagination: Ref<{ pageIndex: number, pageSize: number }> = ref({
  pageIndex: 0,
  pageSize: 25
})

const commitmentModal = useCrudModal<FundingCaseAgreementCommitmentRow, FundingCaseAgreementCommitmentForm>({
  createState: () => ({}),
  updateState: commitment => ({
    id: commitment.id,
    egcs_fc_type: commitment.egcs_fc_type
  })
})

const selectedCommitment = commitmentModal.selected
const isCommitmentModalOpen = commitmentModal.isOpen
const validateCommitment = createValidator(FundingCaseAgreementCommitmentCreateSchema)
const commitmentPending = useCrudModalPending(commitmentModal.captureSession)
const isSavingCommitment = commitmentPending.isPending
watch(agreementIdRef, () => commitmentModal.close(), { flush: 'sync' })
const useOverviewFetch = useFetch as unknown as (url: Ref<string>) => {
  data: Ref<FundingCaseAgreementCommitmentOverviewRow | null>
  refresh: () => Promise<void>
  status: Ref<'idle' | 'pending' | 'success' | 'error'>
}
const {
  data: overview,
  refresh: refreshOverview,
  status: overviewStatus
} = useOverviewFetch(computed(() => `/api/agreements/${agreementId}/commitments-overview`))

const columns: TableColumnInput<CommitmentTableRow>[] = [
  { id: 'name', accessorKey: 'egcs_fc_type', headerKey: 'agreement.commitments.name' },
  { id: 'status', accessorKey: 'egcs_fc_status', headerKey: 'common.status' },
  { id: 'lineCount', accessorKey: 'line_count', headerKey: 'agreement.commitments.lines' },
  { id: 'amount', accessorKey: 'total_amount', headerKey: 'agreement.commitments.amount' },
  { id: 'actions', headerKey: 'common.actions' }
]

const commitments = computed<FundingCaseAgreementCommitmentOverviewRow['commitments']>(() => overview.value?.commitments ?? [])
const lines = computed<FundingCaseAgreementCommitmentOverviewRow['lines']>(() => overview.value?.lines ?? [])
const normalizedSearch = computed(() => search.value.trim().toLowerCase())

const tableRows = computed<CommitmentTableRow[]>(() => commitments.value
  .map((commitment: FundingCaseAgreementCommitmentRow) => {
    const commitmentLines = lines.value.filter(line => String(line.egcs_fc_commitment) === String(commitment.id))

    return {
      ...commitment,
      line_count: commitmentLines.length,
      total_amount: sumMoney(commitmentLines.map(line => line.egcs_fc_amount))
    }
  })
  .filter((row: CommitmentTableRow) => {
    if (!normalizedSearch.value) {
      return true
    }

    const statusLabel = getStatusLabel(row.egcs_fc_status)
    const typeLabel = getCommitmentTypeLabel(row)

    return [
      typeLabel,
      statusLabel,
      row.line_count,
      row.total_amount
    ].some(value => String(value).toLowerCase().includes(normalizedSearch.value))
  }))

const formatMoney = (value: Money) => formatMoneyText(value, locale.value, 'CAD')

const openCreateCommitment = () => {
  commitmentModal.openCreate()
}

const handleExtensionCreated = async () => {
  await refreshOverview()
  toast.add({
    title: t('common.success'),
    description: t('common.added_success'),
    color: 'success'
  })
}

const openUpdateCommitment = (commitment: FundingCaseAgreementCommitmentRow) => {
  commitmentModal.openUpdate(commitment)
}

const saveCommitment = async () => {
  if (!selectedCommitment.value) {
    return
  }
  const commitmentState = selectedCommitment.value
  const isUpdate = Boolean(commitmentState.id)
  const session = commitmentModal.captureSession()
  if (!commitmentPending.begin(session)) return

  try {
    await saveJson(
      isUpdate
        ? `/api/agreements/${agreementId}/commitments/${commitmentState.id}`
        : `/api/agreements/${agreementId}/commitments`,
      isUpdate ? 'PATCH' : 'POST',
      commitmentState
    )

    if (!commitmentModal.closeSession(session)) return
    await refreshOverview()
    if (overviewStatus.value === 'error') return
    toast.add({
      title: t('common.success'),
      description: isUpdate ? t('common.updated_success') : t('common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    commitmentPending.end(session)
  }
}

const { confirmDeleteWithToast } = useDeleteRequestToast()

const deleteCommitment = async (commitmentId: string) => {
  await confirmDeleteWithToast(`/api/agreements/${agreementId}/commitments/${commitmentId}`, {
    refresh: refreshOverview
  })
}
</script>

<template>
  <div class="w-full">
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="tableRows"
      :columns="columns"
      :total-records="tableRows.length"
      :loading="overviewStatus === 'pending'"
      :request-status="overviewStatus"
      :button-label="t('agreement.commitments.add')"
      :show-button="canCreate && !hasExtensionCreateReplacement && !hasExtensionCreateConflict"
      :search-placeholder="t('agreement.commitments.search')"
      @add="openCreateCommitment"
      @retry="refreshOverview">
      <template #actions>
        <div
          v-if="canCreate && hasExtensionCreateConflict"
          role="status"
          tabindex="0"
          :aria-label="t('extensions.create_operation_conflict')"
          class="flex max-w-sm items-start gap-2 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          <UIcon name="i-lucide-alert-triangle" aria-hidden="true" class="mt-0.5 size-4 shrink-0" />
          <span>{{ t('extensions.create_operation_conflict') }}</span>
        </div>
        <ExtensionCreateActionHost
          v-if="canCreate && extensionReplacementCreateAction && !hasExtensionCreateConflict"
          :item="extensionReplacementCreateAction"
          @created="handleExtensionCreated" />
        <template v-if="canCreate">
          <ExtensionCreateActionHost
            v-for="action in extensionAppendCreateActions"
            :key="action.value"
            :item="action"
            @created="handleExtensionCreated" />
        </template>
      </template>

      <template #name-cell="{ row }">
        <ULink
          :to="localePath(appRouteLocations.agreementCommitmentDetail(agreementId, String(row.original.id)))"
          class="font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white">
          {{ getCommitmentTypeLabel(row.original) }}
        </ULink>
      </template>

      <template #status-cell="{ row }">
        <CommonRecordState
          :status-id="row.original.egcs_fc_status"
          :is-completed="row.original.isCompleted" />
      </template>

      <template #amount-cell="{ row }">
        <span class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatMoney(row.original.total_amount) }}
        </span>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-2">
          <UButton
            :to="localePath(appRouteLocations.agreementCommitmentDetail(agreementId, String(row.original.id)))"
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('common.open')" />
          <UButton
            v-if="canUpdate && !isRecordLocked(row.original)"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('common.edit')"
            @click="openUpdateCommitment(row.original)" />
          <UButton
            v-if="canDelete && !isRecordLocked(row.original)"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('common.delete')"
            @click="deleteCommitment(String(row.original.id))" />
        </div>
      </template>
    </CommonResourceLayoutCard>

    <UModal
      v-if="selectedCommitment"
      v-model:open="isCommitmentModalOpen"
      :title="selectedCommitment.id ? t('agreement.commitments.edit') : t('agreement.commitments.add')"
      :description="t('common.form_dialog_description')">
      <template #body>
        <UForm :state="selectedCommitment" :validate="validateCommitment" :validate-on="[]" class="space-y-4" @submit="saveCommitment">
          <UFormField :label="t('agreement.commitments.type')" name="egcs_fc_type">
            <CommonServerLookupSelect
              v-model="selectedCommitment.egcs_fc_type"
              :fetch-url="`/api/agreements/${agreementId}/commitments/lookups/types`"
              value-key="id"
              label-en-key="label_en"
              label-fr-key="label_fr"
              :show-value-in-label="false"
              :limit="100"
              :query="selectedCommitment.id
                ? { permission_action: 'update', commitmentId: selectedCommitment.id }
                : { permission_action: 'create' }" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isCommitmentModalOpen = false" />
            <CommonSaveButton
              :label="selectedCommitment.id ? t('common.update') : t('common.add')"
              :loading="isSavingCommitment"
              :disabled="isSavingCommitment" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
