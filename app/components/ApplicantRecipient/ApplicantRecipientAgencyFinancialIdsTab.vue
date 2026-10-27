<script setup lang="ts">
import type { ApplicantRecipientProfileRow, ApplicantRecipientAgencyFinancialIdForm } from '~~/shared/types/applicant-recipient-ui'
import { ApplicantRecipientAgencyFinancialIdCreateSchema } from '~~/shared/types/schemas'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { onBeforeUnmount, ref, watch, watchEffect } from 'vue'
import type { Ref } from 'vue'

type FinancialIdAgreementUse = {
  id: string | null
  can_read: boolean
  egcs_fc_agreementnumber: string
  egcs_fc_title_en: string | null
  egcs_fc_title_fr: string | null
}
type FinancialIdWarning = {
  operation: 'disable' | 'delete'
  agreements: FinancialIdAgreementUse[]
  resolve: (confirmed: boolean) => void
}

const { applicantRecipientId, canCreateRole = false, canUpdateRole = false, canDeleteRole = false } = defineProps<{
  applicantRecipientId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canCreateRole?: boolean
  canUpdateRole?: boolean
  canDeleteRole?: boolean
}>()

const { t } = useI18n()
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
/** Rechecks the exact Proponent before opening or executing a child mutation.
 * @param action Child operation being activated.
 * @param current Whether the original CRUD session still owns this action.
 * @returns Whether the live assignment permits the operation.
 */
const checkPrerequisite = async (action: 'create' | 'update' | 'delete', current: () => boolean) => {
  const ownerId = applicantRecipientId
  try {
    const profile = await $fetch<Pick<ApplicantRecipientProfileRow, 'can_create_child_records' | 'can_update_child_records' | 'can_delete_child_records'>, string>(`/api/applicant-recipients/${ownerId}`)
    if (!current() || ownerId !== applicantRecipientId) return false
    const allowed = action === 'create' ? profile.can_create_child_records : action === 'update' ? profile.can_update_child_records : profile.can_delete_child_records
    if (allowed) return true
    toast.add({ title: toast.localized('common.warning'), description: toast.localized('workflow.action_prerequisite_unavailable'), color: 'warning' })
  } catch (error: unknown) {
    if (current() && ownerId === applicantRecipientId) showError(error)
  }
  return false
}
const beforeOpen = (action: 'create' | 'update', _original: unknown, current: () => boolean) => checkPrerequisite(action, current)
const { getBilingualValue } = useBilingualValue()
const warning: Ref<FinancialIdWarning | null> = ref(null)
const warningOpen: Ref<boolean> = ref(false)
const confirmationGuard: Ref<(() => boolean) | null> = ref(null)
let usesController: AbortController | null = null
let disposed = false

/** Settles the pending warning without changing any financial ID.
 * @param confirmed Whether the user accepted the warning.
 */
const settleWarning = (confirmed: boolean) => {
  const pending = warning.value
  warning.value = null
  warningOpen.value = false
  confirmationGuard.value = null
  pending?.resolve(confirmed)
}

/** Rejects stale preflight requests and confirmations after the Proponent changes. */
const cancelWarning = () => {
  usesController?.abort()
  usesController = null
  settleWarning(false)
}
watch(() => applicantRecipientId, cancelWarning, { flush: 'sync' })
watchEffect(() => {
  if (confirmationGuard.value && !confirmationGuard.value()) cancelWarning()
})
watch(warningOpen, open => {
  if (!open) settleWarning(false)
})
onBeforeUnmount(() => {
  disposed = true
  cancelWarning()
})

/**
 * Lists retained Agreement uses before disabling or deleting a financial ID.
 * @param id The financial ID row identity.
 * @param operation The action requiring confirmation.
 * @param shouldProceed Whether the original resource and modal session still own the action.
 * @returns Confirmation, or undefined when the usual action needs no usage warning.
 */
const confirmUses = async (id: string, operation: 'disable' | 'delete', shouldProceed: () => boolean): Promise<boolean | undefined> => {
  if (disposed || usesController || warning.value || !shouldProceed()) return false
  const ownerId = applicantRecipientId
  const controller = new AbortController()
  usesController = controller
  confirmationGuard.value = shouldProceed
  let agreements: FinancialIdAgreementUse[]
  try {
    const response = await $fetch<{ items: FinancialIdAgreementUse[] }, string>(
      `/api/applicant-recipients/${ownerId}/agency-financial-ids/${id}/uses`,
      { query: { permission_action: operation === 'delete' ? 'delete' : 'update' }, signal: controller.signal }
    )
    if (disposed || controller.signal.aborted || ownerId !== applicantRecipientId || !shouldProceed()) return false
    agreements = response.items
  } catch (error: unknown) {
    if (usesController === controller) confirmationGuard.value = null
    if (disposed || controller.signal.aborted || ownerId !== applicantRecipientId) return false
    throw error
  } finally {
    if (usesController === controller) usesController = null
  }
  if (agreements.length === 0) {
    confirmationGuard.value = null
    return undefined
  }
  return await new Promise<boolean>(resolve => {
    warning.value = { operation, agreements, resolve }
    warningOpen.value = true
  })
}

/** Confirms only an existing active ID's transition to disabled.
 * @param state Pending financial ID values.
 * @param original The existing row captured when editing began.
 * @param shouldProceed Whether the original modal session still owns the save.
 * @returns Whether saving may continue.
 */
const beforeSave = async (state: Record<string, unknown>, original: Record<string, unknown> | null, shouldProceed: () => boolean) => {
  if (!await checkPrerequisite(original ? 'update' : 'create', shouldProceed)) return false
  if (typeof state.id !== 'string' || original?.egcs_ar_active !== true || state.egcs_ar_active !== false) return true
  return (await confirmUses(state.id, 'disable', shouldProceed)) ?? true
}

/** Adds the usage warning to deletion, retaining normal confirmation for unused IDs.
 * @param id The financial ID row identity.
 * @param shouldProceed Whether the original resource still owns the delete.
 * @returns Confirmation or undefined for the normal delete confirmation.
 */
const beforeDelete = async (id: string, shouldProceed: () => boolean) => {
  if (!await checkPrerequisite('delete', shouldProceed)) return false
  return await confirmUses(id, 'delete', shouldProceed)
}

const columns: TableColumnInput<{ id: string } & Record<string, unknown>>[] = [
  { id: 'agency_name_en', accessorKey: 'agency_name_en', headerKey: 'applicant_recipient.agency_financial_ids.agency' },
  { accessorKey: 'egcs_ar_financialsystemid', headerKey: 'applicant_recipient.agency_financial_ids.financial_system_id' },
  { accessorKey: 'egcs_ar_active', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<{ id: string } & Record<string, unknown>>[] = [
  { id: 'agency_name_en', accessorKey: { en: 'agency_name_en', fr: 'agency_name_fr' } }
]

/**
 * Builds an availability-filtered Agency lookup that can hydrate the existing selection.
 *
 * @param state - Current Agency financial ID form state.
 * @returns Lookup URL for the current create or update form.
 */
const getAgencyLookupUrl = (state: ApplicantRecipientAgencyFinancialIdForm) => {
  const permissionAction = state.id ? 'update' : 'create'
  const selectedId = state.egcs_ar_agency ? `&selected_id=${encodeURIComponent(String(state.egcs_ar_agency))}` : ''
  return `/api/applicant-recipients/${applicantRecipientId}/agency-financial-ids/lookups/agencies?permission_action=${permissionAction}${selectedId}`
}
</script>

<template>
  <section data-help-target="proponent.agency-financial-ids.content" data-help-kind="section" data-help-view="proponent.agency-financial-ids" class="flex w-full min-w-0 flex-col">
    <CommonResourceCrud
      help-search-target="proponent.agency-financial-ids.search" help-save-target="proponent.agency-financial-ids.save" help-add-target="proponent.agency-financial-ids.add"
      class="w-full"
      :title="t('applicant_recipient.agency_financial_ids.title')"
      icon="i-lucide-landmark"
      :fetch-url="`/api/applicant-recipients/${applicantRecipientId}/agency-financial-ids`"
      :post-url="canCreateRole ? `/api/applicant-recipients/${applicantRecipientId}/agency-financial-ids` : undefined"
      :update-url-base="canUpdateRole ? `/api/applicant-recipients/${applicantRecipientId}/agency-financial-ids` : undefined"
      :delete-url-base="canDeleteRole ? `/api/applicant-recipients/${applicantRecipientId}/agency-financial-ids` : undefined"
      :schema="ApplicantRecipientAgencyFinancialIdCreateSchema"
      :initial-new-item="{ egcs_ar_active: true }"
      :before-open="beforeOpen"
      :before-save="beforeSave"
      :before-delete="beforeDelete"
      :columns="columns"
      :bilingual-columns="bilingualColumns"
      :button-label="t('common.add')"
      :show-button="canCreateRole"
      :modal-title="t('applicant_recipient.agency_financial_ids.add')"
      :update-title="t('applicant_recipient.agency_financial_ids.edit')"
      :search-placeholder="t('applicant_recipient.agency_financial_ids.search')" data-field-scope="applicant-recipient.agency-financial-ids-tab">
      <template #egcs_ar_active-cell="{ row }">
        <CommonStatusBadge
          :variant="row.original.egcs_ar_active ? 'active' : 'inactive'"
          :label-key="row.original.egcs_ar_active ? 'common.active' : 'applicant_recipient.agency_financial_ids.disabled'" />
      </template>

      <template #form="{ state }">
        <UFormField :label="t('applicant_recipient.agency_financial_ids.agency')" name="egcs_ar_agency">
          <CommonServerLookupSelect
            :model-value="(state as ApplicantRecipientAgencyFinancialIdForm).egcs_ar_agency"
            :fetch-url="getAgencyLookupUrl(state as ApplicantRecipientAgencyFinancialIdForm)"
            value-key="id"
            label-en-key="egcs_ay_name_en"
            label-fr-key="egcs_ay_name_fr"
            :placeholder="t('applicant_recipient.agency_financial_ids.agency_placeholder')"
            searchable
            @update:model-value="value => (state as ApplicantRecipientAgencyFinancialIdForm).egcs_ar_agency = value as string | undefined" />
        </UFormField>

        <UFormField :label="t('applicant_recipient.agency_financial_ids.financial_system_id')" name="egcs_ar_financialsystemid">
          <UInput
            :model-value="String((state as ApplicantRecipientAgencyFinancialIdForm).egcs_ar_financialsystemid ?? '')"
            type="text"
            @update:model-value="value => (state as ApplicantRecipientAgencyFinancialIdForm).egcs_ar_financialsystemid = value === '' ? undefined : String(value)" />
        </UFormField>

        <UFormField
          :description="t('applicant_recipient.agency_financial_ids.active_help')"
          name="egcs_ar_active">
          <USwitch v-model="(state as ApplicantRecipientAgencyFinancialIdForm).egcs_ar_active" :label="t('common.active')" />
        </UFormField>
      </template>
    </CommonResourceCrud>
  </section>

  <UModal
    v-model:open="warningOpen"
    :title="t(warning?.operation === 'delete' ? 'applicant_recipient.agency_financial_ids.delete_warning_title' : 'applicant_recipient.agency_financial_ids.disable_warning_title')"
    :description="t('applicant_recipient.agency_financial_ids.retained_agreements_notice')"
    :dismissible="false" data-field-scope="applicant-recipient.agency-financial-ids-tab">
    <template #body>
      <p class="mb-3 text-sm">
        {{ t('applicant_recipient.agency_financial_ids.affected_agreements') }}
      </p>
      <ul class="list-disc space-y-2 pl-5">
        <li v-for="(agreement, index) in warning?.agreements ?? []" :key="index">
          <span class="font-medium">{{ agreement.egcs_fc_agreementnumber }}</span>
          <span class="ml-2">{{ getBilingualValue(agreement, 'egcs_fc_title') }}</span>
        </li>
      </ul>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="settleWarning(false)" />
        <UButton
          :label="t(warning?.operation === 'delete' ? 'common.delete' : 'common.update')"
          :color="warning?.operation === 'delete' ? 'error' : 'warning'"
          @click="settleWarning(true)" />
      </div>
    </template>
  </UModal>
</template>
