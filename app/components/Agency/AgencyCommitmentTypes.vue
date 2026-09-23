<script setup lang="ts">
import { AgencyCommitmentTypeSchema, type AgencyCommitmentTypeItem } from '~~/shared/types/schemas/transfer-payment'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{
  agencyId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()
const { t } = useI18n()
const columns: TableColumnInput<AgencyCommitmentTypeItem>[] = [
  { id: 'name', headerKey: 'common.name' },
  { id: 'actions', headerKey: 'common.actions' }
]
const bilingualColumns: BilingualColumnConfig<AgencyCommitmentTypeItem>[] = [
  { id: 'name', accessorKey: { en: 'egcs_ay_name_en', fr: 'egcs_ay_name_fr' } }
]
</script>

<template>
  <CommonResourceCrud
    :title="t('agency.tabs.commitment_types')"
    icon="i-lucide-tags"
    :fetch-url="`/api/agency/${agencyId}/commitment-types`"
    :post-url="canCreate ? `/api/agency/${agencyId}/commitment-types` : undefined"
    :update-url-base="canUpdate ? `/api/agency/${agencyId}/commitment-types` : undefined"
    :delete-url-base="canDelete ? `/api/agency/${agencyId}/commitment-types` : undefined"
    :can-create="canCreate"
    :can-update="canUpdate"
    :can-delete="canDelete"
    :schema="AgencyCommitmentTypeSchema"
    :initial-new-item="{}"
    :columns="columns"
    :bilingual-columns="bilingualColumns">
    <template #name-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_ay_name_en" :name-fr="row.original.egcs_ay_name_fr" />
    </template>
    <template #form="{ state }">
      <UFormField :label="t('agency.name_en')" name="egcs_ay_name_en" required>
        <UInput v-model="state.egcs_ay_name_en" required />
      </UFormField>
      <UFormField :label="t('agency.name_fr')" name="egcs_ay_name_fr" required>
        <UInput v-model="state.egcs_ay_name_fr" required />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
