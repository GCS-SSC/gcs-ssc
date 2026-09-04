<script setup lang="ts">
import CommonCompletionPanel from '~/components/Common/Completions/Panel.vue'
/* eslint-disable jsdoc/require-jsdoc -- concise detail-page actions are covered by focused tests. */
import type { FetchError } from 'ofetch'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import AgreementActivitiesTab from '~/components/Agreement/AgreementActivitiesTab.vue'
import AgreementBudgetTab from '~/components/Agreement/AgreementBudgetTab.vue'
import { hasRequiredAmendmentSubtypeSelections } from '~/utils/agreement-amendment-scope'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import type { EntityAssignmentContext } from '~~/shared/types/schemas/entity-assignment'
import type {
  FundingCaseAgreementAmendmentRow
} from '~~/shared/types/funding-case-agreement-ui'

definePageMeta({
  key: route => route.fullPath,
  i18n: {
    paths: {
      en: '/agreements/[id]/amendments/[amendmentId]',
      fr: '/ententes/[id]/modifications/[amendmentId]'
    }
  }
})

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const { getHeroCollapsed } = useDashboard()
const { saveJson } = useJsonRequest()
const { isTerminalStatus } = useBusinessStatusState()

const agreementId = route.params.id as string
const amendmentId = route.params.amendmentId as string
const { isAssigned } = useEntityAssignmentRoster('fundingcaseamendment', amendmentId)
const isHeroCollapsed = getHeroCollapsed('agreement-amendment-detail')
const isCreatingBudgetSnapshot: Ref<boolean> = ref(false)
const isCreatingActivitySnapshot: Ref<boolean> = ref(false)
const isSavingScope: Ref<boolean> = ref(false)
const isCancelling: Ref<boolean> = ref(false)
const isCancelModalOpen: Ref<boolean> = ref(false)
const approvalsRefreshKey: Ref<number> = ref(0)
const selectedTab: Ref<string> = ref('general')
const scopeTypeIds: Ref<string[]> = ref([])
const scopeSubtypeIds: Ref<string[]> = ref([])
const amendmentNameEn: Ref<string> = ref('')
const amendmentNameFr: Ref<string> = ref('')
const requiredSubtypeIdsByType: Ref<Record<string, string[]>> = ref({})
let scopeSubtypeFilterRequest = 0
let scopeSubtypeRequirementRequest = 0
const durationDates: Ref<{
  egcs_fc_proposedauthorizedassistancestartdate?: string
  egcs_fc_proposedauthorizedassistanceenddate?: string
} | null> = ref(null)
const amendmentApiBase = `/api/agreements/${agreementId}/amendments/${amendmentId}`

const { data: profile, error: profileError, status: profileStatus, refresh: refreshProfile } = useFetch<EntityAssignmentContext, FetchError, string>(`/api/entity-assignments/fundingcaseamendment/${amendmentId}/context`)
const {
  data: amendment,
  error,
  status,
  refresh
} = useFetch<FundingCaseAgreementAmendmentRow, FetchError, string>(
  `/api/agreements/${agreementId}/amendments/${amendmentId}`
)
type AmendmentTypeLookupResponse = {
  items: Array<{ id: string, egcs_tp_amended: string, egcs_tp_requiresamendmentsubtype: boolean }>
}
const amendmentTypesLookupEndpoint: string = `/api/agreements/${agreementId}/amendments/lookups/types?amendmentId=${amendmentId}`
const amendmentTypesLookup = useFetch<AmendmentTypeLookupResponse, FetchError, string>(
  amendmentTypesLookupEndpoint,
  { default: () => ({ items: [] }) }
)
const hasLoadError = computed(() => Boolean(error.value) || Boolean(profileError.value) || Boolean(amendmentTypesLookup.error.value))
const isLoadingDetail = computed(() => status.value === 'pending' || profileStatus.value === 'pending' || amendmentTypesLookup.status.value === 'pending')
const retryLoad = async () => {
  await Promise.all([refresh(), refreshProfile(), amendmentTypesLookup.refresh()])
}
const isScopeLookupReady = computed(() => amendmentTypesLookup.status.value === 'success')
const fetchAmendmentSubtypes = $fetch as unknown as (
  url: string,
  options: { query: { amendment_type_ids: string, amendmentId: string } }
) => Promise<{ items: Array<{ id: string }> }>

const amendmentTitle = computed(() => getBilingualValue(
  amendment.value,
  'egcs_fc_name',
  amendment.value?.egcs_fc_amendmentnumber === null
    ? t('agreement.amendments.draft_title')
    : t('agreement.amendments.number_title', { number: amendment.value?.egcs_fc_amendmentnumber })
))
const amendmentHeroMetaItems = computed(() => [
  `${t('agreement.agreement_number')}: ${profile.value?.egcs_fc_agreementnumber ?? agreementId}`,
  amendment.value?.egcs_fc_amendmentnumber === null
    ? t('agreement.amendments.draft_title')
    : `${t('agreement.amendments.number')}: ${amendment.value?.egcs_fc_amendmentnumber}`,
  getBilingualValue(profile.value, 'egcs_fc_title', agreementId)
])
const hasAmendmentName = computed(() => amendmentNameEn.value.trim().length > 0 || amendmentNameFr.value.trim().length > 0)
const isBudgetAmendment = computed(() => amendment.value?.amendment_types.some(type => type.egcs_tp_amended === 'budget') === true)
const isDurationAmendment = computed(() => amendment.value?.amendment_types.some(type => type.egcs_tp_amended === 'duration') === true)
const canSnapshotBudget = computed(() => isBudgetAmendment.value || isDurationAmendment.value)
const canSnapshotActivities = computed(() => amendment.value?.amendment_types.some(type => type.egcs_tp_amended === 'activities') === true)
const canEditAmendment = computed(() => isAssigned.value && amendment.value?.can_edit === true)
const canEditAmendmentScope = computed(() => isAssigned.value && amendment.value?.can_edit_scope === true)
const canCreateAmendmentSnapshot = computed(() => isAssigned.value && amendment.value?.can_create_snapshot === true)
const canCancelAmendment = computed(() => isAssigned.value && amendment.value?.can_cancel === true)
const requiredScopeTypeIds = computed(() => amendmentTypesLookup.data.value.items
  .filter(type => scopeTypeIds.value.includes(String(type.id)) && type.egcs_tp_requiresamendmentsubtype)
  .map(type => String(type.id)))
const scopeSubtypeRequired = computed(() => requiredScopeTypeIds.value.length > 0)
const hasRequiredScopeSubtypes = computed(() => hasRequiredAmendmentSubtypeSelections(
  requiredScopeTypeIds.value,
  scopeSubtypeIds.value,
  requiredSubtypeIdsByType.value
))
const isHistoricalAmendment = computed(() => amendment.value?.egcs_fc_isopen === false
  || isTerminalStatus(amendment.value?.egcs_fc_status))
const scopeIncludesDuration = computed(() => amendmentTypesLookup.data.value.items.some(type =>
  scopeTypeIds.value.includes(String(type.id)) && type.egcs_tp_amended === 'duration'
))
const scopeSubtypeQuery = computed(() => ({ amendment_type_ids: scopeTypeIds.value.join(',') }))
const durationDatesValid = computed(() => {
  const dates = durationDates.value
  return Boolean(
    dates?.egcs_fc_proposedauthorizedassistancestartdate
    && dates.egcs_fc_proposedauthorizedassistanceenddate
    && dates.egcs_fc_proposedauthorizedassistancestartdate <= dates.egcs_fc_proposedauthorizedassistanceenddate
  )
})
const breadcrumbItems = computed(() => [
  { label: t('agreement.title'), to: localePath(appRouteLocations.agreements()) },
  { label: getBilingualValue(profile.value, 'egcs_fc_title', agreementId), to: authorizedRouteLocation(profile.value?.can_read_agreement, localePath(appRouteLocations.agreementDetail(agreementId))) },
  { label: amendmentTitle.value }
])
const tabs = computed(() => [
  { key: 'agency.tabs.general', value: 'general', icon: 'i-lucide-info' },
  { key: 'agreement.budget.title', value: 'budget', icon: 'i-lucide-wallet-cards' },
  { key: 'agreement.activities.title', value: 'activities', icon: 'i-lucide-list-checks' },
  { key: 'agreement.amendments.recommendation', value: 'recommendation', icon: 'i-lucide-git-pull-request-arrow' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users' }
])

const refreshPage = async () => {
  await refresh()
  approvalsRefreshKey.value += 1
}

const createSnapshot = async (domain: 'budget' | 'activity') => {
  const pending = domain === 'budget' ? isCreatingBudgetSnapshot : isCreatingActivitySnapshot
  if (pending.value) return

  try {
    pending.value = true
    await saveJson(`/api/agreements/${agreementId}/amendments/${amendmentId}/${domain}-snapshot`, 'POST', {})
    await refresh()
    toast.add({ title: t('common.success'), description: t(`agreement.amendments.${domain}_snapshot_created`), color: 'success' })
  } catch (caughtError: unknown) {
    showError(caughtError)
  } finally {
    pending.value = false
  }
}

watch(amendment, value => {
  if (!value) {
    scopeTypeIds.value = []
    scopeSubtypeIds.value = []
    durationDates.value = null
    return
  }
  scopeTypeIds.value = [...(value.amendment_type_ids ?? [])]
  scopeSubtypeIds.value = [...(value.amendment_subtype_ids ?? [])]
  amendmentNameEn.value = value.egcs_fc_name_en ?? ''
  amendmentNameFr.value = value.egcs_fc_name_fr ?? ''
  durationDates.value = {
    egcs_fc_proposedauthorizedassistancestartdate: value.egcs_fc_proposedauthorizedassistancestartdate ?? undefined,
    egcs_fc_proposedauthorizedassistanceenddate: value.egcs_fc_proposedauthorizedassistanceenddate ?? undefined
  }
}, { immediate: true })

const onScopeTypesChanged = async (typeIds: string[]) => {
  const requestId = ++scopeSubtypeFilterRequest
  if (typeIds.length === 0) {
    scopeSubtypeIds.value = []
    return
  }

  try {
    const response = await fetchAmendmentSubtypes(
      `/api/agreements/${agreementId}/amendments/lookups/subtypes`,
      { query: { amendment_type_ids: typeIds.join(','), amendmentId } }
    )
    if (requestId !== scopeSubtypeFilterRequest) return
    const validSubtypeIds = new Set(response.items.map(item => String(item.id)))
    scopeSubtypeIds.value = scopeSubtypeIds.value.filter(subtypeId => validSubtypeIds.has(subtypeId))
  } catch (caughtError: unknown) {
    if (requestId === scopeSubtypeFilterRequest) showError(caughtError)
  }
}

watch(requiredScopeTypeIds, async typeIds => {
  const requestId = ++scopeSubtypeRequirementRequest
  requiredSubtypeIdsByType.value = {}
  if (typeIds.length === 0) return

  try {
    const subtypeResponses = await Promise.all(typeIds.map(async typeId => ({
      typeId,
      response: await fetchAmendmentSubtypes(
        `/api/agreements/${agreementId}/amendments/lookups/subtypes`,
        { query: { amendment_type_ids: typeId, amendmentId } }
      )
    })))
    if (requestId !== scopeSubtypeRequirementRequest) return
    requiredSubtypeIdsByType.value = Object.fromEntries(subtypeResponses.map(({ typeId, response }) => [
      typeId,
      response.items.map(item => String(item.id))
    ]))
  } catch (caughtError: unknown) {
    if (requestId === scopeSubtypeRequirementRequest) showError(caughtError)
  }
}, { immediate: true })

const saveScope = async () => {
  if (!canEditAmendmentScope.value
    || !isScopeLookupReady.value
    || !hasAmendmentName.value
    || scopeTypeIds.value.length === 0
    || !hasRequiredScopeSubtypes.value
    || (scopeIncludesDuration.value && !durationDatesValid.value)
    || isSavingScope.value) return
  try {
    isSavingScope.value = true
    await saveJson(amendmentApiBase, 'PATCH', {
      egcs_fc_name_en: amendmentNameEn.value,
      egcs_fc_name_fr: amendmentNameFr.value,
      amendment_type_ids: scopeTypeIds.value,
      amendment_subtype_ids: scopeSubtypeIds.value,
      egcs_fc_proposedauthorizedassistancestartdate: scopeIncludesDuration.value
        ? durationDates.value?.egcs_fc_proposedauthorizedassistancestartdate
        : null,
      egcs_fc_proposedauthorizedassistanceenddate: scopeIncludesDuration.value
        ? durationDates.value?.egcs_fc_proposedauthorizedassistanceenddate
        : null
    })
    await refresh()
    toast.add({ title: t('common.success'), description: t('agreement.amendments.scope_updated'), color: 'success' })
  } catch (caughtError: unknown) {
    showError(caughtError)
  } finally {
    isSavingScope.value = false
  }
}

const cancelAmendment = async () => {
  if (!canCancelAmendment.value || isCancelling.value) return
  try {
    isCancelling.value = true
    await saveJson(`${amendmentApiBase}/cancel`, 'POST', {})
    isCancelModalOpen.value = false
    await refresh()
    toast.add({ title: t('common.success'), description: t('agreement.amendments.cancelled_success'), color: 'success' })
  } catch (caughtError: unknown) {
    showError(caughtError)
  } finally {
    isCancelling.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="agreement-amendment-detail" class="w-full">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              class="cursor-default"
              color="neutral"
              variant="ghost"
              :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
              :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')"
              @click="isHeroCollapsed = !isHeroCollapsed" />
            <CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="amendment" class="flex flex-1 flex-col">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-file-pen-line"
          :title="amendmentTitle"
          :meta-items="amendmentHeroMetaItems"
          :badges="[{
            statusId: amendment.egcs_fc_status,
            isCompleted: amendment.isCompleted
          }]" />

        <CommonEntityEditorWorkspace content-test-id="agreement-amendment-detail-content">
          <template #sidebar>
            <CommonRouteTabs
              v-model="selectedTab"
              :items="tabs"
              orientation="vertical"
              :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
          </template>

          <section v-if="selectedTab === 'general'" class="space-y-8">
            <CommonSection :title="t('agreement.amendments.sections.details')" badge="01" :grid-cols="1">
              <div class="space-y-4">
                <div class="grid gap-4 md:grid-cols-2">
                  <UFormField :label="t('agreement.amendments.name_en')">
                    <UInput v-model="amendmentNameEn" class="w-full" :disabled="!canEditAmendmentScope" />
                  </UFormField>
                  <UFormField :label="t('agreement.amendments.name_fr')">
                    <UInput v-model="amendmentNameFr" class="w-full" :disabled="!canEditAmendmentScope" />
                  </UFormField>
                </div>
                <p class="text-sm text-zinc-500 dark:text-zinc-400">
                  {{ t('agreement.amendments.name_help') }}
                </p>
              </div>
            </CommonSection>

            <CommonSection :title="t('agreement.amendments.sections.scope')" badge="02" :grid-cols="1">
              <div class="space-y-4">
                <p class="text-sm text-zinc-500 dark:text-zinc-400">
                  {{ t('agreement.amendments.types_description') }}
                </p>
                <UFormField :label="t('agreement.amendments.types')" required>
                  <CommonServerLookupMultiSelect
                    v-model="scopeTypeIds"
                    :fetch-url="`/api/agreements/${agreementId}/amendments/lookups/types?amendmentId=${encodeURIComponent(amendmentId)}`"
                    value-key="id"
                    label-en-key="egcs_tp_name_en"
                    label-fr-key="egcs_tp_name_fr"
                    :disabled="!canEditAmendmentScope"
                    required
                    @update:model-value="onScopeTypesChanged" />
                </UFormField>
                <UFormField v-if="scopeTypeIds.length > 0" :label="t('agreement.amendments.subtypes')" :required="scopeSubtypeRequired">
                  <div v-if="isHistoricalAmendment" data-testid="historical-amendment-subtypes" class="flex flex-wrap gap-2">
                    <CommonStatusBadge
                      v-for="subtype in amendment.amendment_subtypes"
                      :key="subtype.id"
                      variant="meta"
                      size="sm"
                      :label="getBilingualValue(subtype, 'egcs_tp_name', String(subtype.id))" />
                    <span
                      v-if="!amendment.amendment_subtypes || amendment.amendment_subtypes.length === 0"
                      class="text-sm text-zinc-500 dark:text-zinc-400">
                      {{ t('common.none') }}
                    </span>
                  </div>
                  <CommonServerLookupMultiSelect
                    v-else
                    v-model="scopeSubtypeIds"
                    :fetch-url="`/api/agreements/${agreementId}/amendments/lookups/subtypes`"
                    value-key="id"
                    label-en-key="egcs_tp_name_en"
                    label-fr-key="egcs_tp_name_fr"
                    :query="scopeSubtypeQuery"
                    :disabled="!canEditAmendmentScope"
                    :required="scopeSubtypeRequired" />
                </UFormField>
              </div>
            </CommonSection>

            <CommonSection
              v-if="scopeIncludesDuration && durationDates"
              :title="t('agreement.amendments.duration')"
              badge="03"
              :grid-cols="1">
              <div class="space-y-4">
                <p class="text-sm text-zinc-500 dark:text-zinc-400">
                  {{ t('agreement.amendments.duration_description') }}
                </p>
                <div class="grid gap-4 md:grid-cols-2">
                  <UFormField :label="t('agreement.authorized_assistance_start_date')" required>
                    <CommonDatePicker
                      v-model="durationDates.egcs_fc_proposedauthorizedassistancestartdate"
                      :disabled="!canEditAmendmentScope" />
                  </UFormField>
                  <UFormField :label="t('agreement.authorized_assistance_end_date')" required>
                    <CommonDatePicker
                      v-model="durationDates.egcs_fc_proposedauthorizedassistanceenddate"
                      :disabled="!canEditAmendmentScope" />
                  </UFormField>
                </div>
              </div>
            </CommonSection>
            <div v-if="canEditAmendmentScope || canCancelAmendment" class="flex items-center justify-between gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <UButton
                v-if="canCancelAmendment"
                icon="i-lucide-ban"
                color="error"
                variant="outline"
                :label="t('agreement.amendments.cancel')"
                class="cursor-default"
                @click="isCancelModalOpen = true" />
              <CommonSaveButton
                v-if="canEditAmendmentScope"
                :label="t('common.save')"
                :loading="isSavingScope"
                :disabled="!isScopeLookupReady || isSavingScope || !hasAmendmentName || scopeTypeIds.length === 0 || !hasRequiredScopeSubtypes || (scopeIncludesDuration && !durationDatesValid)"
                @click="saveScope" />
            </div>
          </section>

          <section v-else-if="selectedTab === 'budget'" class="w-full min-w-0 space-y-6">
            <CommonPreActionReport
              v-if="!amendment.has_budget_snapshot"
              :title="t('agreement.budget.title')"
              :description="t('agreement.amendments.budget_snapshot_description')">
              <template #action>
                <UButton
                  v-if="canSnapshotBudget && canCreateAmendmentSnapshot"
                  icon="i-lucide-copy-plus"
                  :label="t('agreement.amendments.create_budget_snapshot')"
                  class="cursor-default"
                  :loading="isCreatingBudgetSnapshot"
                  :disabled="isCreatingBudgetSnapshot"
                  @click="createSnapshot('budget')" />
              </template>
            </CommonPreActionReport>
            <AgreementBudgetTab
              v-if="amendment.has_budget_snapshot"
              :agreement-id="agreementId"
              :api-base="amendmentApiBase"
              :fiscal-year-lookup-url="`${amendmentApiBase}/budget-fiscal-years/lookups/fiscal-years`"
              :can-create="canEditAmendment && isBudgetAmendment"
              :can-update="canEditAmendment && isBudgetAmendment"
              :can-delete="canEditAmendment && isBudgetAmendment"
              :can-create-fiscal-year="canEditAmendment && (isBudgetAmendment || isDurationAmendment)"
              :can-update-fiscal-year="canEditAmendment && (isBudgetAmendment || isDurationAmendment)"
              :can-delete-fiscal-year="canEditAmendment && (isBudgetAmendment || isDurationAmendment)"
              :allow-delete-fiscal-year-with-lines="isBudgetAmendment || isDurationAmendment" />
          </section>

          <section v-else-if="selectedTab === 'activities'" class="w-full min-w-0 space-y-6">
            <CommonPreActionReport
              v-if="!amendment.has_activity_snapshot"
              :title="t('agreement.activities.title')"
              :description="t('agreement.amendments.activity_snapshot_description')">
              <template #action>
                <UButton
                  v-if="canSnapshotActivities && canCreateAmendmentSnapshot"
                  icon="i-lucide-copy-plus"
                  :label="t('agreement.amendments.create_activity_snapshot')"
                  class="cursor-default"
                  :loading="isCreatingActivitySnapshot"
                  :disabled="isCreatingActivitySnapshot"
                  @click="createSnapshot('activity')" />
              </template>
            </CommonPreActionReport>
            <AgreementActivitiesTab
              v-if="amendment.has_activity_snapshot"
              :agreement-id="agreementId"
              :api-base="amendmentApiBase"
              :can-create="canEditAmendment"
              :can-update="canEditAmendment"
              :can-delete="canEditAmendment" />
          </section>

          <section v-else-if="selectedTab === 'recommendation'" class="space-y-6">
            <CommonCompletionPanel
              entity-type="fundingcaseamendment"
              :entity-id="amendmentId"
              :can-complete="canEditAmendment"
              :can-work-workflow="isAssigned"
              :refresh-key="approvalsRefreshKey"
              :hide-title="false"
              :show-divider="false"
              title-key="agreement.amendments.completion.title"
              description-key="agreement.amendments.completion.description"
              status-complete-key="agreement.amendments.completion.status_complete"
              status-locked-key="agreement.amendments.completion.status_locked"
              comment-placeholder-key="agreement.amendments.completion.comment_placeholder"
              complete-action-key="agreement.amendments.completion.complete"
              completed-success-key="agreement.amendments.completion.completed_success"
              @changed="refreshPage" />
          </section>

          <CommonWorkflowSection
            v-else-if="selectedTab === 'workflows'"
            entity-type="fundingcaseamendment"
            :entity-id="amendmentId"
            purpose="standard"
            :can-edit="isAssigned"
            :refresh-key="approvalsRefreshKey"
            @changed="refreshPage" />

          <CommonAssignedUsers
            v-else-if="selectedTab === 'assignments'"
            entity-type="fundingcaseamendment"
            :entity-id="amendmentId" />
          <CommonAttachmentsTab
            v-else-if="selectedTab === 'attachments'"
            entity-type="fundingcaseamendment"
            :entity-id="amendmentId" />
        </CommonEntityEditorWorkspace>
      </div>

      <div v-else-if="isLoadingDetail" role="status" aria-live="polite" class="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary" aria-hidden="true" />
        <span>{{ t('common.loading_records') }}</span>
      </div>

      <div v-else-if="hasLoadError" class="p-6">
        <UAlert color="error" icon="i-lucide-circle-alert" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
          <template #actions>
            <UButton color="error" variant="soft" icon="i-lucide-refresh-cw" :label="t('common.retry')" :loading="isLoadingDetail" @click="retryLoad" />
          </template>
        </UAlert>
      </div>

      <UModal
        v-model:open="isCancelModalOpen"
        :title="t('agreement.amendments.cancel_title')"
        :description="t('agreement.amendments.cancel_confirm')">
        <template #body>
          <div class="flex justify-end gap-2 pt-4">
            <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="isCancelModalOpen = false" />
            <UButton
              color="error"
              icon="i-lucide-ban"
              :label="t('agreement.amendments.cancel')"
              class="cursor-default"
              :loading="isCancelling"
              :disabled="isCancelling"
              @click="cancelAmendment" />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
