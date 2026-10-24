<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { useAgreementChildActionPrerequisites } from '~/composables/useAgreementChildActionPrerequisites'
import AgreementProponentLookupField from './AgreementProponentLookupField.vue'
import type { FundingCaseAgreementApplicantRecipientForm } from '~~/shared/types/funding-case-agreement-ui'
import { FundingCaseAgreementApplicantRecipientCreateSchema } from '~~/shared/types/schemas'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'

const { agreementId, canCreate, canUpdate, canDelete, showUpdate = undefined, showDelete = undefined } = defineProps<{
  agreementId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  showUpdate?: boolean
  showDelete?: boolean
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const { getBilingualValue } = useBilingualValue()
const toast = useLocalizedToast()
const { check } = useAgreementChildActionPrerequisites(() => ({ kind: 'agreement', agreementId }))
const confirmDelete = useDeleteConfirm()
let actionGeneration = 0
watch(() => [agreementId, canCreate, canUpdate, canDelete], () => {
  actionGeneration += 1
}, { flush: 'sync' })
onUnmounted(() => {
  actionGeneration += 1
})
const permitted = (action: 'create' | 'update' | 'delete') => action === 'create' ? canCreate : action === 'update' ? canUpdate : canDelete
/**
 * Checks current action prerequisites before opening the editor.
 * @param action Requested editor action.
 * @param _original Original record supplied by the editor.
 * @param current Whether the captured editor context remains current.
 * @returns Whether the editor may open.
 */
const beforeOpen = (action: 'create' | 'update', _original: unknown, current: () => boolean) => {
  const generation = actionGeneration
  const proceed = () => generation === actionGeneration && current() && permitted(action)
  return proceed() ? check(action, 'proponent-relationship', proceed) : Promise.resolve(false)
}
const beforeSave = (_state: unknown, original: unknown, current: () => boolean) => beforeOpen(original ? 'update' : 'create', original, current)
/**
 * Checks current delete prerequisites before and after confirmation.
 * @param _id Record identifier supplied by the table.
 * @param current Whether the captured delete context remains current.
 * @returns Whether deletion may proceed.
 */
const beforeDelete = async (_id: string, current: () => boolean) => {
  const generation = actionGeneration
  const proceed = () => generation === actionGeneration && current() && permitted('delete')
  if (!proceed() || !await check('delete', 'proponent-relationship', proceed)) return false
  if (!await confirmDelete({ description: t('agency.delete_confirm') }) || !proceed()) return false
  return await check('delete', 'proponent-relationship', proceed) && proceed()
}

/**
 * Explains a blocked action before opening its editor or deletion confirmation.
 * @param allowed Whether assignment and lifecycle permit the action.
 * @param proceed The existing CRUD action.
 * @param referenced Whether agreement evidence prevents deletion.
 */
const exerciseAction = (allowed: boolean, proceed: () => unknown, referenced = false) => {
  if (!allowed || referenced) {
    toast.add({
      title: toast.localized('common.warning'),
      description: toast.localized(referenced
        ? 'apiErrors.agreement.applicant_recipient_in_use'
        : 'agreement.applicant_recipients.action_unavailable'),
      color: 'warning'
    })
    return
  }
  proceed()
}

const columns: TableColumnInput<{ id: string } & Record<string, unknown>>[] = [
  { id: 'applicant_recipient_name', accessorKey: 'applicant_recipient_name_en', headerKey: 'agreement.applicant_recipients.applicant_recipient' },
  { id: 'lead_agency_name', accessorKey: 'lead_agency_name_en', headerKey: 'agreement.applicant_recipients.lead_agency' },
  { id: 'subtype', headerKey: 'agreement.applicant_recipients.type' },
  { accessorKey: 'financial_system_id', headerKey: 'agreement.applicant_recipients.financial_id' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<{ id: string } & Record<string, unknown>>[] = [
  {
    id: 'applicant_recipient_name',
    accessorKey: {
      en: 'applicant_recipient_name_en',
      fr: 'applicant_recipient_name_fr'
    },
    headerKey: 'agreement.applicant_recipients.applicant_recipient'
  },
  {
    id: 'lead_agency_name',
    accessorKey: {
      en: 'lead_agency_name_en',
      fr: 'lead_agency_name_fr'
    },
    headerKey: 'agreement.applicant_recipients.lead_agency'
  }
]

/**
 * Builds the permission-scoped lookup URL while retaining the edited relationship's current option.
 *
 * @param state Current relationship form state.
 * @returns Lookup URL for the create or update session.
 */
const getApplicantRecipientLookupUrl = (state: FundingCaseAgreementApplicantRecipientForm) => {
  const permissionAction = state.id ? 'update' : 'create'
  const relationship = state.id ? `&relationship_id=${encodeURIComponent(state.id)}` : ''
  return `/api/agreements/${agreementId}/applicant-recipients/lookups/applicant-recipients?permission_action=${permissionAction}${relationship}`
}
</script>

<template>
  <CommonResourceCrud
    class="w-full"
    :title="t('agreement.applicant_recipients.title')"
    icon="i-lucide-users-round"
    :fetch-url="`/api/agreements/${agreementId}/applicant-recipients`"
    :post-url="canCreate ? `/api/agreements/${agreementId}/applicant-recipients` : undefined"
    :update-url-base="canUpdate ? `/api/agreements/${agreementId}/applicant-recipients` : undefined"
    :delete-url-base="canDelete ? `/api/agreements/${agreementId}/applicant-recipients` : undefined"
    :can-create="canCreate"
    :can-update="canUpdate"
    :can-delete="canDelete"
    :before-open="beforeOpen"
    :before-save="beforeSave"
    :before-delete="beforeDelete"
    :schema="FundingCaseAgreementApplicantRecipientCreateSchema"
    :columns="columns"
    :bilingual-columns="bilingualColumns"
    :button-label="t('common.add')"
    :show-button="canCreate"
    :modal-title="t('agreement.applicant_recipients.add')"
    :update-title="t('agreement.applicant_recipients.edit')"
    :search-placeholder="t('agreement.applicant_recipients.search')" data-field-tooltip-context="agreement" data-field-scope="agreement.applicant-recipients-tab" data-scope-label-en="Agreements > Proponents" data-scope-label-fr="Ententes > Promoteurs">
    <template #subtype-cell="{ row }">
      {{ getBilingualValue(row.original, 'subtype_name', t('agreement.applicant_recipients.not_selected')) }}
    </template>
    <template #actions-cell="{ row, openUpdate, deleteItem }">
      <div class="flex items-center justify-end gap-2">
        <CommonActionButton
          v-if="showUpdate ?? canUpdate"
          icon="i-lucide-edit-3"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('common.edit')"
          @click="exerciseAction(canUpdate, () => openUpdate(row.original))" />
        <CommonActionButton
          v-if="showDelete ?? canDelete"
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="t('common.delete')"
          @click="exerciseAction(canDelete, () => deleteItem(row.original.id), row.original.can_delete !== true)" />
        <CommonActionButton
          icon="i-lucide-arrow-right"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="`${t('common.open')}: ${getBilingualValue(row.original, 'applicant_recipient_name')}`"
          :to="localePath(appRouteLocations.proponentEdit(String(row.original.egcs_fc_applicantrecipient)))" />
      </div>
    </template>
    <template #form="{ state }">
      <UFormField :label="t('agreement.applicant_recipients.applicant_recipient')" name="egcs_fc_applicantrecipient">
        <AgreementProponentLookupField
          :key="`${agreementId}:${state.id ?? 'create'}`"
          :state="state as FundingCaseAgreementApplicantRecipientForm"
          :fetch-url="getApplicantRecipientLookupUrl(state as FundingCaseAgreementApplicantRecipientForm)"
          :label="t('agreement.applicant_recipients.applicant_recipient')"
          @update:model-value="value => (state as FundingCaseAgreementApplicantRecipientForm).egcs_fc_applicantrecipient = value" />
      </UFormField>
      <AgreementProponentTypeField
        v-model="(state as FundingCaseAgreementApplicantRecipientForm).egcs_fc_applicantrecipientsubtype"
        data-field-container="Composite editor; its individual field declarations own their identities."
        :proponent-id="(state as FundingCaseAgreementApplicantRecipientForm).egcs_fc_applicantrecipient"
        :agreement-id="agreementId"
        :permission-action="state.id ? 'update' : 'create'" />
      <AgreementFinancialIdField
        :key="`${agreementId}:${state.id ?? 'create'}`"
        v-model="(state as FundingCaseAgreementApplicantRecipientForm).egcs_fc_agencyfinancialid"
        data-field-container="Composite editor; its individual field declarations own their identities."
        :proponent-id="(state as FundingCaseAgreementApplicantRecipientForm).egcs_fc_applicantrecipient"
        :agreement-id="agreementId"
        :relationship-id="state.id"
        :permission-action="state.id ? 'update' : 'create'" />
    </template>
  </CommonResourceCrud>
</template>
