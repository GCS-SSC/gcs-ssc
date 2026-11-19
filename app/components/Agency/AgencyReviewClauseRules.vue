<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import type { ResourceCrudAction } from '~/composables/useResourceCrudState'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { AgencyReviewClauseRuleSchema, type AgencyReviewClauseRuleItem } from '~~/shared/types/schemas/agency-review-clause-rule'
import { CHECKLIST_RESULTS } from '~~/shared/types/schemas/checklist/checklist'

type OutcomeOption = {
  id: string
  label_en: string
  label_fr: string
  strategies: { value: string, label: { en: string, fr: string } }[]
}

const { agencyId, schemaId, reviewType, canManage, isPublished } = defineProps<{
  agencyId: string
  schemaId: string
  reviewType: 'checklist' | 'assessment'
  canManage: boolean
  isPublished: boolean
}>()
const { t } = useI18n()
const endpoint = computed(() => `/api/agency/${agencyId}/review-clause-rules`)
const listUrl = computed(() => `${endpoint.value}?review_schema_id=${encodeURIComponent(schemaId)}`)
const isAssessment = computed(() => reviewType === 'assessment')
const ruleFields = AgencyReviewClauseRuleSchema.shape
const formSchema = reviewType === 'assessment'
  ? AgencyReviewClauseRuleSchema.safeExtend({
      egcs_ay_outcome: ruleFields.egcs_ay_outcome.unwrap().unwrap(),
      egcs_ay_strategy: ruleFields.egcs_ay_strategy.unwrap().unwrap()
    })
  : AgencyReviewClauseRuleSchema.safeExtend({
      egcs_ay_result: ruleFields.egcs_ay_result.unwrap().unwrap()
    })
const lookupUrl = computed(() => `${endpoint.value}/lookups?kind=outcome&review_schema_id=${encodeURIComponent(schemaId)}`)
const { data: outcomeCatalog, status: outcomeStatus, refresh: retryOutcomes } = useFetch<{ items: OutcomeOption[] }>(
  lookupUrl,
  { immediate: false, watch: false }
)
watch([lookupUrl, () => isAssessment.value && canManage && isPublished], ([, enabled]) => {
  if (enabled) void retryOutcomes()
}, { immediate: true })
const outcomes = computed(() => outcomeCatalog.value?.items ?? [])
const canConfigure = computed(() => canManage && isPublished && (!isAssessment.value || outcomeStatus.value === 'success'))
const writeContext = useActionContext({ identity: [listUrl], authority: canConfigure })
const deleteContext = useActionContext({ identity: [listUrl], authority: () => canManage })
const action: ResourceCrudAction = { kind: 'remote', create: writeContext, update: writeContext, delete: deleteContext }
const columns = computed<TableColumnInput<AgencyReviewClauseRuleItem>[]>(() => [
  ...(isAssessment.value
    ? [{ id: 'outcome', headerKey: 'review_clause_rules.outcome' }, { id: 'strategy', headerKey: 'review_clause_rules.strategy' }]
    : [{ id: 'result', headerKey: 'review_clause_rules.result' }]),
  { id: 'clause', headerKey: 'clauses.group' },
  { id: 'protection', headerKey: 'review_clause_rules.protection' },
  { id: 'actions', headerKey: 'common.actions' }
])
const initialRule = computed<Partial<AgencyReviewClauseRuleItem>>(() => ({
  egcs_ay_reviewschema: schemaId,
  egcs_ay_protected: false,
  ...(isAssessment.value ? { egcs_ay_result: null } : {})
}))

/**
 * Sends the schema-scoped mapping fields without the display names from the list.
 * @param state Current mapping form.
 * @returns Rule configuration.
 */
const buildUpdatePayload = (state: Partial<AgencyReviewClauseRuleItem>) => ({
  ...initialRule.value,
  egcs_ay_clause: state.egcs_ay_clause,
  egcs_ay_protected: state.egcs_ay_protected,
  ...(isAssessment.value
    ? { egcs_ay_outcome: state.egcs_ay_outcome, egcs_ay_strategy: state.egcs_ay_strategy }
    : { egcs_ay_result: state.egcs_ay_result })
})

/**
 * Returns valid strategies for the draft's currently selected outcome.
 * @param outcomeId The published outcome identity.
 * @returns Bilingual strategy choices for the selected outcome.
 */
const getStrategies = (outcomeId: string | null | undefined) =>
  (outcomes.value.find(outcome => outcome.id === outcomeId)?.strategies ?? [])
    .map(strategy => ({ id: strategy.value, name_en: strategy.label.en, name_fr: strategy.label.fr }))

/**
 * Changes the selected outcome and clears a strategy owned by a previous outcome.
 * @param state Current mapping form.
 * @param outcomeId Next outcome identity.
 */
const updateOutcome = (state: Partial<AgencyReviewClauseRuleItem>, outcomeId: string | null | undefined) => {
  if (outcomeId === state.egcs_ay_outcome) return
  state.egcs_ay_outcome = outcomeId ?? undefined
  state.egcs_ay_strategy = undefined
}
</script>

<template>
  <CommonErrorNotice
    v-if="isAssessment && outcomeStatus === 'error'"
    :title="t('common.load_failed')">
    <template #actions>
      <UButton :label="t('common.retry')" @click="retryOutcomes()" />
    </template>
  </CommonErrorNotice>

  <!-- @vue-generic {AgencyReviewClauseRuleItem} -->
  <CommonResourceCrud
    :table-id="`agency.${reviewType}.review-clause-rules`"
    data-field-scope="agency.review-clause-rule"
    :action="action"
    :title="t('review_clause_rules.title')"
    icon="i-lucide-list-checks"
    :fetch-url="listUrl"
    :post-url="canConfigure ? endpoint : undefined"
    :update-url-base="canConfigure ? endpoint : undefined"
    :delete-url-base="canManage ? endpoint : undefined"
    :can-create="canConfigure"
    :can-update="canConfigure"
    :can-delete="canManage"
    :schema="formSchema"
    :initial-new-item="initialRule"
    :columns="columns"
    :button-label="t('review_clause_rules.add')"
    :modal-title="t('review_clause_rules.add')"
    :update-title="t('review_clause_rules.edit')"
    :build-update-payload="buildUpdatePayload"
    delete-confirm-key="review_clause_rules.disable_confirm"
    embedded>
    <template #outcome-cell="{ row }">
      <CommonBilingualName
        :name-en="row.original.outcomeNameEn || row.original.egcs_ay_outcome || ''"
        :name-fr="row.original.outcomeNameFr || row.original.egcs_ay_outcome || ''" />
    </template>

    <template #strategy-cell="{ row }">
      <CommonBilingualName
        :name-en="row.original.strategyNameEn || row.original.egcs_ay_strategy || ''"
        :name-fr="row.original.strategyNameFr || row.original.egcs_ay_strategy || ''" />
    </template>

    <template #result-cell="{ row }">
      {{ row.original.egcs_ay_result ? t(`checklist.result.${row.original.egcs_ay_result}`) : '' }}
    </template>

    <template #clause-cell="{ row }">
      <CommonBilingualName :name-en="row.original.clauseNameEn" :name-fr="row.original.clauseNameFr" />
    </template>

    <template #protection-cell="{ row }">
      <UBadge v-if="row.original.egcs_ay_protected" color="warning" variant="subtle">
        {{ t('review_clause_rules.protected') }}
      </UBadge>
      <span v-else>{{ t('review_clause_rules.standard') }}</span>
    </template>

    <template #form="{ state }">
      <template v-if="isAssessment">
        <UFormField :label="t('review_clause_rules.outcome')" name="egcs_ay_outcome" required>
          <CommonBilingualSelectMenu
            :model-value="state.egcs_ay_outcome"
            :items="outcomes"
            label-en-key="label_en"
            label-fr-key="label_fr"
            class="w-full"
            @update:model-value="updateOutcome(state, $event)" />
        </UFormField>

        <UFormField :label="t('review_clause_rules.strategy')" name="egcs_ay_strategy" required>
          <CommonBilingualSelectMenu
            :model-value="state.egcs_ay_strategy"
            :items="getStrategies(state.egcs_ay_outcome)"
            :disabled="!state.egcs_ay_outcome"
            class="w-full"
            @update:model-value="state.egcs_ay_strategy = $event ?? undefined" />
        </UFormField>
      </template>

      <UFormField v-else :label="t('review_clause_rules.result')" name="egcs_ay_result" required>
        <CommonEnumSelect
          :model-value="state.egcs_ay_result ?? undefined"
          name="checklist_result"
          class="w-full"
          @update:model-value="state.egcs_ay_result = CHECKLIST_RESULTS.find(result => result === $event)" />
      </UFormField>

      <UFormField :label="t('clauses.group')" name="egcs_ay_clause" required>
        <CommonServerLookupSelect
          v-model="state.egcs_ay_clause"
          :fetch-url="`${endpoint}/lookups`"
          :query="{ kind: 'clause' }"
          selected-values-query-key="selected_ids"
          value-key="id"
          label-en-key="label_en"
          label-fr-key="label_fr"
          :show-value-in-label="false"
          close-on-select />
      </UFormField>

      <UFormField name="egcs_ay_protected" :required="false">
        <USwitch
          v-model="state.egcs_ay_protected"
          :label="t('review_clause_rules.protected')"
          :description="t('review_clause_rules.protected_help')" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
