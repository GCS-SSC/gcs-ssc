<script setup lang="ts">
import { computed } from 'vue'
import { AgencyAccountReceivableTypeSchema, type AgencyAccountReceivableTypeItem } from '~~/shared/types/schemas/agency'
import type { TableColumnInput } from '~/composables/useTableColumns'

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{
  agencyId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()
const { t } = useI18n()
const columns: TableColumnInput<AgencyAccountReceivableTypeItem>[] = [
  { id: 'name', accessorKey: 'egcs_ay_name_en', headerKey: 'agency.receivable_types.title' },
  { id: 'source', headerKey: 'agency.receivable_types.source' },
  { accessorKey: 'egcs_ay_monitorrequired', headerKey: 'agency.receivable_types.monitor_required' },
  { id: 'actions', headerKey: 'common.actions' }
]
const bilingualColumns = [{ id: 'name', accessorKey: { en: 'egcs_ay_name_en', fr: 'egcs_ay_name_fr' } }]
const sourceOptions = computed(() => [
  { value: 'advance', label: t('account_receivable.source_advances'), description: t('agency.receivable_types.advance_description') },
  { value: 'claim', label: t('account_receivable.source_claims'), description: t('agency.receivable_types.claim_description') }
])
const initialNewItem = {
  egcs_ay_name_en: '', egcs_ay_name_fr: '', egcs_ay_description_en: '', egcs_ay_description_fr: '',
  egcs_ay_monitorrequired: false, egcs_ay_advancepaymentrelated: false, egcs_ay_claimrelated: false
}
/**
 * Stores exactly one source family using the Agency type's two business flags.
 * @param state Active configuration draft.
 * @param value Selected source family, or undefined before a choice.
 */
const selectSource = (state: Partial<AgencyAccountReceivableTypeItem>, value: string | undefined) => {
  if (state.is_in_use) return
  state.egcs_ay_advancepaymentrelated = value === 'advance'
  state.egcs_ay_claimrelated = value === 'claim'
}
</script>

<template>
  <CommonResourceCrud
    :title="t('agency.tabs.account_receivable_types')" icon="i-lucide-tags"
    :fetch-url="`/api/agency/${agencyId}/account-receivable-types`"
    :post-url="canCreate ? `/api/agency/${agencyId}/account-receivable-types` : undefined"
    :update-url-base="canUpdate ? `/api/agency/${agencyId}/account-receivable-types` : undefined"
    :delete-url-base="canDelete ? `/api/agency/${agencyId}/account-receivable-types` : undefined"
    :can-create="canCreate" :can-update="canUpdate" :can-delete="canDelete"
    :schema="AgencyAccountReceivableTypeSchema" :initial-new-item="initialNewItem"
    :columns="columns" :bilingual-columns="bilingualColumns">
    <template #name-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_ay_name_en" :name-fr="row.original.egcs_ay_name_fr" />
    </template>
    <template #source-cell="{ row }">
      {{ t(row.original.egcs_ay_advancepaymentrelated ? 'account_receivable.source_advances' : 'account_receivable.source_claims') }}
    </template>
    <template #egcs_ay_monitorrequired-cell="{ row }">
      {{ t(row.original.egcs_ay_monitorrequired ? 'common.yes' : 'common.no') }}
    </template>
    <template #form="{ state }">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField name="egcs_ay_name_en" :label="t('agency.receivable_types.title_en')" required>
          <UInput v-model="state.egcs_ay_name_en" required class="w-full" />
        </UFormField>
        <UFormField name="egcs_ay_name_fr" :label="t('agency.receivable_types.title_fr')" required>
          <UInput v-model="state.egcs_ay_name_fr" required class="w-full" />
        </UFormField>
        <UFormField name="egcs_ay_description_en" :label="t('agency.receivable_types.description_en')">
          <UTextarea v-model="state.egcs_ay_description_en" class="w-full" />
        </UFormField>
        <UFormField name="egcs_ay_description_fr" :label="t('agency.receivable_types.description_fr')">
          <UTextarea v-model="state.egcs_ay_description_fr" class="w-full" />
        </UFormField>
      </div>
      <UFormField name="egcs_ay_advancepaymentrelated" :label="t('agency.receivable_types.source')" :description="t(state.is_in_use ? 'agency.receivable_types.policy_locked' : 'agency.receivable_types.source_description')" required>
        <template #default="field">
          <URadioGroup
            :model-value="state.egcs_ay_advancepaymentrelated ? 'advance' : state.egcs_ay_claimrelated ? 'claim' : undefined"
            :disabled="Boolean(state.is_in_use)"
            :items="sourceOptions" :aria-label="t('agency.receivable_types.source')" :aria-required="true" :aria-invalid="Boolean(field?.error)" variant="card"
            @update:model-value="value => selectSource(state, value)" />
        </template>
      </UFormField>
      <UFormField name="egcs_ay_monitorrequired" :description="t(state.is_in_use ? 'agency.receivable_types.policy_locked' : 'agency.receivable_types.monitor_description')">
        <UCheckbox v-model="state.egcs_ay_monitorrequired" :disabled="Boolean(state.is_in_use)" :label="t('agency.receivable_types.monitor_required')" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
