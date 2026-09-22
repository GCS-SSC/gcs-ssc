<script setup lang="ts">
import { FundingCaseAgreementNoteCreateSchema } from '~~/shared/types/schemas'
import type { TableColumnInput, BilingualColumnConfig } from '~/composables/useTableColumns'

const { agreementId, canCreate, canUpdate, canDelete } = defineProps<{
  agreementId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()
const { t, locale } = useI18n()
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
    :post-url="`/api/agreements/${agreementId}/notes`"
    :update-url-base="`/api/agreements/${agreementId}/notes`"
    :delete-url-base="`/api/agreements/${agreementId}/notes`"
    :can-create="canCreate" :can-update="canUpdate" :can-delete="canDelete"
    :schema="FundingCaseAgreementNoteCreateSchema" :columns="columns" :bilingual-columns="bilingualColumns"
    :button-label="t('common.add')" :modal-title="t('notes.add')" :update-title="t('notes.edit')"
    :search-placeholder="t('notes.search')" :modal-ui="{ content: 'sm:max-w-2xl' }">
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
      <p id="agreement-note-subject-instruction" class="text-sm text-muted">
        {{ t('notes.subject_instruction') }}
      </p>
      <UFormField :label="t('notes.subject_en')" name="egcs_fc_subject_en">
        <UInput v-model="state.egcs_fc_subject_en" aria-describedby="agreement-note-subject-instruction" />
      </UFormField>
      <UFormField :label="t('notes.subject_fr')" name="egcs_fc_subject_fr">
        <UInput v-model="state.egcs_fc_subject_fr" aria-describedby="agreement-note-subject-instruction" />
      </UFormField>
      <p id="agreement-note-body-instruction" class="text-sm text-muted">
        {{ t('notes.body_instruction') }}
      </p>
      <UFormField :label="t('notes.body_en')" name="egcs_fc_body_en">
        <UTextarea v-model="state.egcs_fc_body_en" aria-describedby="agreement-note-body-instruction" />
      </UFormField>
      <UFormField :label="t('notes.body_fr')" name="egcs_fc_body_fr">
        <UTextarea v-model="state.egcs_fc_body_fr" aria-describedby="agreement-note-body-instruction" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
