<script setup lang="ts">
import type { FundingCaseAgreementApplicantRecipientForm } from '~~/shared/types/funding-case-agreement-ui'
import { FundingCaseAgreementApplicantRecipientCreateSchema } from '~~/shared/types/schemas'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'

const { agreementId, canCreate, canUpdate, canDelete } = defineProps<{
  agreementId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()

const { t } = useI18n()

const columns: TableColumnInput<{ id: string } & Record<string, unknown>>[] = [
  { id: 'applicant_recipient_name', accessorKey: 'applicant_recipient_name_en', headerKey: 'agreement.applicant_recipients.applicant_recipient' },
  { id: 'lead_agency_name', accessorKey: 'lead_agency_name_en', headerKey: 'agreement.applicant_recipients.lead_agency' },
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
    :schema="FundingCaseAgreementApplicantRecipientCreateSchema"
    :columns="columns"
    :bilingual-columns="bilingualColumns"
    :button-label="t('common.add')"
    :show-button="canCreate"
    :modal-title="t('agreement.applicant_recipients.add')"
    :update-title="t('agreement.applicant_recipients.edit')"
    :search-placeholder="t('agreement.applicant_recipients.search')">
    <template #form="{ state }">
      <UFormField :label="t('agreement.applicant_recipients.applicant_recipient')" name="egcs_fc_applicantrecipient">
        <CommonServerLookupSelect
          :model-value="(state as FundingCaseAgreementApplicantRecipientForm).egcs_fc_applicantrecipient"
          :fetch-url="getApplicantRecipientLookupUrl(state as FundingCaseAgreementApplicantRecipientForm)"
          value-key="id"
          label-en-key="label_en"
          label-fr-key="label_fr"
          searchable
          :aria-label="t('agreement.applicant_recipients.applicant_recipient')"
          @update:model-value="value => (state as FundingCaseAgreementApplicantRecipientForm).egcs_fc_applicantrecipient = value as string | undefined" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
