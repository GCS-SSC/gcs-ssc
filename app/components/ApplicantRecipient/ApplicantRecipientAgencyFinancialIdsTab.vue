<script setup lang="ts">
import type { ApplicantRecipientAgencyFinancialIdForm } from '~~/shared/types/applicant-recipient-ui'
import { ApplicantRecipientAgencyFinancialIdCreateSchema } from '~~/shared/types/schemas'
import type { TableColumnInput } from '~/composables/useTableColumns'

const { applicantRecipientId, canCreate, canUpdate, canDelete } = defineProps<{
  applicantRecipientId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()

const { t } = useI18n()

const columns: TableColumnInput<{ id: string } & Record<string, unknown>>[] = [
  { accessorKey: 'agency_name_en', headerKey: 'applicant_recipient.agency_financial_ids.agency' },
  { accessorKey: 'egcs_ar_financialsystemid', headerKey: 'applicant_recipient.agency_financial_ids.financial_system_id' },
  { id: 'actions', headerKey: 'common.actions' }
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
  <CommonResourceCrud
    class="w-full"
    :title="t('applicant_recipient.agency_financial_ids.title')"
    icon="i-lucide-landmark"
    :fetch-url="`/api/applicant-recipients/${applicantRecipientId}/agency-financial-ids`"
    :post-url="canCreate ? `/api/applicant-recipients/${applicantRecipientId}/agency-financial-ids` : undefined"
    :update-url-base="canUpdate ? `/api/applicant-recipients/${applicantRecipientId}/agency-financial-ids` : undefined"
    :delete-url-base="canDelete ? `/api/applicant-recipients/${applicantRecipientId}/agency-financial-ids` : undefined"
    :schema="ApplicantRecipientAgencyFinancialIdCreateSchema"
    :columns="columns"
    :button-label="t('common.add')"
    :show-button="canCreate"
    :modal-title="t('applicant_recipient.agency_financial_ids.add')"
    :update-title="t('applicant_recipient.agency_financial_ids.edit')"
    :search-placeholder="t('applicant_recipient.agency_financial_ids.search')">
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
    </template>
  </CommonResourceCrud>
</template>
