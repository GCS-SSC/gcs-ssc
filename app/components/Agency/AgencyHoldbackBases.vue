<script setup lang="ts">
import { AgencyHoldbackBasisSchema, type AgencyHoldbackBasisItem } from '~~/shared/types/schemas'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{ agencyId: string, canCreate: boolean, canUpdate: boolean, canDelete: boolean }>()
const { t } = useI18n()

const columns: TableColumnInput<AgencyHoldbackBasisItem>[] = [
  { accessorKey: 'egcs_ay_languageindependentcode', headerKey: 'agency.holdback_basis_code' },
  { id: 'name', headerKey: 'common.name' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<AgencyHoldbackBasisItem>[] = [
  { id: 'name', accessorKey: { en: 'egcs_ay_name_en', fr: 'egcs_ay_name_fr' } }
]
</script>

<template>
  <CommonResourceCrud
    :title="t('agency.tabs.holdback_bases')"
    icon="i-lucide-percent"
    :fetch-url="`/api/agency/${agencyId}/holdback-bases`"
    :post-url="canCreate ? `/api/agency/${agencyId}/holdback-bases` : undefined"
    :update-url-base="canUpdate ? '/api/agency/holdback-bases' : undefined"
    :delete-url-base="canDelete ? '/api/agency/holdback-bases' : undefined"
    :can-create="canCreate"
    :can-update="canUpdate"
    :can-delete="canDelete"
    :schema="AgencyHoldbackBasisSchema"
    :initial-new-item="{}"
    :columns="columns"
    :bilingual-columns="bilingualColumns">
    <template #name-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_ay_name_en" :name-fr="row.original.egcs_ay_name_fr" />
    </template>

    <template #form="{ state }">
      <UFormField :label="t('agency.holdback_basis_code')" name="egcs_ay_languageindependentcode">
        <UInput v-model="state.egcs_ay_languageindependentcode" />
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
