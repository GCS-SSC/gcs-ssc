<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import type { ResourceCrudAction } from '~/composables/useResourceCrudState'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { AgencyProponentRelationshipTypeSchema, type AgencyProponentRelationshipTypeItem } from '~~/shared/types/schemas'

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{
  agencyId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()

const { t } = useI18n()

const columns: TableColumnInput<AgencyProponentRelationshipTypeItem>[] = [
  { id: 'role', headerKey: 'agency.proponent_relationship_type.role' },
  { id: 'inverse_role', headerKey: 'agency.proponent_relationship_type.inverse_role' },
  { id: 'actions', headerKey: 'common.actions' }
]

const initialNewItem = {
  egcs_ay_inversecode: null,
  egcs_ay_inversename_en: null,
  egcs_ay_inversename_fr: null
}

/**
 * Initializes or clears the reverse role on an unsaved definition.
 * @param state Current modal draft.
 * @param directional Whether to author a distinct reverse role.
 */
const setDirectional = (state: Partial<AgencyProponentRelationshipTypeItem>, directional: boolean) => {
  const inverseValue = directional ? '' : null
  state.egcs_ay_inversecode = inverseValue
  state.egcs_ay_inversename_en = inverseValue
  state.egcs_ay_inversename_fr = inverseValue
}

const action: ResourceCrudAction = {
  kind: 'remote',
  create: useActionContext({ identity: [() => agencyId], authority: () => canCreate }),
  update: useActionContext({ identity: [() => agencyId], authority: () => canUpdate }),
  delete: useActionContext({ identity: [() => agencyId], authority: () => canDelete })
}
</script>

<template>
  <CommonResourceCrud
    table-id="agency.proponent-relationship-types"
    data-field-scope="agency.proponent-relationship-types"
    :action="action"
    :title="t('agency.tabs.proponent_relationship_types')"
    icon="i-lucide-link"
    :fetch-url="`/api/agency/${agencyId}/proponent-relationship-types`"
    :post-url="canCreate ? `/api/agency/${agencyId}/proponent-relationship-types` : undefined"
    :update-url-base="canUpdate ? '/api/agency/proponent-relationship-types' : undefined"
    :delete-url-base="canDelete ? '/api/agency/proponent-relationship-types' : undefined"
    :can-create="canCreate"
    :can-update="canUpdate"
    :can-delete="canDelete"
    :schema="AgencyProponentRelationshipTypeSchema"
    :initial-new-item="initialNewItem"
    :columns="columns"
    :modal-ui="state => state.egcs_ay_inversecode !== null ? { content: 'sm:max-w-4xl' } : undefined">
    <template #role-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_ay_name_en" :name-fr="row.original.egcs_ay_name_fr" />
      <p class="text-muted font-mono text-xs">
        {{ row.original.egcs_ay_code }}
      </p>
    </template>

    <template #inverse_role-cell="{ row }">
      <template v-if="row.original.egcs_ay_inversecode">
        <CommonBilingualName
          :name-en="row.original.egcs_ay_inversename_en ?? ''"
          :name-fr="row.original.egcs_ay_inversename_fr ?? ''" />
        <p class="text-muted font-mono text-xs">
          {{ row.original.egcs_ay_inversecode }}
        </p>
      </template>
      <span v-else>{{ t('agency.proponent_relationship_type.same_role') }}</span>
    </template>

    <template #form="{ state }">
      <UCheckbox
        v-if="!state.id"
        data-field-exclude="Controls which role fields the unsaved form shows"
        :model-value="state.egcs_ay_inversecode !== null"
        :label="t('agency.proponent_relationship_type.directional')"
        :description="t('agency.proponent_relationship_type.directional_description')"
        @update:model-value="value => setDirectional(state, value === true)" />
      <div class="grid gap-4" :class="{ 'md:grid-cols-2': state.egcs_ay_inversecode !== null }">
        <fieldset class="space-y-4">
          <legend class="font-semibold">
            {{ t('agency.proponent_relationship_type.role') }}
          </legend>
          <UFormField
            :label="t('agency.proponent_relationship_type.code')"
            :description="t('agency.proponent_relationship_type.code_description')"
            name="egcs_ay_code">
            <UInput v-model="state.egcs_ay_code" :readonly="Boolean(state.id)" class="w-full" />
          </UFormField>
          <UFormField :label="t('agency.name_en')" name="egcs_ay_name_en">
            <UInput v-model="state.egcs_ay_name_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('agency.name_fr')" name="egcs_ay_name_fr">
            <UInput v-model="state.egcs_ay_name_fr" class="w-full" />
          </UFormField>
        </fieldset>
        <fieldset v-if="state.egcs_ay_inversecode !== null" class="space-y-4">
          <legend class="font-semibold">
            {{ t('agency.proponent_relationship_type.inverse_role') }}
          </legend>
          <UFormField
            :label="t('agency.proponent_relationship_type.code')"
            name="egcs_ay_inversecode"
            :required="!state.id">
            <UInput v-model="state.egcs_ay_inversecode" :readonly="Boolean(state.id)" class="w-full" />
          </UFormField>
          <UFormField :label="t('agency.name_en')" name="egcs_ay_inversename_en" required>
            <UInput
              :model-value="state.egcs_ay_inversename_en ?? undefined"
              class="w-full"
              @update:model-value="state.egcs_ay_inversename_en = $event" />
          </UFormField>
          <UFormField :label="t('agency.name_fr')" name="egcs_ay_inversename_fr" required>
            <UInput
              :model-value="state.egcs_ay_inversename_fr ?? undefined"
              class="w-full"
              @update:model-value="state.egcs_ay_inversename_fr = $event" />
          </UFormField>
        </fieldset>
      </div>
    </template>
  </CommonResourceCrud>
</template>
