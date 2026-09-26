<script setup lang="ts">
import { FundingOpportunityFormSchema } from '~~/shared/types/schemas'

export interface OpportunityForm {
  id?: string
  program_id?: string
  egcs_fo_transferpaymentstreams: string[]
  egcs_fo_datestart?: string
  egcs_fo_dateend?: string
  egcs_fo_name_en?: string
  egcs_fo_name_fr?: string
  egcs_fo_objective_en?: string
  egcs_fo_objective_fr?: string
  egcs_fo_applicationschema: Record<string, unknown> | null
}

const { pending = false } = defineProps<{ pending?: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const state = defineModel<OpportunityForm>('state', { required: true })
const emit = defineEmits<{ submit: [] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const validate = createValidator(FundingOpportunityFormSchema)
const selectedProgramId = ref<string | undefined>(undefined)

/**
 * Clears selected Streams after a Program change.
 *
 * @param programId - The selected Program id, or undefined when cleared.
 */
const selectProgram = (programId: string | undefined) => {
  if (state.value.id || selectedProgramId.value === programId) return
  selectedProgramId.value = programId
  state.value.egcs_fo_transferpaymentstreams = []
}

watch(() => state.value, next => {
  selectedProgramId.value = next.program_id
}, { immediate: true })
</script>

<template>
  <UModal v-model:open="open" :title="t(state.id ? 'funding_opportunity.edit' : 'funding_opportunity.create')" :description="t('common.form_dialog_description')" :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <UForm v-if="open" :state="state" :validate="validate" class="space-y-5" @submit="emit('submit')">
        <CommonSection :title="t('funding_opportunity.details')" :grid-cols="1">
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField :label="t('funding_opportunity.program')" required>
              <CommonServerLookupSelect :model-value="selectedProgramId" fetch-url="/api/funding-opportunities/lookups/streams" selected-values-query-key="ids" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :query="{ group_by: 'program' }" :disabled="Boolean(state.id)" close-on-select searchable @update:model-value="selectProgram" />
            </UFormField>
            <UFormField :label="t('funding_opportunity.streams')" name="egcs_fo_transferpaymentstreams" required>
              <CommonServerLookupSelect v-if="selectedProgramId" :key="selectedProgramId" v-model:values="state.egcs_fo_transferpaymentstreams" multiple fetch-url="/api/funding-opportunities/lookups/streams" selected-values-query-key="ids" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :query="{ program_id: selectedProgramId }" close-on-select searchable />
              <USelectMenu v-else :items="[]" disabled :placeholder="t('funding_opportunity.select_program_first')" />
            </UFormField>
            <UFormField :label="t('funding_opportunity.name_en')" name="egcs_fo_name_en" required>
              <UInput v-model="state.egcs_fo_name_en" class="w-full" />
            </UFormField>
            <UFormField :label="t('funding_opportunity.name_fr')" name="egcs_fo_name_fr" required>
              <UInput v-model="state.egcs_fo_name_fr" class="w-full" />
            </UFormField>
            <UFormField :label="t('funding_opportunity.start_date')" name="egcs_fo_datestart" required>
              <CommonDatePicker v-model="state.egcs_fo_datestart" />
            </UFormField>
            <UFormField :label="t('funding_opportunity.end_date')" name="egcs_fo_dateend" required>
              <CommonDatePicker v-model="state.egcs_fo_dateend" />
            </UFormField>
            <UFormField :label="t('funding_opportunity.objective_en')" name="egcs_fo_objective_en" required>
              <CommonTextarea v-model="state.egcs_fo_objective_en" :rows="3" />
            </UFormField>
            <UFormField :label="t('funding_opportunity.objective_fr')" name="egcs_fo_objective_fr" required>
              <CommonTextarea v-model="state.egcs_fo_objective_fr" :rows="3" />
            </UFormField>
          </div>
        </CommonSection>
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="t(state.id ? 'common.update' : 'common.add')" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
