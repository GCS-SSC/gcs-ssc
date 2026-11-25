<script setup lang="ts">
import { computed } from 'vue'
import { claimCustomFieldEvidenceAnswers, sameClaimCustomFieldEvidence } from '~/utils/agreement-submission-view'
import { claimCustomFieldSnapshot } from '~~/shared/utils/claim-custom-field-snapshot'
import type { SubmissionEventRow } from '~~/shared/types/agreement-submission'
import CommonInformationSection from '~/components/Common/InformationSection.vue'
import AgreementFieldsCustomField from '~/components/Agreement/Fields/CustomField.vue'
import AgreementFieldsStructuredCustomField from '~/components/Agreement/Fields/StructuredCustomField.vue'
import type { useSubmissionAnswerEditor } from '~/composables/useSubmissionAnswerEditor'
import { SUBMISSION_EDIT_COMMENT_MAX_LENGTH } from '~~/shared/types/schemas/funding-case-agreement'
import { financialCustomFieldSectionKey } from '~~/shared/utils/financial-custom-field-sections'
import { customFieldOptionIds } from '~~/shared/types/schemas/agreement-custom-fields'
import type { AgreementCustomFieldPatch, AgreementCustomFieldValues, AssignedAgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'

const { editor, fields, answers, latestReceived, savedComments = {}, currency, canUpdate, blocked, loading, ready, staleMessage, emptyMessage } = defineProps<{
  editor: ReturnType<typeof useSubmissionAnswerEditor>
  fields: AssignedAgencyCustomFieldDefinition[]
  answers: AgreementCustomFieldValues
  latestReceived?: SubmissionEventRow
  savedComments?: Record<string, string>
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
  commentSections,
  isSaving: isSavingAdditionalInformation,
  isStale: isAdditionalInformationStale,
  formSession: additionalInformationFormSession,
  validate: validateAdditionalInformation,
  setEditing: setAdditionalInformationEditing
} = editor
const fieldSections = computed(() => {
  const groups = new Map<string, AssignedAgencyCustomFieldDefinition[]>()
  for (const field of fields) {
    const key = financialCustomFieldSectionKey(field)
    const group = groups.get(key)
    if (group) group.push(field)
    else groups.set(key, [field])
  }
  return [...groups].sort(([, left], [, right]) =>
    (left[0]?.section?.egcs_tp_displayorder ?? 0) - (right[0]?.section?.egcs_tp_displayorder ?? 0))
})

const receivedAnswers = computed(() => latestReceived ? claimCustomFieldEvidenceAnswers(latestReceived.egcs_fc_payload) ?? {} : undefined)
const previousAnswers = computed(() => {
  if (!latestReceived) return new Map()
  const received = receivedAnswers.value
  const previousFields = latestReceived.egcs_fc_claimcustomfields ?? latestReceived.egcs_fc_forecastcustomfields
    ?? (received ? claimCustomFieldSnapshot(fields, received) : [])
  return new Map(claimCustomFieldSnapshot(fields, answers).flatMap(field => {
    const previous = previousFields.find(item => item.key === field.key)?.value ?? null
    return sameClaimCustomFieldEvidence(
      { key: field.key, displayed: previous, answers: received ?? {} },
      { key: field.key, displayed: field.value, answers }
    )
      ? []
      : [[field.key, previous] as const]
  }))
})

/**
 * Reads the displayed title from a pinned field's section.
 * @param field - First field of the section.
 * @returns The localized section title, if configured.
 */
const sectionTitle = (field?: AssignedAgencyCustomFieldDefinition) =>
  locale.value === 'fr' ? field?.section?.egcs_tp_name_fr : field?.section?.egcs_tp_name_en

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
  <div class="additional-information space-y-4">
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
          <UButton color="warning" :disabled="blocked" @click="emit('reload')">
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
        <CommonInformationSection
          v-for="([sectionId, sectionFields], index) in fieldSections"
          :key="sectionId"
          v-slot="{ headingId }"
          :title="sectionTitle(sectionFields[0])"
          :separated="index > 0">
          <fieldset :aria-labelledby="headingId" :disabled="isSavingAdditionalInformation" class="additional-fields min-w-0">
            <template v-for="field in sectionFields" :key="field.id">
              <AgreementFieldsStructuredCustomField
                v-if="field.egcs_ay_structure"
                :model-value="structuredAnswer(additionalInformationDraft.egcs_fc_customfields[field.id])"
                :field="field"
                :currency="currency"
                :structure="field.egcs_ay_structure"
                :disabled="isSavingAdditionalInformation"
                @update:model-value="additionalInformationDraft.egcs_fc_customfields[field.id] = $event ?? null" />
              <AgreementFieldsCustomField
                v-else
                v-model="additionalInformationDraft.egcs_fc_customfields[field.id]"
                class="additional-scalar"
                :field="field"
                :currency="currency"
                :options="editableOptions(field)"
                :disabled="isSavingAdditionalInformation" />
            </template>
            <UFormField
              v-if="commentSections.has(sectionId)"
              :name="`customFieldComments.${sectionId}`"
              :label="t('submission.edit_comment')"
              required
              class="pt-4">
              <UTextarea
                v-model="additionalInformationDraft.customFieldComments[sectionId]" class="w-full"
                :maxlength="SUBMISSION_EDIT_COMMENT_MAX_LENGTH" required aria-required="true" :disabled="isSavingAdditionalInformation" />
            </UFormField>
            <p v-else-if="savedComments[sectionId]" class="whitespace-pre-wrap break-words pt-4">
              <strong>{{ t('submission.edit_comment') }}</strong>
              {{ savedComments[sectionId] }}
            </p>
          </fieldset>
        </CommonInformationSection>
        <div class="flex justify-end">
          <CommonSaveButton :label="t('common.save')" :disabled="!ready || !canSaveAdditionalInformation || blocked" :loading="isSavingAdditionalInformation" />
        </div>
      </UForm>
      <template v-else>
        <CommonInformationSection
          v-for="([sectionId, sectionFields], index) in fieldSections"
          :key="sectionId"
          :title="sectionTitle(sectionFields[0])"
          :separated="index > 0">
          <dl class="additional-fields" data-field-exclude="Read-only display of Agency-defined custom fields.">
            <template v-for="field in sectionFields" :key="field.id">
              <div v-if="field.egcs_ay_structure" class="min-w-0">
                <dt class="text-highlighted">
                  {{ locale === 'fr' ? field.egcs_ay_name_fr : field.egcs_ay_name_en }}
                </dt>
                <dd>
                  <AgreementFieldsStructuredCustomField
                    :field="field"
                    :currency="currency"
                    :structure="field.egcs_ay_structure"
                    :model-value="structuredAnswer(answers[field.id])"
                    :previous="receivedAnswers ? structuredAnswer(receivedAnswers[field.id]) : undefined"
                    readonly />
                </dd>
              </div>
              <AgreementFieldsCustomField
                v-else
                class="additional-scalar"
                :field="field"
                :currency="currency"
                :options="field.options"
                :model-value="answers[field.id]"
                readonly>
                <template #answer="{ label, answer }">
                  <dt class="text-highlighted">
                    {{ label }}
                  </dt>
                  <dd class="whitespace-pre-wrap text-default [overflow-wrap:anywhere]">
                    <template v-if="previousAnswers.has(field.id)">
                      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <AgreementSubmissionPreviousAnswer :value="previousAnswers.get(field.id)" />
                        <ins class="text-highlighted no-underline">
                          <span class="sr-only">{{ t('submission.after') }} </span>{{ answer || t('supplementary_information.no_answer') }}
                        </ins>
                      </div>
                    </template>
                    <template v-else>
                      {{ answer || t('supplementary_information.no_answer') }}
                    </template>
                  </dd>
                </template>
              </AgreementFieldsCustomField>
            </template>
          </dl>
          <div v-if="savedComments[sectionId]" class="space-y-1">
            <p class="font-bold text-highlighted">
              {{ t('submission.edit_comment') }}
            </p>
            <p class="whitespace-pre-wrap break-words">
              {{ savedComments[sectionId] }}
            </p>
          </div>
        </CommonInformationSection>
      </template>
    </template>
    <CommonInformationSection v-else :empty-message="t(emptyMessage)" />
  </div>
</template>

<style scoped>
.additional-information {
  container-type: inline-size;
}

.additional-fields {
  display: grid;
  gap: 1rem;
}

.additional-fields > :deep(div) {
  min-width: 0;
}

.additional-fields > :deep(div > dd) {
  margin-block-start: 0.25rem;
}

@container (min-width: 32rem) {
  dl.additional-fields > :deep(.additional-scalar),
  fieldset.additional-fields > :deep(.additional-scalar > [data-slot="root"]) {
    display: grid;
    align-items: baseline;
    grid-template-columns: minmax(11rem, 32%) minmax(0, 1fr);
    column-gap: 1rem;
  }

  dl.additional-fields > :deep(.additional-scalar > dd) {
    margin-block-start: 0;
  }
}
</style>
