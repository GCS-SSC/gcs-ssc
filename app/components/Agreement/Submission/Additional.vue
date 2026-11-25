<script setup lang="ts">
import AgreementFieldsCustomField from '~/components/Agreement/Fields/CustomField.vue'
import AgreementFieldsStructuredCustomField from '~/components/Agreement/Fields/StructuredCustomField.vue'
import type { useSubmissionAnswerEditor } from '~/composables/useSubmissionAnswerEditor'
import { customFieldOptionIds } from '~~/shared/types/schemas/agreement-custom-fields'
import type { AgreementCustomFieldPatch, AgreementCustomFieldValues, AssignedAgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'

const { editor, fields, answers, currency, canUpdate, blocked, loading, ready, staleMessage, emptyMessage } = defineProps<{
  editor: ReturnType<typeof useSubmissionAnswerEditor>
  fields: AssignedAgencyCustomFieldDefinition[]
  answers: AgreementCustomFieldValues
  currency?: string
  canUpdate: boolean
  blocked: boolean
  loading: boolean
  ready: boolean
  staleMessage: string
  emptyMessage: string
}>()
const emit = defineEmits<{ reload: [] }>()
const { t, locale } = useI18n()
const {
  draft: additionalInformationDraft,
  canSave: canSaveAdditionalInformation,
  isSaving: isSavingAdditionalInformation,
  isStale: isAdditionalInformationStale,
  formSession: additionalInformationFormSession,
  validate: validateAdditionalInformation,
  setEditing: setAdditionalInformationEditing
} = editor

/**
 * Narrows a field answer for the structured row editor.
 * @param value - Saved or draft field answer.
 * @returns Rows, or an empty editor for an unanswered field.
 */
const structuredAnswer = (value: AgreementCustomFieldPatch[string] | undefined) =>
  value && typeof value === 'object' && 'rows' in value ? value : null

/**
 * Keeps a saved inactive choice available while it is selected in the draft.
 * @param field - Captured field definition.
 * @returns Choices for the current edit.
 */
const editableOptions = (field: AssignedAgencyCustomFieldDefinition) => {
  if (field.egcs_ay_kind !== 'relational') return field.options
  const selectedIds = customFieldOptionIds(additionalInformationDraft.value?.egcs_fc_customfields[field.id])
  return field.options.filter(option => option.egcs_ay_active || selectedIds.includes(option.id))
}
</script>

<template>
  <div class="space-y-4">
    <template v-if="fields.length">
      <div v-if="canUpdate" class="flex justify-end">
        <USwitch
          data-field-exclude="The switch controls inline editing and is not saved with the record."
          :model-value="additionalInformationDraft !== null"
          :label="t('agreement.claims.edit_additional_information')"
          :disabled="blocked || loading || isAdditionalInformationStale"
          @update:model-value="setAdditionalInformationEditing" />
      </div>
      <CommonNotice v-if="isAdditionalInformationStale" tone="warning" :title="t(staleMessage)">
        <template #actions>
          <UButton color="warning" variant="outline" :disabled="blocked" @click="emit('reload')">
            {{ t('agreement.claims.discard_and_reload_answers') }}
          </UButton>
        </template>
      </CommonNotice>
      <UForm
        v-if="additionalInformationDraft"
        v-bind="additionalInformationFormSession"
        :state="additionalInformationDraft"
        :validate="validateAdditionalInformation"
        novalidate
        class="space-y-5"
        data-field-exclude="Agency-defined custom inputs have separate configuration; outside static field help.">
        <p v-if="fields.some(field => field.egcs_tp_required)" class="text-sm text-muted">
          {{ t('agreement.claims.additional_information_draft_hint') }}
        </p>
        <fieldset :disabled="isSavingAdditionalInformation" class="min-w-0 divide-y divide-default">
          <template v-for="field in fields" :key="field.id">
            <AgreementFieldsStructuredCustomField
              v-if="field.egcs_ay_structure"
              :model-value="structuredAnswer(additionalInformationDraft.egcs_fc_customfields[field.id])"
              class="py-4 first:pt-0"
              :field="field"
              :currency="currency"
              :structure="field.egcs_ay_structure"
              :disabled="isSavingAdditionalInformation"
              @update:model-value="additionalInformationDraft.egcs_fc_customfields[field.id] = $event ?? null" />
            <AgreementFieldsCustomField
              v-else
              v-model="additionalInformationDraft.egcs_fc_customfields[field.id]"
              class="py-4 first:pt-0"
              :field="field"
              :currency="currency"
              :options="editableOptions(field)"
              :disabled="isSavingAdditionalInformation" />
          </template>
        </fieldset>
        <div class="flex justify-end">
          <CommonSaveButton :label="t('common.save')" :disabled="!ready || !canSaveAdditionalInformation || blocked" :loading="isSavingAdditionalInformation" />
        </div>
      </UForm>
      <dl v-else class="divide-y divide-default" data-field-exclude="Read-only display of Agency-defined custom fields.">
        <template v-for="field in fields" :key="field.id">
          <div v-if="field.egcs_ay_structure" class="min-w-0 py-4 first:pt-0">
            <dt class="text-sm font-medium text-highlighted">
              {{ locale === 'fr' ? field.egcs_ay_name_fr : field.egcs_ay_name_en }}
            </dt>
            <dd>
              <AgreementFieldsStructuredCustomField
                :field="field"
                :currency="currency"
                :structure="field.egcs_ay_structure"
                :model-value="structuredAnswer(answers[field.id])"
                readonly />
            </dd>
          </div>
          <AgreementFieldsCustomField
            v-else
            class="py-4 first:pt-0"
            :field="field"
            :currency="currency"
            :options="field.options"
            :model-value="answers[field.id]"
            readonly>
            <template #answer="{ label, answer }">
              <dt class="text-sm font-medium text-highlighted">
                {{ label }}
              </dt>
              <dd class="whitespace-pre-wrap text-sm text-default [overflow-wrap:anywhere]">
                {{ answer || t('supplementary_information.no_answer') }}
              </dd>
            </template>
          </AgreementFieldsCustomField>
        </template>
      </dl>
    </template>
    <p v-else class="text-sm text-muted">
      {{ t(emptyMessage) }}
    </p>
  </div>
</template>
