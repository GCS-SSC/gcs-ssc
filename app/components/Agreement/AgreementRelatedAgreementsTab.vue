<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { useAgreementChildActionPrerequisites } from '~/composables/useAgreementChildActionPrerequisites'
import { AgreementRelationshipCreateSchema } from '~~/shared/types/schemas/agreement-relationship'
import type { TableColumnInput, BilingualColumnConfig } from '~/composables/useTableColumns'

const { agreementId, canCreate, canUpdate, canDelete } = defineProps<{
  agreementId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()
const { t } = useI18n()
const { check } = useAgreementChildActionPrerequisites(() => ({ kind: 'agreement', agreementId }))
const confirmDelete = useDeleteConfirm()
let actionGeneration = 0
watch(() => [agreementId, canCreate, canUpdate, canDelete], () => {
  actionGeneration += 1
}, { flush: 'sync' })
onUnmounted(() => {
  actionGeneration += 1
})
const permitted = (action: 'create' | 'update' | 'delete') => action === 'create' ? canCreate : action === 'update' ? canUpdate : canDelete
/**
 * Checks current action prerequisites before opening the editor.
 * @param action Requested editor action.
 * @param _original Original record supplied by the editor.
 * @param current Whether the captured editor context remains current.
 * @returns Whether the editor may open.
 */
const beforeOpen = (action: 'create' | 'update', _original: unknown, current: () => boolean) => {
  const generation = actionGeneration
  const proceed = () => generation === actionGeneration && current() && permitted(action)
  return proceed() ? check(action, 'agreement-relationship', proceed) : Promise.resolve(false)
}
const beforeSave = (_state: unknown, original: unknown, current: () => boolean) => beforeOpen(original ? 'update' : 'create', original, current)
/**
 * Checks current delete prerequisites before and after confirmation.
 * @param _id Record identifier supplied by the table.
 * @param current Whether the captured delete context remains current.
 * @returns Whether deletion may proceed.
 */
const beforeDelete = async (_id: string, current: () => boolean) => {
  const generation = actionGeneration
  const proceed = () => generation === actionGeneration && current() && permitted('delete')
  if (!proceed() || !await check('delete', 'agreement-relationship', proceed)) return false
  if (!await confirmDelete({ description: t('agreement.related_agreements.remove_confirm') }) || !proceed()) return false
  return await check('delete', 'agreement-relationship', proceed) && proceed()
}

type RelatedAgreement = {
  id: string
  egcs_fc_relatedagreement?: string
  egcs_fc_description?: string | null
  egcs_fc_relationshiptype?: string
  egcs_fc_agreementnumber?: string
  egcs_fc_title_en?: string
  egcs_fc_title_fr?: string
  program_name_en?: string
  program_name_fr?: string
  stream_name_en?: string
  stream_name_fr?: string
  relationship_type_name_en?: string
  relationship_type_name_fr?: string
} & Record<string, unknown>

const columns: TableColumnInput<RelatedAgreement>[] = [
  { accessorKey: 'egcs_fc_agreementnumber', headerKey: 'agreement.related_agreements.number' },
  { id: 'program_name', accessorKey: 'program_name_en', headerKey: 'agreement.related_agreements.program' },
  { id: 'stream_name', accessorKey: 'stream_name_en', headerKey: 'agreement.related_agreements.stream' },
  { id: 'egcs_fc_title', accessorKey: 'egcs_fc_title_en', headerKey: 'agreement.related_agreements.agreement_title' },
  { id: 'relationship_type_name', accessorKey: 'relationship_type_name_en', headerKey: 'agreement.related_agreements.relationship_type' },
  { id: 'egcs_fc_description', accessorKey: 'egcs_fc_description', headerKey: 'common.description' },
  { id: 'actions', headerKey: 'common.actions' }
]
const bilingualColumns: BilingualColumnConfig<RelatedAgreement>[] = [
  { id: 'program_name', accessorKey: { en: 'program_name_en', fr: 'program_name_fr' }, headerKey: 'agreement.related_agreements.program' },
  { id: 'stream_name', accessorKey: { en: 'stream_name_en', fr: 'stream_name_fr' }, headerKey: 'agreement.related_agreements.stream' },
  { id: 'egcs_fc_title', accessorKey: { en: 'egcs_fc_title_en', fr: 'egcs_fc_title_fr' }, headerKey: 'agreement.related_agreements.agreement_title' },
  { id: 'relationship_type_name', accessorKey: { en: 'relationship_type_name_en', fr: 'relationship_type_name_fr' }, headerKey: 'agreement.related_agreements.relationship_type' }
]
</script>

<template>
  <CommonResourceCrud
    class="w-full"
    data-field-scope="agreement.related-agreements"
    :title="t('agreement.related_agreements.title')"
    icon="i-lucide-link"
    :fetch-url="`/api/agreements/${agreementId}/related-agreements`"
    :post-url="canCreate ? `/api/agreements/${agreementId}/related-agreements` : undefined"
    :update-url-base="canUpdate ? `/api/agreements/${agreementId}/related-agreements` : undefined"
    :delete-url-base="canDelete ? `/api/agreements/${agreementId}/related-agreements` : undefined"
    :can-create="canCreate"
    :can-update="canUpdate"
    :can-delete="canDelete"
    :before-open="beforeOpen"
    :before-save="beforeSave"
    :before-delete="beforeDelete"
    :show-button="canCreate"
    :schema="AgreementRelationshipCreateSchema"
    :columns="columns"
    :bilingual-columns="bilingualColumns"
    :button-label="t('common.add')"
    :modal-title="t('agreement.related_agreements.add')"
    :update-title="t('agreement.related_agreements.edit')"
    :search-placeholder="t('agreement.related_agreements.search')">
    <template #form="{ state }">
      <div v-if="state.id" class="space-y-1">
        <p class="text-sm font-medium">
          {{ t('agreement.related_agreements.agreement') }}
        </p>
        <p>{{ state.egcs_fc_agreementnumber }}</p>
        <CommonBilingualName :name-en="state.egcs_fc_title_en" :name-fr="state.egcs_fc_title_fr" />
      </div>
      <UFormField v-else :label="t('agreement.related_agreements.agreement')" name="egcs_fc_relatedagreement">
        <CommonServerLookupSelect
          v-model="state.egcs_fc_relatedagreement"
          :fetch-url="`/api/agreements/${agreementId}/related-agreements/lookups/agreements`"
          selected-values-query-key="selected_ids"
          value-key="id"
          label-en-key="label_en"
          label-fr-key="label_fr"
          close-on-select
          searchable />
      </UFormField>
      <UFormField :label="t('agreement.related_agreements.relationship_type')" name="egcs_fc_relationshiptype">
        <CommonServerLookupSelect
          v-model="state.egcs_fc_relationshiptype"
          :fetch-url="`/api/agreements/${agreementId}/related-agreements/lookups/relationship-types`"
          :query="state.id ? { permission_action: 'update' } : { permission_action: 'create' }"
          selected-values-query-key="selected_ids"
          value-key="id"
          label-en-key="label_en"
          label-fr-key="label_fr"
          close-on-select
          searchable />
      </UFormField>
      <UFormField :label="t('common.description')" name="egcs_fc_description">
        <CommonTextarea v-model="state.egcs_fc_description" :rows="2" :maxlength="255" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
