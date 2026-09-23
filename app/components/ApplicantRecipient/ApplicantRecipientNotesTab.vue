<script setup lang="ts">
import { ApplicantRecipientNoteCreateSchema } from '~~/shared/types/schemas'
import type { TableColumnInput, BilingualColumnConfig } from '~/composables/useTableColumns'

const { applicantRecipientId, canCreate, canUpdate, canDelete } = defineProps<{
  applicantRecipientId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()
const { t, locale } = useI18n()
const { formatDate } = useDateHelpers()
type Note = { id: string, egcs_ar_agency?: string, egcs_ar_subject_en?: string, egcs_ar_subject_fr?: string,
  egcs_ar_body_en?: string, egcs_ar_body_fr?: string, egcs_ar_createdat?: string,
  egcs_ar_updatedat?: string, author_name?: string, modified_by_name?: string } & Record<string, unknown>
const columns: TableColumnInput<Note>[] = [
  { id: 'subject', accessorKey: 'egcs_ar_subject_en', headerKey: 'notes.subject' },
  { id: 'body', accessorKey: 'egcs_ar_body_en', headerKey: 'notes.body' },
  { id: 'agency', accessorKey: 'agency_name_en', headerKey: 'notes.agency' },
  { accessorKey: 'author_name', headerKey: 'notes.author' },
  { accessorKey: 'egcs_ar_createdat', headerKey: 'notes.created_at' },
  { accessorKey: 'egcs_ar_updatedat', headerKey: 'notes.modified_at' },
  { id: 'actions', headerKey: 'common.actions' }
]
const bilingualColumns: BilingualColumnConfig<Note>[] = [
  { id: 'subject', accessorKey: { en: 'egcs_ar_subject_en', fr: 'egcs_ar_subject_fr' }, headerKey: 'notes.subject' },
  { id: 'body', accessorKey: { en: 'egcs_ar_body_en', fr: 'egcs_ar_body_fr' }, headerKey: 'notes.body' },
  { id: 'agency', accessorKey: { en: 'agency_name_en', fr: 'agency_name_fr' }, headerKey: 'notes.agency' }
]
const lookupUrl = (state: Partial<Note>) => `/api/applicant-recipients/${applicantRecipientId}/notes/lookups/agencies?permission_action=${state.id ? 'update' : 'create'}`
</script>

<template>
  <CommonResourceCrud
    class="w-full"
    :title="t('notes.title')"
    icon="i-lucide-sticky-note"
    :fetch-url="`/api/applicant-recipients/${applicantRecipientId}/notes`"
    :post-url="`/api/applicant-recipients/${applicantRecipientId}/notes`"
    :update-url-base="`/api/applicant-recipients/${applicantRecipientId}/notes`"
    :delete-url-base="`/api/applicant-recipients/${applicantRecipientId}/notes`"
    :can-create="canCreate" :can-update="canUpdate" :can-delete="canDelete"
    :schema="ApplicantRecipientNoteCreateSchema"
    :columns="columns" :bilingual-columns="bilingualColumns"
    :button-label="t('common.add')" :modal-title="t('notes.add')" :update-title="t('notes.edit')"
    :search-placeholder="t('notes.search')" :modal-ui="{ content: 'sm:max-w-2xl' }">
    <template #subject-cell="{ row }">
      {{ locale === 'fr' ? row.original.egcs_ar_subject_fr || row.original.egcs_ar_subject_en : row.original.egcs_ar_subject_en || row.original.egcs_ar_subject_fr }}
    </template>
    <template #body-cell="{ row }">
      <p class="max-w-lg whitespace-pre-wrap">
        {{ locale === 'fr' ? row.original.egcs_ar_body_fr || row.original.egcs_ar_body_en : row.original.egcs_ar_body_en || row.original.egcs_ar_body_fr }}
      </p>
    </template>
    <template #agency-cell="{ row }">
      {{ locale === 'fr' ? row.original.agency_name_fr || row.original.agency_name_en : row.original.agency_name_en || row.original.agency_name_fr }}
    </template>
    <template #egcs_ar_createdat-cell="{ row }">
      {{ formatDate(row.original.egcs_ar_createdat) }}
    </template>
    <template #egcs_ar_updatedat-cell="{ row }">
      {{ formatDate(row.original.egcs_ar_updatedat) }}
    </template>
    <template #form="{ state }">
      <UFormField v-if="!state.id" :label="t('notes.agency')" name="egcs_ar_agency" required>
        <CommonServerLookupSelect
          :model-value="state.egcs_ar_agency" :fetch-url="lookupUrl(state)"
          value-key="id" label-en-key="egcs_ay_name_en" label-fr-key="egcs_ay_name_fr" searchable
          :placeholder="t('notes.agency_placeholder')" @update:model-value="value => state.egcs_ar_agency = value" />
      </UFormField>
      <p v-else class="text-sm text-muted">
        {{ t('notes.agency_immutable') }}
      </p>
      <fieldset class="space-y-4" aria-describedby="proponent-note-subject-instruction">
        <legend class="font-medium">
          {{ t('notes.subject') }} <span aria-hidden="true" class="text-error">*</span> <span class="text-sm text-muted">({{ t('common.field_required') }})</span>
        </legend>
        <p id="proponent-note-subject-instruction" class="text-sm text-muted">
          {{ t('notes.subject_instruction') }}
        </p>
        <UFormField :label="t('notes.subject_en')" name="egcs_ar_subject_en">
          <UInput v-model="state.egcs_ar_subject_en" aria-describedby="proponent-note-subject-instruction" />
        </UFormField>
        <UFormField :label="t('notes.subject_fr')" name="egcs_ar_subject_fr">
          <UInput v-model="state.egcs_ar_subject_fr" aria-describedby="proponent-note-subject-instruction" />
        </UFormField>
      </fieldset>
      <fieldset class="space-y-4" aria-describedby="proponent-note-body-instruction">
        <legend class="font-medium">
          {{ t('notes.body') }} <span aria-hidden="true" class="text-error">*</span> <span class="text-sm text-muted">({{ t('common.field_required') }})</span>
        </legend>
        <p id="proponent-note-body-instruction" class="text-sm text-muted">
          {{ t('notes.body_instruction') }}
        </p>
        <UFormField :label="t('notes.body_en')" name="egcs_ar_body_en">
          <UTextarea v-model="state.egcs_ar_body_en" aria-describedby="proponent-note-body-instruction" />
        </UFormField>
        <UFormField :label="t('notes.body_fr')" name="egcs_ar_body_fr">
          <UTextarea v-model="state.egcs_ar_body_fr" aria-describedby="proponent-note-body-instruction" />
        </UFormField>
      </fieldset>
    </template>
  </CommonResourceCrud>
</template>
