<script setup lang="ts">
import { useCrudModalPending } from '~/composables/useCrudModal'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
/* eslint-disable jsdoc/require-jsdoc */
import { onBeforeUnmount, computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useExtensionCreateActions } from '~/composables/useExtensionCreateActions'
import { useJsonRequest } from '~/composables/useJsonRequest'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import type {
  FundingCaseAgreementCommitmentForm,
  FundingCaseAgreementCommitmentOverviewRow,
  FundingCaseAgreementCommitmentRow,
  FundingCaseAgreementProfileRow
} from '~~/shared/types/funding-case-agreement-ui'
import { FundingCaseAgreementCommitmentCreateSchema } from '~~/shared/types/schemas'
import { formatMoneyText, type Money } from '~~/shared/utils/money'
import type { Currency_Codes } from '~~/shared/types/database'

type CommitmentTableRow = FundingCaseAgreementCommitmentRow & {
  line_count: number
  total_amount: Money
}

const { agreementId, currency: agreementCurrency, canCreate, canCreateRole = undefined, canUpdate, canDelete } = defineProps<{
  agreementId: string
  currency: Currency_Codes
  canCreate: boolean
  canCreateRole?: boolean
  canUpdate: boolean
  canDelete: boolean
}>()
const agreementIdRef = computed(() => agreementId)
let recordActionGeneration = 0
const pendingRecordActions = ref<Map<string, symbol>>(new Map())
const isOpeningCreate = ref(false)

let disposed = false
onBeforeUnmount(() => {
  disposed = true
})

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
const toast = useLocalizedToast()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { saveJson } = useJsonRequest()
const { isRecordLocked } = useBusinessStatusState()
const {
  appendActions: extensionAppendCreateActions,
  replacementAction: extensionReplacementCreateAction,
  hasReplacement: hasExtensionCreateReplacement,
  labelForAction: extensionCreateLabel,
  error: extensionCreateError,
  refresh: refreshExtensionCreateActions,
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
  createState: () => ({ egcs_fc_currency: agreementCurrency }),
  updateState: commitment => ({
    id: commitment.id,
    egcs_fc_type: commitment.egcs_fc_type,
    egcs_fc_totalamount: commitment.egcs_fc_totalamount,
    egcs_fc_currency: commitment.egcs_fc_currency
  })
})

const selectedCommitment = commitmentModal.selected
const isCommitmentModalOpen = commitmentModal.isOpen
const validateCommitment = createValidator(FundingCaseAgreementCommitmentCreateSchema)
const commitmentPending = useCrudModalPending(commitmentModal.captureSession)
let modalIntent = 0
const isSavingCommitment = commitmentPending.isPending
watch(agreementIdRef, () => {
  recordActionGeneration += 1
  pendingRecordActions.value = new Map()
  isOpeningCreate.value = false
  commitmentModal.close()
}, { flush: 'sync' })
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
      total_amount: commitment.egcs_fc_totalamount
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
      row.egcs_fc_currency,
      row.line_count,
      row.total_amount
    ].some(value => String(value).toLowerCase().includes(normalizedSearch.value))
  }))

const formatMoney = (value: Money, currency: string) => formatMoneyText(value, locale.value, currency)

const warnRecordPrerequisite = () => toast.add({
  title: toast.localized('common.warning'),
  description: toast.localized('agreement.child_records.work_prerequisite'),
  color: 'warning'
})
const loadWorkableRecord = async (recordId: string, action: 'update' | 'delete', isCurrent: () => boolean = () => true): Promise<FundingCaseAgreementCommitmentRow | null> => {
  const owner = agreementId
  const generation = recordActionGeneration
  const current = tableRows.value.find(row => String(row.id) === recordId)
  if (current && !statusCatalog.getById(current.egcs_fc_status)) await statusCatalog.load()
  if (disposed || owner !== agreementId || generation !== recordActionGeneration || !isCurrent()) return null
  if (!current || isRecordLocked(current)) {
    warnRecordPrerequisite()
    return null
  }
  try {
    const [parent, overview, roster] = await Promise.all([
      $fetch<FundingCaseAgreementProfileRow, string>(`/api/agreements/${owner}`),
      $fetch<{ commitments: FundingCaseAgreementCommitmentRow[] }, string>(`/api/agreements/${owner}/commitments-overview`),
      $fetch<{ is_assigned: boolean }, string>(`/api/entity-assignments/fundingcaseagreementcommitment/${recordId}`)
    ])
    if (disposed || owner !== agreementId || generation !== recordActionGeneration || !isCurrent()) return null
    const record = overview.commitments.find(row => String(row.id) === recordId)
    if (!statusCatalog.getById(parent.egcs_fc_status) || (record && !statusCatalog.getById(record.egcs_fc_status))) await statusCatalog.load()
    if (disposed || owner !== agreementId || generation !== recordActionGeneration || !isCurrent()) return null
    const permitted = action === 'update' ? parent.can_update_child_records_role : parent.can_delete_child_records_role
    if (permitted !== true || roster.is_assigned !== true || isRecordLocked(parent) || !record || isRecordLocked(record)) {
      warnRecordPrerequisite()
      return null
    }
    return record
  } catch {
    if (!disposed && owner === agreementId && generation === recordActionGeneration && isCurrent()) warnRecordPrerequisite()
    return null
  }
}
const runRecordAction = async (recordId: string, action: 'update' | 'delete', work: (record: FundingCaseAgreementCommitmentRow) => void | Promise<void>) => {
  if (pendingRecordActions.value.has(recordId)) return
  const intent = action === 'update' ? ++modalIntent : modalIntent
  const session = commitmentModal.captureSession()
  const isCurrent = () => action === 'delete' || (intent === modalIntent && commitmentModal.captureSession() === session)
  const token = Symbol(recordId)
  pendingRecordActions.value = new Map(pendingRecordActions.value).set(recordId, token)
  try {
    const record = await loadWorkableRecord(recordId, action, isCurrent)
    if (record && isCurrent()) await work(record)
  } finally {
    if (pendingRecordActions.value.get(recordId) === token) {
      const remaining = new Map(pendingRecordActions.value)
      remaining.delete(recordId)
      pendingRecordActions.value = remaining
    }
  }
}

const checkCreationPrerequisites = async (isCurrent: () => boolean = () => true): Promise<boolean> => {
  const owner = agreementId
  const generation = recordActionGeneration
  try {
    const parent = await $fetch<FundingCaseAgreementProfileRow, string>(`/api/agreements/${owner}`)
    if (!statusCatalog.getById(parent.egcs_fc_status)) await statusCatalog.load()
    if (disposed || owner !== agreementId || generation !== recordActionGeneration || !isCurrent()) return false
    if (parent.can_create_child_records_role === true && parent.can_create_child_records === true && !isRecordLocked(parent)) return true
  } catch {
    if (disposed || owner !== agreementId || generation !== recordActionGeneration || !isCurrent()) return false
  }
  toast.add({ title: toast.localized('common.warning'), description: toast.localized('agreement.child_records.create_prerequisite'), color: 'warning' })
  return false
}
const openCreateCommitment = async () => {
  if (isOpeningCreate.value) return
  const intent = ++modalIntent
  const session = commitmentModal.captureSession()
  const isCurrent = () => intent === modalIntent && commitmentModal.captureSession() === session
  isOpeningCreate.value = true
  const generation = recordActionGeneration
  try {
    if (!await checkCreationPrerequisites(isCurrent) || !isCurrent()) return
    commitmentModal.openCreate()
  } finally {
    if (generation === recordActionGeneration) isOpeningCreate.value = false
  }
}

const readyExtensionCreateActions = ref<Set<string>>(new Set())
const pendingExtensionCreateAction = ref<string | null>(null)
let extensionCreateGeneration = 0
watch([agreementIdRef, () => canCreate, () => canCreateRole,
  extensionReplacementCreateAction, extensionAppendCreateActions], () => {
  extensionCreateGeneration += 1
  readyExtensionCreateActions.value = new Set()
  pendingExtensionCreateAction.value = null
}, { flush: 'sync' })
const activateExtensionCreateAction = async (value: string) => {
  if (!(canCreateRole ?? canCreate) || pendingExtensionCreateAction.value !== null) return
  const generation = extensionCreateGeneration
  const isCurrent = () => !disposed && generation === extensionCreateGeneration
  pendingExtensionCreateAction.value = value
  try {
    if (!await checkCreationPrerequisites(isCurrent) || !isCurrent()) return
    readyExtensionCreateActions.value = new Set([...readyExtensionCreateActions.value, value])
  } finally {
    if (isCurrent()) pendingExtensionCreateAction.value = null
  }
}

const handleExtensionCreated = async () => {
  await refreshOverview()
  toast.add({
    title: toast.localized('common.success'),
    description: toast.localized('common.added_success'),
    color: 'success'
  })
}

const openUpdateCommitment = (record: FundingCaseAgreementCommitmentRow) => runRecordAction(String(record.id), 'update', freshRecord => {
  commitmentModal.openUpdate(freshRecord)
})

const saveCommitment = async () => {
  if (!selectedCommitment.value) {
    return
  }
  const commitmentState = selectedCommitment.value
  const isUpdate = Boolean(commitmentState.id)
  const session = commitmentModal.captureSession()
  if (!commitmentPending.begin(session)) return

  try {
    if (isUpdate && !await loadWorkableRecord(String(commitmentState.id), 'update',
      () => isCommitmentModalOpen.value && commitmentModal.captureSession() === session)) return
    if (!isUpdate && !await checkCreationPrerequisites(
      () => isCommitmentModalOpen.value && commitmentModal.captureSession() === session)) return
    if (disposed || commitmentModal.captureSession() !== session) return
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
      title: toast.localized('common.success'),
      description: isUpdate ? toast.localized('common.updated_success') : toast.localized('common.added_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    if (!disposed && isCommitmentModalOpen.value && commitmentModal.captureSession() === session) showError(error)
  } finally {
    commitmentPending.end(session)
  }
}

const { confirmDeleteRequest } = useConfirmDeleteRequest()
const confirmDelete = useDeleteConfirm()
const deleteCommitment = (recordId: string) => runRecordAction(recordId, 'delete', async () => {
  const owner = agreementId
  const generation = recordActionGeneration
  const shouldProceed = () => !disposed && owner === agreementId && generation === recordActionGeneration
  try {
    const deleted = await confirmDeleteRequest(`/api/agreements/${owner}/commitments/${recordId}`, {
      shouldProceed,
      confirm: async () => {
        if (!await confirmDelete() || !shouldProceed()) return false
        return Boolean(await loadWorkableRecord(recordId, 'delete')) && shouldProceed()
      }
    })
    if (!deleted || !shouldProceed()) return
    await refreshOverview()
    if (!shouldProceed()) return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if (shouldProceed()) showError(error)
  }
})
</script>

<template>
  <div class="w-full" data-field-tooltip-context="agreement" data-field-scope="agreement.commitments-tab" data-scope-label-en="Agreements > Commitments" data-scope-label-fr="Ententes > Engagements" data-help-view="agreement.commitments" data-help-label-en="Agreements — Commitments" data-help-label-fr="Ententes — Engagements" data-help-target="agreement.commitments.content" data-help-kind="section">
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="tableRows"
      :columns="columns"
      :total-records="tableRows.length"
      :loading="overviewStatus === 'pending'"
      :request-status="overviewStatus"
      :button-label="t('agreement.commitments.add')"
      :show-button="(canCreateRole ?? canCreate) && (!canCreate || (!hasExtensionCreateReplacement && !hasExtensionCreateConflict))"
      :button-disabled="isOpeningCreate"
      :search-placeholder="t('agreement.commitments.search')"
      help-add-target="agreement.commitments.add"
      help-search-target="agreement.commitments.search" @add="openCreateCommitment" @retry="refreshOverview">
      <template #actions>
        <UAlert
          v-if="(canCreateRole ?? canCreate) && extensionCreateError"
          role="alert"
          color="error"
          :title="t('common.load_failed')"
          :actions="[{ label: t('common.retry'), onClick: () => refreshExtensionCreateActions() }]" />
        <div
          v-if="(canCreateRole ?? canCreate) && hasExtensionCreateConflict"
          role="status"
          tabindex="0"
          :aria-label="t('extensions.create_operation_conflict')"
          class="flex max-w-sm items-start gap-2 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
          <UIcon name="i-lucide-alert-triangle" aria-hidden="true" class="mt-0.5 size-4 shrink-0" />
          <span>{{ t('extensions.create_operation_conflict') }}</span>
        </div>
        <template v-if="(canCreateRole ?? canCreate) && extensionReplacementCreateAction && !hasExtensionCreateConflict">
          <ExtensionCreateActionHost
            v-if="canCreate || readyExtensionCreateActions.has(extensionReplacementCreateAction.value)"
            :item="extensionReplacementCreateAction"
            @created="handleExtensionCreated" />
          <UButton
            v-else
            :label="extensionCreateLabel(extensionReplacementCreateAction)"
            :icon="extensionReplacementCreateAction.icon"
            :loading="pendingExtensionCreateAction === extensionReplacementCreateAction.value"
            :disabled="pendingExtensionCreateAction !== null"
            @click="activateExtensionCreateAction(extensionReplacementCreateAction.value)" />
        </template>
        <template v-if="canCreateRole ?? canCreate">
          <template v-for="action in extensionAppendCreateActions" :key="action.value">
            <ExtensionCreateActionHost
              v-if="canCreate || readyExtensionCreateActions.has(action.value)"
              :item="action"
              @created="handleExtensionCreated" />
            <UButton
              v-else
              :label="extensionCreateLabel(action)"
              :icon="action.icon"
              :loading="pendingExtensionCreateAction === action.value"
              :disabled="pendingExtensionCreateAction !== null"
              @click="activateExtensionCreateAction(action.value)" />
          </template>
        </template>
      </template>

      <template #name-cell="{ row }">
        <div class="flex items-center gap-2">
          <ULink
            :to="localePath(appRouteLocations.agreementCommitmentDetail(agreementId, String(row.original.id)))"
            class="font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white">
            {{ getCommitmentTypeLabel(row.original) }}
          </ULink>
          <UBadge v-if="row.original.egcs_fc_active" color="success" variant="subtle">
            {{ t('common.active') }}
          </UBadge>
        </div>
      </template>

      <template #status-cell="{ row }">
        <CommonRecordState
          :status-id="row.original.egcs_fc_status"
          :is-completed="row.original.isCompleted" />
      </template>

      <template #amount-cell="{ row }">
        <span class="font-medium text-zinc-700 dark:text-zinc-200">
          {{ formatMoney(row.original.total_amount, row.original.egcs_fc_currency.toUpperCase()) }}
        </span>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-2">
          <CommonActionButton
            :to="localePath(appRouteLocations.agreementCommitmentDetail(agreementId, String(row.original.id)))"
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('common.open')" />
          <CommonActionButton
            v-if="canUpdate && !row.getIsGrouped?.()"
            icon="i-lucide-pencil"
            :disabled="pendingRecordActions.has(String(row.original.id))"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('common.edit')"
            @click="openUpdateCommitment(row.original)" />
          <CommonActionButton
            v-if="canDelete && !row.getIsGrouped?.()"
            icon="i-lucide-trash"
            :disabled="pendingRecordActions.has(String(row.original.id))"
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
        <UForm :state="selectedCommitment" :validate="validateCommitment" :validate-on="[]" class="space-y-4" data-help-view="agreement.commitments.commitment-dialog" data-help-label-en="Agreements — Commitment editor" data-help-label-fr="Ententes — Éditeur d’engagement" @submit="saveCommitment">
          <UFormField :label="t('agreement.commitments.type')" name="egcs_fc_type">
            <CommonServerLookupSelect
              v-model="selectedCommitment.egcs_fc_type"
              :fetch-url="`/api/agreements/${agreementId}/commitments/lookups/types`"
              selected-values-query-key="selected_ids"
              value-key="id"
              label-en-key="label_en"
              label-fr-key="label_fr"
              :show-value-in-label="false"
              :limit="100"
              :query="selectedCommitment.id
                ? { permission_action: 'update', commitmentId: selectedCommitment.id }
                : { permission_action: 'create' }" />
          </UFormField>
          <UFormField :label="t('common.currency')" name="egcs_fc_currency" required>
            <CommonEnumSelect v-model="selectedCommitment.egcs_fc_currency" name="currency_codes" class="w-full" disabled />
          </UFormField>
          <UFormField :label="t('agreement.commitments.total_amount')" name="egcs_fc_totalamount">
            <CommonCurrencyInput v-model="selectedCommitment.egcs_fc_totalamount" :currency="selectedCommitment.egcs_fc_currency ?? agreementCurrency" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" data-help-target="agreement.commitments.commitment-dialog.cancel" data-help-kind="button" data-help-label-en="Cancel" data-help-label-fr="Annuler" @click="isCommitmentModalOpen = false" />
            <CommonSaveButton
              :label="selectedCommitment.id ? t('common.update') : t('common.add')"
              :loading="isSavingCommitment"
              :disabled="isSavingCommitment" data-help-target="agreement.commitments.commitment-dialog.save" data-help-kind="button" data-help-label-en="Save" data-help-label-fr="Enregistrer" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
