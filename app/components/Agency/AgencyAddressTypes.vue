<script setup lang="ts">
import { AgencyAddressTypeSchema, AgencyAddressTypeInitial, type AgencyAddressTypeItem } from '~~/shared/types/schemas'
import type { TableColumnInput } from '~/composables/useTableColumns'

const { t } = useI18n()

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{ agencyId: string, canCreate: boolean, canUpdate: boolean, canDelete: boolean }>()

const columns: TableColumnInput<AgencyAddressTypeItem>[] = [
  { id: 'typename', headerKey: 'agency.tabs.address_types' },
  { id: 'actions', headerKey: 'common.actions' }
]

const initialNewItem = { ...AgencyAddressTypeInitial }
</script>

<template>
  <CommonResourceCrud
    :title="t('agency.tabs.address_types')"
    icon="i-lucide-map-pin"
    :fetch-url="`/api/agency/${agencyId}/address-types`"
    :post-url="canCreate ? `/api/agency/${agencyId}/address-types` : undefined"
    :delete-url-base="canDelete ? '/api/agency/address-types' : undefined"
    :can-create="canCreate"
    :can-update="canUpdate"
    :can-delete="canDelete"
    :schema="AgencyAddressTypeSchema"
    :initial-new-item="initialNewItem"
    :columns="columns">
    <template #typename-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_ay_typename_en" :name-fr="row.original.egcs_ay_typename_fr" />
    </template>

    <template #form="{ state }">
      <UFormField :label="t('agency.name_en')" name="egcs_ay_typename_en">
        <UInput v-model="state.egcs_ay_typename_en" />
      </UFormField>
      <UFormField :label="t('agency.name_fr')" name="egcs_ay_typename_fr">
        <UInput v-model="state.egcs_ay_typename_fr" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
