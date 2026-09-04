<script setup lang="ts">
import type { ApplicantRecipientOtherNameForm } from '~~/shared/types/applicant-recipient-ui'
import { ApplicantRecipientOtherNameCreateSchema } from '~~/shared/types/schemas'
import type { TableColumnInput } from '~/composables/useTableColumns'

const { applicantRecipientId, canCreate, canUpdate, canDelete } = defineProps<{
  applicantRecipientId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()

const { t } = useI18n()

const columns: TableColumnInput<{ id: string } & Record<string, unknown>>[] = [
  { accessorKey: 'egcs_ar_othername', headerKey: 'applicant_recipient.other_names.other_name' },
  { id: 'actions', headerKey: 'common.actions' }
]
</script>

<template>
  <CommonResourceCrud
    class="w-full"
    :title="t('applicant_recipient.other_names.title')"
    icon="i-lucide-badge-info"
    :fetch-url="`/api/applicant-recipients/${applicantRecipientId}/other-names`"
    :post-url="canCreate ? `/api/applicant-recipients/${applicantRecipientId}/other-names` : undefined"
    :update-url-base="canUpdate ? `/api/applicant-recipients/${applicantRecipientId}/other-names` : undefined"
    :delete-url-base="canDelete ? `/api/applicant-recipients/${applicantRecipientId}/other-names` : undefined"
    :schema="ApplicantRecipientOtherNameCreateSchema"
    :columns="columns"
    :button-label="t('common.add')"
    :show-button="canCreate"
    :modal-title="t('applicant_recipient.other_names.add')"
    :update-title="t('applicant_recipient.other_names.edit')"
    :search-placeholder="t('applicant_recipient.other_names.search')">
    <template #form="{ state }">
      <UFormField :label="t('applicant_recipient.other_names.other_name')" name="egcs_ar_othername">
        <UInput
          :model-value="String((state as ApplicantRecipientOtherNameForm).egcs_ar_othername ?? '')"
          @update:model-value="value => (state as ApplicantRecipientOtherNameForm).egcs_ar_othername = value" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
