<script setup lang="ts">
import { AgencyApprovalBehalfTypeSchema, AgencyApprovalBehalfTypeInitial, type AgencyApprovalBehalfTypeItem } from '~~/shared/types/schemas'
import type { TableColumnInput } from '~/composables/useTableColumns'

const { t } = useI18n()

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{ agencyId: string, canCreate: boolean, canUpdate: boolean, canDelete: boolean }>()

const columns: TableColumnInput<AgencyApprovalBehalfTypeItem>[] = [
  { id: 'name', headerKey: 'agency.name_en' },
  { accessorKey: 'egcs_ay_require_actual', headerKey: 'common.require_details' },
  { id: 'actions', headerKey: 'common.actions' }
]

const initialNewItem = { ...AgencyApprovalBehalfTypeInitial }
</script>

<template>
  <CommonResourceCrud
    :title="t('agency.tabs.approval_behalf')"
    icon="i-lucide-check-square"
    :fetch-url="`/api/agency/${agencyId}/approval-behalf-types`"
    :post-url="canCreate ? `/api/agency/${agencyId}/approval-behalf-types` : undefined"
    :delete-url-base="canDelete ? '/api/agency/approval-behalf-types' : undefined"
    :can-create="canCreate"
    :can-update="canUpdate"
    :can-delete="canDelete"
    :schema="AgencyApprovalBehalfTypeSchema"
    :initial-new-item="initialNewItem"
    :columns="columns">
    <template #name-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_ay_name_en" :name-fr="row.original.egcs_ay_name_fr" />
    </template>

    <template #egcs_ay_require_actual-cell="{ row }">
      <CommonStatusBadge :variant="row.original.egcs_ay_require_actual ? 'yes' : 'no'" />
    </template>

    <template #form="{ state }">
      <UFormField :label="t('agency.name_en')" name="egcs_ay_name_en">
        <UInput v-model="state.egcs_ay_name_en" />
      </UFormField>
      <UFormField :label="t('agency.name_fr')" name="egcs_ay_name_fr">
        <UInput v-model="state.egcs_ay_name_fr" />
      </UFormField>

      <UFormField
        :label="t('common.require_details')"
        name="egcs_ay_require_actual"
        class="flex items-center justify-between">
        <USwitch v-model="state.egcs_ay_require_actual" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
