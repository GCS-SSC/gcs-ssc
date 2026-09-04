<script setup lang="ts">
import { AgencyApplicantRecipientSubtypeSchema, type AgencyApplicantRecipientSubtypeItem } from '~~/shared/types/schemas'
import type { TableColumnInput } from '~/composables/useTableColumns'

const { t } = useI18n()

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{ agencyId: string, canCreate: boolean, canUpdate: boolean, canDelete: boolean }>()

const columns: TableColumnInput<AgencyApplicantRecipientSubtypeItem>[] = [
  { id: 'name', headerKey: 'agency.name_en' },
  { accessorKey: 'egcs_ay_applicantrecipienttype', headerKey: 'agency.tabs.applicant_recipient_subtypes' },
  { id: 'actions', headerKey: 'common.actions' }
]
</script>

<template>
  <CommonResourceCrud
    :title="t('agency.tabs.applicant_recipient_subtypes')"
    icon="i-lucide-users"
    :fetch-url="`/api/agency/${agencyId}/applicant-recipient-subtypes`"
    :post-url="canCreate ? `/api/agency/${agencyId}/applicant-recipient-subtypes` : undefined"
    :delete-url-base="canDelete ? '/api/agency/applicant-recipient-subtypes' : undefined"
    :can-create="canCreate"
    :can-update="canUpdate"
    :can-delete="canDelete"
    :schema="AgencyApplicantRecipientSubtypeSchema"
    :columns="columns"
    status-enum-name="applicant_recipient_type"
    :status-filter-label="t('common.all_subtypes')">
    <template #name-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_ay_name_en" :name-fr="row.original.egcs_ay_name_fr" />
    </template>

    <template #egcs_ay_applicantrecipienttype-cell="{ row }">
      <span class="text-xs font-bold text-zinc-600 dark:text-zinc-400">
        {{ t(`enums.applicant_recipient_type.${row.original.egcs_ay_applicantrecipienttype}`) }}
      </span>
    </template>

    <template #form="{ state }">
      <UFormField :label="t('agency.tabs.applicant_recipient_subtypes')" name="egcs_ay_applicantrecipienttype">
        <CommonEnumSelect v-model="state.egcs_ay_applicantrecipienttype" name="applicant_recipient_type" />
      </UFormField>

      <UFormField :label="t('agency.name_en')" name="egcs_ay_name_en">
        <UInput v-model="state.egcs_ay_name_en" />
      </UFormField>
      <UFormField :label="t('agency.name_fr')" name="egcs_ay_name_fr">
        <UInput v-model="state.egcs_ay_name_fr" />
      </UFormField>

      <UFormField :label="t('agency.name_en') + ' (' + t('common.description') + ')'" name="egcs_ay_description_en">
        <CommonTextarea v-model="state.egcs_ay_description_en" />
      </UFormField>
      <UFormField :label="t('agency.name_fr') + ' (' + t('common.description') + ')'" name="egcs_ay_description_fr">
        <CommonTextarea v-model="state.egcs_ay_description_fr" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
