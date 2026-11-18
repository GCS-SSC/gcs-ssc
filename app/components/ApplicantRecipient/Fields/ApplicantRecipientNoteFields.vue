<script setup lang="ts">
import { provideBilingualFieldScope } from '~/utils/bilingual-field-context'
import type { ApplicantRecipientNoteCreateSchema } from '~~/shared/types/schemas'
import type { z } from 'zod'
import { computed } from 'vue'

const { applicantRecipientId } = defineProps<{ applicantRecipientId: string }>()
const state = defineModel<Partial<z.output<typeof ApplicantRecipientNoteCreateSchema>> & { id?: string }>('state', { required: true })
const { t } = useI18n()
provideBilingualFieldScope(() => ({
  subject: 'applicant_recipient', applicantRecipientId,
  permissionAction: state.value.id ? 'update' : 'create'
}))
const lookupUrl = computed(() => `/api/applicant-recipients/${applicantRecipientId}/notes/lookups/agencies?permission_action=${state.value.id ? 'update' : 'create'}`)
</script>

<template>
  <div class="space-y-4" data-field-scope="applicant-recipient.notes-tab">
    <UFormField v-if="!state.id" :label="t('notes.agency')" name="egcs_ar_agency" required>
      <CommonServerLookupSelect
        :model-value="state.egcs_ar_agency" :fetch-url="lookupUrl"
        value-key="id" label-en-key="egcs_ay_name_en" label-fr-key="egcs_ay_name_fr" searchable
        :placeholder="t('notes.agency_placeholder')" @update:model-value="value => state.egcs_ar_agency = value" />
    </UFormField>
    <p v-else class="text-sm text-muted">
      {{ t('notes.agency_immutable') }}
    </p>
    <fieldset class="space-y-4" data-either-language-pairs="egcs_ar_subject_en egcs_ar_subject_fr" aria-describedby="proponent-note-subject-instruction">
      <legend class="font-medium">
        {{ t('notes.subject') }} <CommonEitherLanguage fields="egcs_ar_subject_en egcs_ar_subject_fr" />
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
    <fieldset class="space-y-4" data-either-language-pairs="egcs_ar_body_en egcs_ar_body_fr" aria-describedby="proponent-note-body-instruction">
      <legend class="font-medium">
        {{ t('notes.body') }} <CommonEitherLanguage fields="egcs_ar_body_en egcs_ar_body_fr" />
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
  </div>
</template>
