<script setup lang="ts">
import { z } from 'zod'
import { FundingCaseIntakeBaseSchema } from '~~/shared/types/schemas'

export interface IntakeForm {
  id?: string
  egcs_fi_applicationid?: string
  egcs_fi_fundingopportunity?: string
  egcs_fi_applicantrecipient?: string
  egcs_fi_application: string
}

const { pending = false } = defineProps<{ pending?: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const state = defineModel<IntakeForm>('state', { required: true })
const emit = defineEmits<{ submit: [] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const applicationJson = z.string().min(1, { error: 'validation.required' }).refine((value) => {
  try {
    const parsed: unknown = JSON.parse(value)
    return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed))
  } catch {
    return false
  }
}, { error: 'validation.invalid_json' })
const schema = FundingCaseIntakeBaseSchema.omit({ egcs_fi_application: true }).extend({
  egcs_fi_application: applicationJson
})
const validate = createValidator(schema)
</script>

<template>
  <UModal v-model:open="open" :title="t(state.id ? 'funding_case_intake.edit' : 'funding_case_intake.create')" :description="t('common.form_dialog_description')" :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <UForm v-if="open" :state="state" :validate="validate" class="space-y-5" @submit="emit('submit')">
        <CommonSection :title="t('funding_case_intake.details')" :grid-cols="1">
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField :label="t('funding_case_intake.opportunity')" name="egcs_fi_fundingopportunity" required>
              <CommonServerLookupSelect v-model="state.egcs_fi_fundingopportunity" fetch-url="/api/funding-case-intakes/lookups/opportunities" selected-values-query-key="ids" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :disabled="Boolean(state.id)" searchable />
            </UFormField>
            <UFormField :label="t('funding_case_intake.proponent')" name="egcs_fi_applicantrecipient" required>
              <CommonServerLookupSelect v-model="state.egcs_fi_applicantrecipient" fetch-url="/api/agreements/lookups/applicant-recipients" selected-values-query-key="ids" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :disabled="Boolean(state.id)" searchable />
            </UFormField>
            <UFormField :label="t('funding_case_intake.application_id')" name="egcs_fi_applicationid" required>
              <UInput v-model="state.egcs_fi_applicationid" :disabled="Boolean(state.id)" inputmode="numeric" class="w-full" />
            </UFormField>
          </div>
          <UFormField :label="t('funding_case_intake.application')" name="egcs_fi_application" class="mt-4" required>
            <CommonTextarea v-model="state.egcs_fi_application" :rows="12" class="font-mono" />
          </UFormField>
          <p class="mt-2 text-sm text-muted">
            {{ t('funding_case_intake.application_help') }}
          </p>
        </CommonSection>
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="t(state.id ? 'common.update' : 'common.add')" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
