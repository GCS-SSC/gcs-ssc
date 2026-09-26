<script setup lang="ts">
import { z } from 'zod'
import { AttachmentMetadataBaseSchema, FundingCaseIntakeCreateSchema } from '~~/shared/types/schemas'

export interface IntakeAttachmentDraft {
  key: string
  file: File
  attachmentTypeId?: string
  nameEn: string
  nameFr: string
  descriptionEn: string
  descriptionFr: string
  providerMetadata: Record<string, unknown>
}

export interface IntakeForm {
  egcs_fi_applicationid?: string
  egcs_fi_fundingopportunity?: string
  egcs_fi_applicantrecipient?: string
  attachments: IntakeAttachmentDraft[]
}

const { pending = false } = defineProps<{ pending?: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const state = defineModel<IntakeForm>('state', { required: true })
const emit = defineEmits<{ submit: [] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const schema = FundingCaseIntakeCreateSchema.extend({
  attachments: z.array(AttachmentMetadataBaseSchema)
})
const validate = createValidator(schema)
let nextAttachmentKey = 0

/**
 * Adds selected files as attachment drafts that can be reviewed before saving the Intake.
 *
 * @param event - The file input change event.
 */
const addFiles = (event: Event) => {
  const input = event.target as HTMLInputElement
  for (const file of Array.from(input.files ?? [])) {
    const name = file.name.slice(0, 255)
    state.value.attachments.push({
      key: String(++nextAttachmentKey), file, nameEn: name, nameFr: name,
      descriptionEn: name, descriptionFr: name, providerMetadata: {}
    })
  }
  input.value = ''
}

/**
 * Removes an unsaved attachment draft.
 *
 * @param key - The local attachment draft key.
 */
const removeFile = (key: string) => {
  state.value.attachments = state.value.attachments.filter(draft => draft.key !== key)
}

watch(() => state.value.egcs_fi_fundingopportunity, (next, previous) => {
  if (previous && next !== previous) {
    for (const draft of state.value.attachments) draft.attachmentTypeId = undefined
  }
})
</script>

<template>
  <UModal v-model:open="open" :title="t('funding_case_intake.create')" :description="t('common.form_dialog_description')" :dismissible="!pending" :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <UForm v-if="open" :state="state" :validate="validate" class="space-y-5" @submit="emit('submit')">
        <CommonSection :title="t('funding_case_intake.details')" :grid-cols="1">
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField :label="t('funding_case_intake.opportunity')" name="egcs_fi_fundingopportunity" required>
              <CommonServerLookupSelect v-model="state.egcs_fi_fundingopportunity" fetch-url="/api/funding-case-intakes/lookups/opportunities" selected-values-query-key="ids" value-key="id" label-en-key="label_en" label-fr-key="label_fr" close-on-select searchable />
            </UFormField>
            <UFormField :label="t('funding_case_intake.proponent')" name="egcs_fi_applicantrecipient" required>
              <CommonServerLookupSelect v-model="state.egcs_fi_applicantrecipient" fetch-url="/api/agreements/lookups/applicant-recipients" selected-values-query-key="ids" value-key="id" label-en-key="label_en" label-fr-key="label_fr" close-on-select searchable />
            </UFormField>
            <UFormField :label="t('funding_case_intake.application_id')" name="egcs_fi_applicationid" required>
              <UInput v-model="state.egcs_fi_applicationid" inputmode="numeric" class="w-full" />
            </UFormField>
          </div>
        </CommonSection>
        <CommonSection :title="t('attachments.title')" :grid-cols="1">
          <UFormField :label="t('attachments.upload')" name="files" :required="false">
            <UInput type="file" multiple class="block w-full text-sm" :disabled="pending" @change="addFiles" />
          </UFormField>
          <div v-for="(draft, index) in state.attachments" :key="draft.key" class="mt-4 rounded-md border border-default p-4">
            <div class="mb-4 flex items-center justify-between gap-2">
              <p class="min-w-0 truncate text-sm font-medium">
                {{ draft.file.name }}
              </p>
              <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('common.delete_named', { name: draft.file.name })" :disabled="pending" @click="removeFile(draft.key)" />
            </div>
            <UFormField :label="t('attachments.type')" :name="`attachments.${index}.attachmentTypeId`" required>
              <CommonServerLookupSelect v-if="state.egcs_fi_fundingopportunity" v-model="draft.attachmentTypeId" fetch-url="/api/funding-case-intakes/lookups/attachment-types" selected-values-query-key="ids" value-key="id" label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr" :show-value-in-label="false" :query="{ egcs_fi_fundingopportunity: state.egcs_fi_fundingopportunity }" close-on-select searchable class="w-full" />
              <USelectMenu v-else :items="[]" disabled :placeholder="t('funding_case_intake.select_opportunity_first')" />
            </UFormField>
            <div class="mt-4 grid gap-4 md:grid-cols-2">
              <UFormField :label="t('attachments.name_en')" :name="`attachments.${index}.nameEn`" required>
                <UInput v-model="draft.nameEn" class="w-full" />
              </UFormField>
              <UFormField :label="t('attachments.name_fr')" :name="`attachments.${index}.nameFr`" required>
                <UInput v-model="draft.nameFr" class="w-full" />
              </UFormField>
              <UFormField :label="t('attachments.description_en')" :name="`attachments.${index}.descriptionEn`" required>
                <CommonTextarea v-model="draft.descriptionEn" class="w-full" />
              </UFormField>
              <UFormField :label="t('attachments.description_fr')" :name="`attachments.${index}.descriptionFr`" required>
                <CommonTextarea v-model="draft.descriptionFr" class="w-full" />
              </UFormField>
            </div>
          </div>
        </CommonSection>
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" :disabled="pending" @click="open = false" />
          <CommonSaveButton :label="t('common.add')" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
