<script setup lang="ts">
import type { ApplicantRecipientRegistryForm, ApplicantRecipientRegistryRow } from '~~/shared/types/applicant-recipient-ui'
import { ApplicantRecipientRegistryCreateSchema } from '~~/shared/types/schemas'
import type { TableColumnInput } from '~/composables/useTableColumns'

const { applicantRecipientId, canCreate, canUpdate, canDelete } = defineProps<{
  applicantRecipientId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()

const { t } = useI18n()

const columns: TableColumnInput<ApplicantRecipientRegistryRow>[] = [
  { accessorKey: 'egcs_ar_registry', headerKey: 'applicant_recipient.registries.registry_type' },
  { accessorKey: 'egcs_ar_number', headerKey: 'applicant_recipient.registries.number' },
  { accessorKey: 'egcs_ar_othercomment', headerKey: 'applicant_recipient.registries.other_comment' },
  { id: 'actions', headerKey: 'common.actions' }
]
</script>

<template>
  <CommonResourceCrud
    class="w-full"
    :title="t('applicant_recipient.registries.title')"
    icon="i-lucide-id-card"
    :fetch-url="`/api/applicant-recipients/${applicantRecipientId}/registries`"
    :post-url="canCreate ? `/api/applicant-recipients/${applicantRecipientId}/registries` : undefined"
    :update-url-base="canUpdate ? `/api/applicant-recipients/${applicantRecipientId}/registries` : undefined"
    :delete-url-base="canDelete ? `/api/applicant-recipients/${applicantRecipientId}/registries` : undefined"
    :schema="ApplicantRecipientRegistryCreateSchema"
    :columns="columns"
    :button-label="t('common.add')"
    :show-button="canCreate"
    :modal-title="t('applicant_recipient.registries.add')"
    :update-title="t('applicant_recipient.registries.edit')"
    :search-placeholder="t('applicant_recipient.registries.search')">
    <template #egcs_ar_registry-cell="{ row }">
      {{ t(`enums.registry_type.${row.original.egcs_ar_registry}`) }}
    </template>

    <template #form="{ state }">
      <UFormField :label="t('applicant_recipient.registries.registry_type')" name="egcs_ar_registry">
        <CommonEnumSelect
          v-model="(state as ApplicantRecipientRegistryForm).egcs_ar_registry"
          name="registry_type"
          :placeholder="t('applicant_recipient.registries.registry_type_placeholder')" />
      </UFormField>
      <UFormField :label="t('applicant_recipient.registries.number')" name="egcs_ar_number">
        <UInput
          :model-value="String((state as ApplicantRecipientRegistryForm).egcs_ar_number ?? '')"
          @update:model-value="value => (state as ApplicantRecipientRegistryForm).egcs_ar_number = value" />
      </UFormField>
      <UFormField
        v-if="(state as ApplicantRecipientRegistryForm).egcs_ar_registry === 'other'"
        :label="t('applicant_recipient.registries.other_comment')"
        name="egcs_ar_othercomment">
        <UInput
          :model-value="String((state as ApplicantRecipientRegistryForm).egcs_ar_othercomment ?? '')"
          @update:model-value="value => (state as ApplicantRecipientRegistryForm).egcs_ar_othercomment = value" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
