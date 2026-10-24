<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { useAgreementChildActionPrerequisites } from '~/composables/useAgreementChildActionPrerequisites'
import { FundingCaseAgreementNoteCreateSchema } from '~~/shared/types/schemas'
import type { TableColumnInput, BilingualColumnConfig } from '~/composables/useTableColumns'

const { agreementId, canCreate, canUpdate, canDelete } = defineProps<{
  agreementId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()
const { t, locale } = useI18n()
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
  return proceed() ? check(action, 'note', proceed) : Promise.resolve(false)
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
  if (!proceed() || !await check('delete', 'note', proceed)) return false
  if (!await confirmDelete({ description: t('agency.delete_confirm') }) || !proceed()) return false
  return await check('delete', 'note', proceed) && proceed()
}

const { formatDate } = useDateHelpers()
type Note = { id: string, egcs_fc_subject_en?: string, egcs_fc_subject_fr?: string,
  egcs_fc_body_en?: string, egcs_fc_body_fr?: string, egcs_fc_createdat?: string,
  egcs_fc_updatedat?: string, author_name?: string, modified_by_name?: string } & Record<string, unknown>
const columns: TableColumnInput<Note>[] = [
  { id: 'subject', accessorKey: 'egcs_fc_subject_en', headerKey: 'notes.subject' },
  { id: 'body', accessorKey: 'egcs_fc_body_en', headerKey: 'notes.body' },
  { accessorKey: 'author_name', headerKey: 'notes.author' },
  { accessorKey: 'egcs_fc_createdat', headerKey: 'notes.created_at' },
  { accessorKey: 'egcs_fc_updatedat', headerKey: 'notes.modified_at' },
  { id: 'actions', headerKey: 'common.actions' }
]
const bilingualColumns: BilingualColumnConfig<Note>[] = [
  { id: 'subject', accessorKey: { en: 'egcs_fc_subject_en', fr: 'egcs_fc_subject_fr' }, headerKey: 'notes.subject' },
  { id: 'body', accessorKey: { en: 'egcs_fc_body_en', fr: 'egcs_fc_body_fr' }, headerKey: 'notes.body' }
]
</script>

<template>
  <CommonResourceCrud
    class="w-full" :title="t('notes.title')" icon="i-lucide-sticky-note"
    :fetch-url="`/api/agreements/${agreementId}/notes`"
    :post-url="canCreate ? `/api/agreements/${agreementId}/notes` : undefined"
    :update-url-base="canUpdate ? `/api/agreements/${agreementId}/notes` : undefined"
    :delete-url-base="canDelete ? `/api/agreements/${agreementId}/notes` : undefined"
    :can-create="canCreate" :can-update="canUpdate" :can-delete="canDelete"
    :before-open="beforeOpen" :before-save="beforeSave" :before-delete="beforeDelete"
    :show-button="canCreate"
    :schema="FundingCaseAgreementNoteCreateSchema" :columns="columns" :bilingual-columns="bilingualColumns"
    :button-label="t('common.add')" :modal-title="t('notes.add')" :update-title="t('notes.edit')"
    :search-placeholder="t('notes.search')" :modal-ui="{ content: 'sm:max-w-2xl' }" data-field-tooltip-context="agreement" data-field-scope="agreement.notes-tab" data-scope-label-en="Agreements > Notes to file" data-scope-label-fr="Ententes > Notes au dossier">
    <template #subject-cell="{ row }">
      {{ locale === 'fr' ? row.original.egcs_fc_subject_fr || row.original.egcs_fc_subject_en : row.original.egcs_fc_subject_en || row.original.egcs_fc_subject_fr }}
    </template>
    <template #body-cell="{ row }">
      <p class="max-w-lg whitespace-pre-wrap">
        {{ locale === 'fr' ? row.original.egcs_fc_body_fr || row.original.egcs_fc_body_en : row.original.egcs_fc_body_en || row.original.egcs_fc_body_fr }}
      </p>
    </template>
    <template #egcs_fc_createdat-cell="{ row }">
      {{ formatDate(row.original.egcs_fc_createdat) }}
    </template>
    <template #egcs_fc_updatedat-cell="{ row }">
      {{ formatDate(row.original.egcs_fc_updatedat) }}
    </template>
    <template #form="{ state }">
      <fieldset class="space-y-4" aria-describedby="agreement-note-subject-instruction">
        <legend class="font-medium">
          {{ t('notes.subject') }} <span aria-hidden="true" class="text-error">*</span> <span class="text-sm text-muted">({{ t('common.field_required') }})</span>
        </legend>
        <p id="agreement-note-subject-instruction" class="text-sm text-muted">
          {{ t('notes.subject_instruction') }}
        </p>
        <UFormField :label="t('notes.subject_en')" name="egcs_fc_subject_en">
          <UInput v-model="state.egcs_fc_subject_en" aria-describedby="agreement-note-subject-instruction" />
        </UFormField>
        <UFormField :label="t('notes.subject_fr')" name="egcs_fc_subject_fr">
          <UInput v-model="state.egcs_fc_subject_fr" aria-describedby="agreement-note-subject-instruction" />
        </UFormField>
      </fieldset>
      <fieldset class="space-y-4" aria-describedby="agreement-note-body-instruction">
        <legend class="font-medium">
          {{ t('notes.body') }} <span aria-hidden="true" class="text-error">*</span> <span class="text-sm text-muted">({{ t('common.field_required') }})</span>
        </legend>
        <p id="agreement-note-body-instruction" class="text-sm text-muted">
          {{ t('notes.body_instruction') }}
        </p>
        <UFormField :label="t('notes.body_en')" name="egcs_fc_body_en">
          <UTextarea v-model="state.egcs_fc_body_en" aria-describedby="agreement-note-body-instruction" />
        </UFormField>
        <UFormField :label="t('notes.body_fr')" name="egcs_fc_body_fr">
          <UTextarea v-model="state.egcs_fc_body_fr" aria-describedby="agreement-note-body-instruction" />
        </UFormField>
      </fieldset>
    </template>
  </CommonResourceCrud>
</template>
