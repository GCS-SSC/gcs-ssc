<script setup lang="ts">
import { AgencyAgreementTypeSchema, AgencyAgreementTypeInitial, type AgencyAgreementTypeItem } from '~~/shared/types/schemas'
import type { TableColumnInput } from '~/composables/useTableColumns'

const { t } = useI18n()

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{ agencyId: string, canCreate: boolean, canUpdate: boolean, canDelete: boolean }>()

const columns: TableColumnInput<AgencyAgreementTypeItem>[] = [
  { id: 'name', headerKey: 'agency.name_en' },
  { accessorKey: 'egcs_ay_agreementtype', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]

const initialNewItem = { ...AgencyAgreementTypeInitial }
</script>

<template>
  <CommonResourceCrud
    :title="t('agency.tabs.agreement_types')"
    icon="i-lucide-file-text"
    :fetch-url="`/api/agency/${agencyId}/agreement-types`"
    :post-url="canCreate ? `/api/agency/${agencyId}/agreement-types` : undefined"
    :delete-url-base="canDelete ? '/api/agency/agreement-types' : undefined"
    :can-create="canCreate"
    :can-update="canUpdate"
    :can-delete="canDelete"
    :schema="AgencyAgreementTypeSchema"
    :initial-new-item="initialNewItem"
    :columns="columns"
    status-enum-name="agreement_type"
    :status-filter-label="t('common.all_types')">
    <template #name-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_ay_name_en" :name-fr="row.original.egcs_ay_name_fr" />
    </template>

    <template #egcs_ay_agreementtype-cell="{ row }">
      <CommonStatusBadge variant="meta" :label="t(`enums.agreement_type.${row.original.egcs_ay_agreementtype}`)" />
    </template>

    <template #form="{ state }">
      <UFormField :label="t('agency.tabs.agreement_types')" name="egcs_ay_agreementtype">
        <CommonEnumSelect v-model="state.egcs_ay_agreementtype" name="agreement_type" />
      </UFormField>

      <UFormField :label="t('agency.name_en')" name="egcs_ay_name_en">
        <UInput v-model="state.egcs_ay_name_en" />
      </UFormField>
      <UFormField :label="t('agency.name_fr')" name="egcs_ay_name_fr">
        <UInput v-model="state.egcs_ay_name_fr" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
