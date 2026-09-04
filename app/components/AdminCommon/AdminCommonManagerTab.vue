<script setup lang="ts">
import { useAdminCommonManagerTab } from '~/composables/useAdminCommonManagerTab'
import type { z } from 'zod'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { AdminCommonField, AdminCommonGenericItem } from '~~/shared/types/admin-common-ui'
import type { RecommendationDefinition } from '~~/shared/types/schemas/recommendation/recommendation'

const { title, icon, resource, schema, columns, fields, readOnly = false, fetchUrl, postUrl, updateUrlBase, initialNewItem } = defineProps<{
  title: string
  icon: string
  resource: string
  schema: z.ZodTypeAny
  columns: TableColumnInput<AdminCommonGenericItem>[]
  bilingualColumns?: BilingualColumnConfig<AdminCommonGenericItem>[]
  fields: AdminCommonField[]
  readOnly?: boolean
  fetchUrl: string
  postUrl?: string
  updateUrlBase?: string
  initialNewItem?: Partial<AdminCommonGenericItem>
}>()

const emit = defineEmits<{
  (event: 'added' | 'updated' | 'deleted'): void
}>()

const {
  t,
  deletedFilter,
  statusFilterItems,
  toJsonTextareaValue,
  parseJsonTextareaValue,
  toNumberInputValue,
  toDateInputValue,
  getRowStringValue,
  isCanadianAddress,
  updateAddressCountry
} = useAdminCommonManagerTab()

const getOptionalString = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined
const canCreateResource = computed(() => !readOnly)
</script>

<template>
  <CommonResourceCrud
    v-model:status-filter="deletedFilter"
    :data-testid="`${resource}-panel`"
    :title="title"
    :icon="icon"
    :fetch-url="fetchUrl"
    :post-url="canCreateResource ? postUrl : undefined"
    :update-url-base="readOnly ? undefined : updateUrlBase"
    :initial-new-item="initialNewItem"
    :schema="schema"
    :columns="columns"
    :bilingual-columns="bilingualColumns"
    :button-label="canCreateResource ? t('common.add') : undefined"
    :show-button="canCreateResource"
    :modal-title="title"
    :update-title="t('common.update')"
    @added="emit('added')"
    @updated="emit('updated')"
    @deleted="emit('deleted')">
    <template #filters>
      <USelect
        v-model="deletedFilter"
        :items="statusFilterItems"
        :aria-label="t('common.status_filter')"
        value-key="value"
        label-key="label"
        class="min-w-40" />
    </template>

    <template #_deleted-cell="{ row }">
      <CommonStatusBadge :variant="row.original._deleted ? 'deleted' : 'not_deleted'" />
    </template>

    <template #egcs_cn_value-cell="{ row }">
      <span>
        {{ String(row.original.egcs_cn_value ?? '') }}
      </span>
    </template>

    <template #egcs_cn_entitytype-cell="{ row }">
      <CommonEntityTypeBadge
        v-if="typeof row.original.egcs_cn_entitytype === 'string'"
        :type="row.original.egcs_cn_entitytype" />
    </template>

    <template #egcs_cn_scopetype-cell="{ row }">
      <span>
        {{ typeof row.original.egcs_cn_scopetype === 'string' ? t(`enums.scope_type.${row.original.egcs_cn_scopetype}`) : '' }}
      </span>
    </template>

    <template #egcs_cn_reviewtype-cell="{ row }">
      <span>
        {{ typeof row.original.egcs_cn_reviewtype === 'string' ? t(`enums.review_type.${row.original.egcs_cn_reviewtype}`) : '' }}
      </span>
    </template>

    <template
      v-for="column in bilingualColumns || []"
      :key="`${column.id}-cell`"
      #[`${column.id}-cell`]="{ row }">
      <CommonBilingualName
        :name-en="getRowStringValue(row.original, String(column.accessorKey.en))"
        :name-fr="getRowStringValue(row.original, String(column.accessorKey.fr))" />
    </template>

    <template #form="{ state }">
      <template v-for="field in fields" :key="field.key">
        <UFormField v-if="field.type === 'text'" :label="t(field.labelKey)" :name="field.key">
          <UInput
            :model-value="String(state[field.key] ?? '')"
            @update:model-value="value => (state[field.key] = value)" />
        </UFormField>

        <UFormField v-else-if="field.type === 'number'" :label="t(field.labelKey)" :name="field.key">
          <UInput
            type="number"
            :model-value="toNumberInputValue(state[field.key])"
            @update:model-value="value => (state[field.key] = value)" />
        </UFormField>

        <UFormField v-else-if="field.type === 'date'" :label="t(field.labelKey)" :name="field.key">
          <CommonDatePicker
            :model-value="toDateInputValue(state[field.key])"
            @update:model-value="value => (state[field.key] = value)" />
        </UFormField>

        <UFormField v-else-if="field.type === 'textarea'" :label="t(field.labelKey)" :name="field.key">
          <CommonTextarea
            :model-value="String(state[field.key] ?? '')"
            @update:model-value="value => (state[field.key] = value)" />
        </UFormField>

        <template v-else-if="field.type === 'json' && resource === 'recommendation-schemas' && field.key === 'egcs_cn_recommendationschema'">
          <RecommendationSchemaRecommendationDefinitionEditor
            v-if="state[field.key]"
            :model-value="state[field.key] as RecommendationDefinition"
            @update:model-value="value => (state[field.key] = value)" />
          <UButton
            v-else
            icon="i-lucide-list-plus"
            variant="outline"
            :label="t('recommendation_schema.create_form')"
            class="cursor-default"
            @click="state[field.key] = { sections: [] }" />
        </template>

        <UFormField v-else-if="field.type === 'json'" :label="t(field.labelKey)" :name="field.key">
          <CommonTextarea
            :model-value="toJsonTextareaValue(state[field.key])"
            @update:model-value="value => (state[field.key] = parseJsonTextareaValue(value))" />
        </UFormField>

        <UFormField
          v-else-if="field.type === 'boolean'"
          :label="t(field.labelKey)"
          :name="field.key"
          class="flex items-center justify-between">
          <USwitch :model-value="Boolean(state[field.key])" @update:model-value="value => (state[field.key] = value)" />
        </UFormField>

        <UFormField
          v-else-if="field.type === 'enum' && resource === 'addresses' && field.key === 'egcs_cn_addresscountry'"
          :label="t(field.labelKey)"
          :name="field.key">
          <CommonEnumSelect
            :model-value="String(state[field.key] ?? '')"
            :name="field.enumName"
            :items="field.options"
            @update:model-value="value => updateAddressCountry(state, value)" />
        </UFormField>

        <UFormField
          v-else-if="field.type === 'enum' && resource === 'addresses' && field.key === 'egcs_cn_addresssubdivision'"
          :label="t(field.labelKey)"
          :name="field.key">
          <CommonEnumSelect
            v-if="isCanadianAddress(state)"
            :model-value="String(state[field.key] ?? '')"
            :name="field.enumName"
            :items="field.options"
            @update:model-value="value => (state[field.key] = value)" />
          <UInput
            v-else
            :model-value="String(state[field.key] ?? '')"
            @update:model-value="value => (state[field.key] = value)" />
        </UFormField>

        <UFormField v-else-if="field.type === 'enum'" :label="t(field.labelKey)" :name="field.key">
          <CommonEnumSelect
            :model-value="String(state[field.key] ?? '')"
            :name="field.enumName"
            :items="field.options"
            @update:model-value="value => (state[field.key] = value)" />
        </UFormField>

        <AdminCommonLookupField
          v-else-if="field.type === 'lookup' && field.lookup"
          :model-value="getOptionalString(state[field.key])"
          :label="t(field.labelKey)"
          :name="field.key"
          :fetch-url="field.lookup.fetchUrl"
          :value-key="field.lookup.valueKey"
          :label-en-key="field.lookup.labelEnKey"
          :label-fr-key="field.lookup.labelFrKey"
          :deleted="Boolean(field.lookup.deleted)"
          :query="field.lookup.query"
          @update:model-value="value => (state[field.key] = value)" />
      </template>

      <UFormField
        v-if="state.id"
        :label="t('common.deleted')"
        name="_deleted"
        class="flex items-center justify-between">
        <USwitch :model-value="Boolean(state._deleted)" @update:model-value="value => (state._deleted = value)" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
