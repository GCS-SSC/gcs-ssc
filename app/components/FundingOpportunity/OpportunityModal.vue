<script setup lang="ts">
import { FundingOpportunityCreateSchema } from '~~/shared/types/schemas'

export interface OpportunityForm {
  id?: string
  egcs_fo_transferpaymentstream?: string
  egcs_fo_datestart?: string
  egcs_fo_dateend?: string
  egcs_fo_name_en?: string
  egcs_fo_name_fr?: string
  egcs_fo_objective_en?: string
  egcs_fo_objective_fr?: string
  egcs_fo_applicationschema: Record<string, unknown> | null
  egcs_fo_status: 'draft' | 'open' | 'closed'
  egcs_fo_reviewsetups: string[]
  egcs_fo_workflowsetups: string[]
}

const { pending = false } = defineProps<{ pending?: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const state = defineModel<OpportunityForm>('state', { required: true })
const emit = defineEmits<{ submit: [] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const validate = createValidator(FundingOpportunityCreateSchema)
const setupQuery = computed(() => ({ stream_id: state.value.egcs_fo_transferpaymentstream ?? '' }))
const statusItems = computed(() => [
  { label: t('funding_opportunity.draft'), value: 'draft' },
  { label: t('funding_opportunity.open'), value: 'open' },
  { label: t('funding_opportunity.closed'), value: 'closed' }
])

watch(() => state.value.egcs_fo_transferpaymentstream, (next, previous) => {
  if (previous && next !== previous && !state.value.id) {
    state.value.egcs_fo_reviewsetups = []
    state.value.egcs_fo_workflowsetups = []
  }
})
</script>

<template>
  <UModal v-model:open="open" :title="t(state.id ? 'funding_opportunity.edit' : 'funding_opportunity.create')" :description="t('common.form_dialog_description')" :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <UForm v-if="open" :state="state" :validate="validate" class="space-y-5" @submit="emit('submit')">
        <CommonSection :title="t('funding_opportunity.details')" :grid-cols="1">
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField :label="t('funding_opportunity.stream')" name="egcs_fo_transferpaymentstream">
              <CommonServerLookupSelect v-model="state.egcs_fo_transferpaymentstream" fetch-url="/api/funding-opportunities/lookups/streams" selected-values-query-key="ids" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :disabled="Boolean(state.id)" searchable />
            </UFormField>
            <UFormField :label="t('funding_opportunity.status')" name="egcs_fo_status">
              <USelect v-model="state.egcs_fo_status" :items="statusItems" />
            </UFormField>
            <UFormField :label="t('funding_opportunity.name_en')" name="egcs_fo_name_en">
              <UInput v-model="state.egcs_fo_name_en" class="w-full" />
            </UFormField>
            <UFormField :label="t('funding_opportunity.name_fr')" name="egcs_fo_name_fr">
              <UInput v-model="state.egcs_fo_name_fr" class="w-full" />
            </UFormField>
            <UFormField :label="t('funding_opportunity.start_date')" name="egcs_fo_datestart">
              <CommonDatePicker v-model="state.egcs_fo_datestart" />
            </UFormField>
            <UFormField :label="t('funding_opportunity.end_date')" name="egcs_fo_dateend">
              <CommonDatePicker v-model="state.egcs_fo_dateend" />
            </UFormField>
            <UFormField :label="t('funding_opportunity.objective_en')" name="egcs_fo_objective_en">
              <CommonTextarea v-model="state.egcs_fo_objective_en" :rows="3" />
            </UFormField>
            <UFormField :label="t('funding_opportunity.objective_fr')" name="egcs_fo_objective_fr">
              <CommonTextarea v-model="state.egcs_fo_objective_fr" :rows="3" />
            </UFormField>
          </div>
        </CommonSection>
        <CommonSection :title="t('funding_opportunity.eligibility')" :grid-cols="1">
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField :label="t('funding_opportunity.review_setups')" name="egcs_fo_reviewsetups" :required="false">
              <CommonServerLookupSelect v-model:values="state.egcs_fo_reviewsetups" multiple fetch-url="/api/funding-opportunities/lookups/setups" selected-values-query-key="ids" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :query="{ ...setupQuery, kind: 'review' }" :disabled="!state.egcs_fo_transferpaymentstream" searchable />
            </UFormField>
            <UFormField :label="t('funding_opportunity.workflow_setups')" name="egcs_fo_workflowsetups" :required="false">
              <CommonServerLookupSelect v-model:values="state.egcs_fo_workflowsetups" multiple fetch-url="/api/funding-opportunities/lookups/setups" selected-values-query-key="ids" value-key="id" label-en-key="label_en" label-fr-key="label_fr" :query="{ ...setupQuery, kind: 'workflow' }" :disabled="!state.egcs_fo_transferpaymentstream" searchable />
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
