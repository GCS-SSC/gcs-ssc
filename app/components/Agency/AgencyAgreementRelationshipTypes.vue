<script setup lang="ts">
import { AgencyAgreementRelationshipTypeSchema, AgencyAgreementRelationshipTypeInitial, type AgencyAgreementRelationshipTypeItem } from '~~/shared/types/schemas'
import type { TableColumnInput } from '~/composables/useTableColumns'

const { t } = useI18n()

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{ agencyId: string, canCreate: boolean, canUpdate: boolean, canDelete: boolean }>()

const columns: TableColumnInput<AgencyAgreementRelationshipTypeItem>[] = [
  { id: 'typename', headerKey: 'agency.tabs.agreement_relationship_types' },
  { id: 'actions', headerKey: 'common.actions' }
]

const initialNewItem = { ...AgencyAgreementRelationshipTypeInitial }
</script>

<template>
  <section data-field-scope="agency.agreement-relationship-types">
    <CommonResourceCrud
      :title="t('agency.tabs.agreement_relationship_types')"
      icon="i-lucide-link"
      :fetch-url="`/api/agency/${agencyId}/agreement-relationship-types`"
      :post-url="canCreate ? `/api/agency/${agencyId}/agreement-relationship-types` : undefined"
      :delete-url-base="canDelete ? '/api/agency/agreement-relationship-types' : undefined"
      :update-url-base="canUpdate ? '/api/agency/agreement-relationship-types' : undefined"
      :can-create="canCreate"
      :can-update="canUpdate"
      :can-delete="canDelete"
      :schema="AgencyAgreementRelationshipTypeSchema"
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
  </section>
</template>
