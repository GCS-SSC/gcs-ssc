<script setup lang="ts">
import { useFieldTooltipProvider } from '~/composables/useFieldTooltipProvider'
import { usePageResourceError } from '~/composables/usePageResourceError'
import { useId, computed, onUnmounted, ref, watch } from 'vue'
import CommonCompletionPanel from '~/components/Common/Completions/Panel.vue'
/* eslint-disable jsdoc/require-jsdoc -- concise detail-page actions are covered by focused tests. */
import type { AdminCommonLookupResponseItem } from '~~/shared/types/admin-common-ui'
import type { FetchError } from 'ofetch'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
import type { Ref } from 'vue'
import AgreementActivitiesTab from '~/components/Agreement/AgreementActivitiesTab.vue'
import AgreementBudgetTab from '~/components/Agreement/AgreementBudgetTab.vue'
import { hasRequiredAmendmentSubtypeSelections, resolveSelectedAmendmentScopeTypes } from '~/utils/agreement-amendment-scope'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import type { EntityAssignmentContext } from '~~/shared/types/schemas/entity-assignment'
import type {
  FundingCaseAgreementAmendmentRow
} from '~~/shared/types/funding-case-agreement-ui'

definePageMeta({
  key: route => route.path,
  i18n: {
    paths: {
      en: '/agreements/[id]/amendments/[amendmentId]',
      fr: '/ententes/[id]/modifications/[amendmentId]'
    }
  }
})

const route = useRoute()
const nameRequirementId = useId()
const { t, n } = useI18n()
const { formatDate } = useDateHelpers()
const localePath = useLocalePath()
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const { getHeroCollapsed } = useDashboard()
const { saveJson } = useJsonRequest()
const confirmScopeRemoval = useDeleteConfirm()
const { isTerminalStatus } = useBusinessStatusState()
const snapshotStatusCatalog = useStatusCatalog()

const agreementId = route.params.id as string
const amendmentId = route.params.amendmentId as string
const { isAssigned } = useEntityAssignmentRoster('fundingcaseamendment', amendmentId)
const isHeroCollapsed = getHeroCollapsed('agreement-amendment-detail')
const isCreatingBudgetSnapshot: Ref<boolean> = ref(false)
const isCreatingActivitySnapshot: Ref<boolean> = ref(false)
const isSavingScope: Ref<boolean> = ref(false)
const isSavingRisk: Ref<boolean> = ref(false)
const changeRisk: Ref<boolean> = ref(false)
const proposedRiskScoreSelection: Ref<string | undefined> = ref(undefined)
const isCancelling: Ref<boolean> = ref(false)
const isCancelModalOpen: Ref<boolean> = ref(false)
const approvalsRefreshKey: Ref<number> = ref(0)

const scopeTypeIds: Ref<string[]> = ref([])
const scopeSubtypeIds: Ref<string[]> = ref([])
const amendmentNameEn: Ref<string> = ref('')
const amendmentNameFr: Ref<string> = ref('')
const requiredSubtypeIdsByType: Ref<Record<string, string[]>> = ref({})
let scopeSubtypeFilterRequest = 0
let scopeSubtypeRequirementRequest = 0
const resolvedScopeTypeMetadata: Ref<AmendmentTypeMetadata[]> = ref([])
const scopeSubtypeRequirementFailed: Ref<boolean> = ref(false)
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
usePageResourceError({
  identity: () => route.path,
  errors: [profileError, error],
  pending: () => profileStatus.value === 'pending' || status.value === 'pending',
  hasContent: () => Boolean(profile.value && amendment.value)
})

type AmendmentTypeMetadata = { id: string, egcs_tp_amended: string, egcs_tp_requiresamendmentsubtype: boolean }
type AmendmentTypeLookupResponse = {
  items: AmendmentTypeMetadata[]
  total: number
  limit: number
}
const amendmentTypesLookupEndpoint: string = `/api/agreements/${agreementId}/amendments/lookups/types?amendmentId=${amendmentId}`
const amendmentTypesLookup = useFetch<AmendmentTypeLookupResponse, FetchError, string>(
  amendmentTypesLookupEndpoint,
  { default: () => ({ items: [], total: 0, limit: 10 }) }
)
const hasLoadError = computed(() => Boolean(error.value) || Boolean(profileError.value) || Boolean(amendmentTypesLookup.error.value))
const isLoadingDetail = computed(() => status.value === 'pending' || profileStatus.value === 'pending' || amendmentTypesLookup.status.value === 'pending')
const retryLoad = async () => {
  await Promise.all([refresh(), refreshProfile(), amendmentTypesLookup.refresh()])
}
const selectedScopeTypes = computed(() => {
  const byId = new Map([...amendmentTypesLookup.data.value.items, ...resolvedScopeTypeMetadata.value].map(type => [type.id, type]))
  return scopeTypeIds.value.flatMap(id => byId.has(id) ? [byId.get(id)!] : [])
})
const isScopeLookupReady = computed(() => amendmentTypesLookup.status.value === 'success' && selectedScopeTypes.value.length === scopeTypeIds.value.length)
const onResolvedScopeTypes = (items: AdminCommonLookupResponseItem[]) => {
  if (!ownsAmendmentPage()) return
  resolvedScopeTypeMetadata.value = items.flatMap(item => typeof item.id === 'string'
    && typeof item.egcs_tp_amended === 'string' && typeof item.egcs_tp_requiresamendmentsubtype === 'boolean'
    ? [{ id: item.id, egcs_tp_amended: item.egcs_tp_amended, egcs_tp_requiresamendmentsubtype: item.egcs_tp_requiresamendmentsubtype }]
    : [])
}
const fetchAmendmentTypes = $fetch as unknown as (
  url: string,
  options: { query: { page: number, limit: number } }
) => Promise<AmendmentTypeLookupResponse>
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
const canEditRisk = computed(() => canEditAmendment.value && !amendment.value?.isCompleted && !amendment.value?.risk_workflow_managed)
const formatRiskScore = (score: number | null | undefined): string => score === null || score === undefined
  ? t('common.not_available')
  : n(score)
const getLocalizedWorkflowName = (name: { en: string, fr: string }): string => getBilingualValue({
  workflow_name_en: name.en, workflow_name_fr: name.fr
}, 'workflow_name', t('common.not_available'))
const savedRiskScoreItems = computed(() => {
  const score = amendment.value?.egcs_fc_proposedriskscore
  if (score === undefined || score === null) return []
  const rating = amendment.value?.latest_risk_rating_run?.mappedRating
  const label = rating?.score === score
    ? getBilingualValue({ name_en: rating.label.en, name_fr: rating.label.fr }, 'name', formatRiskScore(score))
    : formatRiskScore(score)
  return [{ value: String(score), label }]
})
const canEditAmendmentScope = computed(() => isAssigned.value && amendment.value?.can_edit_scope === true)
const canCreateAmendmentSnapshot = computed(() => profile.value?.can_create_agreement_role === true)
const canCancelAmendment = computed(() => isAssigned.value && amendment.value?.can_cancel === true)
const requiredScopeTypeIds = computed(() => selectedScopeTypes.value
  .filter(type => type.egcs_tp_requiresamendmentsubtype)
  .map(type => String(type.id)))
const scopeSubtypeRequired = computed(() => requiredScopeTypeIds.value.length > 0)
const hasRequiredScopeSubtypes = computed(() => hasRequiredAmendmentSubtypeSelections(
  requiredScopeTypeIds.value,
  scopeSubtypeIds.value,
  requiredSubtypeIdsByType.value
))
const isHistoricalAmendment = computed(() => amendment.value?.egcs_fc_isopen === false
  || isTerminalStatus(amendment.value?.egcs_fc_status))
const scopeIncludesDuration = computed(() => selectedScopeTypes.value.some(type => type.egcs_tp_amended === 'duration'))
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
  ...(amendment.value?.risk_rating_available || amendment.value?.risk_workflow_managed || amendment.value?.has_risk_rating_runs
    ? [{ key: 'agreement.risk_rating_workflow', value: 'risk-rating', icon: 'i-lucide-gauge' }]
    : []),
  { key: 'reviews.title', value: 'reviews', icon: 'i-lucide-clipboard-check' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'supplementary_information.title', value: 'supplementary-information', icon: 'i-lucide-clipboard-list' },
  ...(profile.value?.can_read_agreement ? [{ key: 'agreement.documents.title', value: 'documents', icon: 'i-lucide-files' }] : []),
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users' }
])
const { selectedTab } = useUrlTabState({ tabs, defaultTab: 'general' })

const refreshPage = async () => {
  await refresh()
  approvalsRefreshKey.value += 1
}

type SnapshotDomain = 'budget' | 'activity'
let amendmentActionGeneration = 0
let amendmentActionsDisposed = false
let scopeSaveToken: symbol | null = null
const snapshotActionTokens = new Map<SnapshotDomain, symbol>()
const invalidateAmendmentActions = () => {
  amendmentActionGeneration += 1
  snapshotActionTokens.clear()
  scopeSaveToken = null
  scopeSubtypeFilterRequest += 1
  scopeSubtypeRequirementRequest += 1
  resolvedScopeTypeMetadata.value = []
  requiredSubtypeIdsByType.value = {}
  scopeSubtypeRequirementFailed.value = false
  isSavingScope.value = false
  isCreatingBudgetSnapshot.value = false
  isCreatingActivitySnapshot.value = false
}
watch([() => route.path, () => route.params.id, () => route.params.amendmentId], invalidateAmendmentActions, { flush: 'sync' })
onUnmounted(() => {
  amendmentActionsDisposed = true
  invalidateAmendmentActions()
})
const ownsAmendmentPage = () => !amendmentActionsDisposed
  && route.params.id === agreementId
  && route.params.amendmentId === amendmentId
const warnSnapshotPrerequisite = (missingAssignment = false) => toast.add({
  title: toast.localized('common.warning'),
  description: toast.localized(missingAssignment ? 'assignments.read_only_description' : 'agreement.child_records.work_prerequisite'),
  color: 'warning'
})
const checkSnapshotPrerequisites = async (domain: SnapshotDomain, shouldProceed: () => boolean) => {
  try {
    const [record, context, roster] = await Promise.all([
      $fetch<FundingCaseAgreementAmendmentRow, string>(amendmentApiBase),
      $fetch<EntityAssignmentContext, string>(`/api/entity-assignments/fundingcaseamendment/${amendmentId}/context`),
      $fetch<{ is_assigned: boolean }, string>(`/api/entity-assignments/fundingcaseamendment/${amendmentId}`)
    ])
    if (!shouldProceed()) return false
    if (roster.is_assigned !== true) {
      warnSnapshotPrerequisite(true)
      return false
    }
    if (!snapshotStatusCatalog.getById(record.egcs_fc_status)) await snapshotStatusCatalog.load()
    if (!shouldProceed()) return false
    const definition = snapshotStatusCatalog.getById(record.egcs_fc_status)
    const enabled = record.amendment_types.some(type => domain === 'budget'
      ? type.egcs_tp_amended === 'budget' || type.egcs_tp_amended === 'duration'
      : type.egcs_tp_amended === 'activities')
    if (!enabled) {
      toast.add({
        title: toast.localized('common.warning'),
        description: toast.localized(domain === 'activity' ? 'apiErrors.agreement.amendment_activities_not_enabled' : 'apiErrors.agreement.amendment_budget_not_enabled'),
        color: 'warning'
      })
      return false
    }
    const missing = domain === 'budget' ? record.has_budget_snapshot === false : record.has_activity_snapshot === false
    if (context.can_create_agreement_role === true && record.can_create_snapshot === true
      && definition?.isDraft === true && !definition.deleted && !definition.readOnly && !definition.terminal
      && record.isCompleted !== true && missing) return true
  } catch {
    if (!shouldProceed()) return false
  }
  if (shouldProceed()) warnSnapshotPrerequisite()
  return false
}
const createSnapshot = async (domain: SnapshotDomain) => {
  const pending = domain === 'budget' ? isCreatingBudgetSnapshot : isCreatingActivitySnapshot
  if (!ownsAmendmentPage() || !canCreateAmendmentSnapshot.value || isLoadingDetail.value || hasLoadError.value || snapshotActionTokens.has(domain)) return
  const token = Symbol(domain)
  const generation = amendmentActionGeneration
  const requestedPath = route.path
  const requestedBase = amendmentApiBase
  snapshotActionTokens.set(domain, token)
  pending.value = true
  const shouldProceed = () => ownsAmendmentPage() && generation === amendmentActionGeneration
    && requestedPath === route.path && snapshotActionTokens.get(domain) === token && canCreateAmendmentSnapshot.value
  try {
    if (!await checkSnapshotPrerequisites(domain, shouldProceed) || !shouldProceed()) return
    await saveJson(`${requestedBase}/${domain}-snapshot`, 'POST', {})
    if (!shouldProceed()) return
    await refresh()
    if (!shouldProceed() || error.value || status.value === 'error') return
    toast.add({ title: toast.localized('common.success'), description: toast.localized(`agreement.amendments.${domain}_snapshot_created`), color: 'success' })
  } catch (caughtError: unknown) {
    if (shouldProceed()) showError(caughtError)
  } finally {
    if (snapshotActionTokens.get(domain) === token) {
      snapshotActionTokens.delete(domain)
      pending.value = false
    }
  }
}

watch(amendment, value => {
  if (!value) {
    scopeTypeIds.value = []
    scopeSubtypeIds.value = []
    durationDates.value = null
    changeRisk.value = false
    proposedRiskScoreSelection.value = undefined
    return
  }
  changeRisk.value = value.egcs_fc_changerisk
  proposedRiskScoreSelection.value = value.egcs_fc_proposedriskscore === null || value.egcs_fc_proposedriskscore === undefined
    ? undefined
    : String(value.egcs_fc_proposedriskscore)
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
  const generation = amendmentActionGeneration
  const isCurrent = () => ownsAmendmentPage() && generation === amendmentActionGeneration && requestId === scopeSubtypeFilterRequest
  if (typeIds.length === 0) {
    scopeSubtypeIds.value = []
    return
  }

  try {
    const response = await fetchAmendmentSubtypes(
      `/api/agreements/${agreementId}/amendments/lookups/subtypes`,
      { query: { amendment_type_ids: typeIds.join(','), amendmentId } }
    )
    if (!isCurrent()) return
    const validSubtypeIds = new Set(response.items.map(item => String(item.id)))
    scopeSubtypeIds.value = scopeSubtypeIds.value.filter(subtypeId => validSubtypeIds.has(subtypeId))
  } catch (caughtError: unknown) {
    if (isCurrent()) showError(caughtError)
  }
}

const loadRequiredScopeSubtypes = async () => {
  const typeIds = [...requiredScopeTypeIds.value]
  const requestId = ++scopeSubtypeRequirementRequest
  const generation = amendmentActionGeneration
  const isCurrent = () => ownsAmendmentPage() && generation === amendmentActionGeneration && requestId === scopeSubtypeRequirementRequest
  scopeSubtypeRequirementFailed.value = false
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
    if (!isCurrent()) return
    requiredSubtypeIdsByType.value = Object.fromEntries(subtypeResponses.map(({ typeId, response }) => [
      typeId,
      response.items.map(item => String(item.id))
    ]))
  } catch (caughtError: unknown) {
    if (isCurrent()) {
      scopeSubtypeRequirementFailed.value = true
      showError(caughtError)
    }
  }
}
watch(requiredScopeTypeIds, loadRequiredScopeSubtypes, { immediate: true })

const saveScope = async () => {
  if (!ownsAmendmentPage()
    || !canEditAmendmentScope.value
    || !isScopeLookupReady.value
    || !hasAmendmentName.value
    || scopeTypeIds.value.length === 0
    || !hasRequiredScopeSubtypes.value
    || (scopeIncludesDuration.value && !durationDatesValid.value)
    || isSavingScope.value) return
  const generation = amendmentActionGeneration
  const requestedPath = route.path
  const token = Symbol('scope-save')
  scopeSaveToken = token
  const shouldProceed = () => ownsAmendmentPage()
    && generation === amendmentActionGeneration
    && route.path === requestedPath
    && scopeSaveToken === token
    && canEditAmendmentScope.value
  try {
    isSavingScope.value = true
    const selectedTypeIds = [...scopeTypeIds.value]
    const submittedDraft = {
      egcs_fc_name_en: amendmentNameEn.value,
      egcs_fc_name_fr: amendmentNameFr.value,
      amendment_subtype_ids: [...scopeSubtypeIds.value],
      startDate: durationDates.value?.egcs_fc_proposedauthorizedassistancestartdate,
      endDate: durationDates.value?.egcs_fc_proposedauthorizedassistanceenddate
    }
    const selectedTypes = await resolveSelectedAmendmentScopeTypes(
      selectedTypeIds,
      [...amendmentTypesLookup.data.value.items, ...(amendment.value?.amendment_types ?? [])],
      page => fetchAmendmentTypes(amendmentTypesLookupEndpoint, { query: { page, limit: 100 } })
    )
    if (!shouldProceed()) return
    const selectedDomains = new Set(selectedTypes.map(type => type.egcs_tp_amended))
    const removedAreas: Array<'budget' | 'activities'> = []
    if (canSnapshotBudget.value && !selectedDomains.has('budget') && !selectedDomains.has('duration')) {
      removedAreas.push('budget')
    }
    if (canSnapshotActivities.value && !selectedDomains.has('activities')) {
      removedAreas.push('activities')
    }
    const payload = {
      egcs_fc_name_en: submittedDraft.egcs_fc_name_en,
      egcs_fc_name_fr: submittedDraft.egcs_fc_name_fr,
      amendment_type_ids: selectedTypeIds,
      amendment_subtype_ids: submittedDraft.amendment_subtype_ids,
      confirmed_scope_removals: removedAreas,
      egcs_fc_proposedauthorizedassistancestartdate: selectedDomains.has('duration')
        ? submittedDraft.startDate
        : null,
      egcs_fc_proposedauthorizedassistanceenddate: selectedDomains.has('duration')
        ? submittedDraft.endDate
        : null
    }
    if (removedAreas.length > 0) {
      const confirmed = await confirmScopeRemoval({
        title: t('agreement.amendments.remove_areas_title'),
        description: t('agreement.amendments.remove_areas_confirm', { areas: removedAreas.map(area => t(`agreement.${area}.title`)).join(', ') }),
        confirmLabel: t('agreement.amendments.remove_areas')
      })
      if (!confirmed || !shouldProceed()) return
    }
    if (!shouldProceed()) return
    await saveJson(amendmentApiBase, 'PATCH', payload)
    if (!shouldProceed()) return
    await refresh()
    if (!shouldProceed()) return
    toast.add({ title: toast.localized('common.success'), description: toast.localized('agreement.amendments.scope_updated'), color: 'success' })
  } catch (caughtError: unknown) {
    if (shouldProceed()) showError(caughtError)
  } finally {
    if (scopeSaveToken === token) {
      scopeSaveToken = null
      isSavingScope.value = false
    }
  }
}

const saveRisk = async () => {
  if (!canEditRisk.value || isSavingRisk.value) return
  try {
    isSavingRisk.value = true
    await saveJson(amendmentApiBase, 'PATCH', {
      egcs_fc_changerisk: changeRisk.value,
      egcs_fc_proposedriskscore: proposedRiskScoreSelection.value === undefined || proposedRiskScoreSelection.value === ''
        ? null
        : Number(proposedRiskScoreSelection.value)
    })
    await refreshPage()
    toast.add({ title: toast.localized('common.success'), description: toast.localized('agreement.amendments.risk_updated'), color: 'success' })
  } catch (caughtError: unknown) {
    showError(caughtError)
  } finally {
    isSavingRisk.value = false
  }
}

const cancelAmendment = async () => {
  if (!canCancelAmendment.value || isCancelling.value) return
  try {
    isCancelling.value = true
    await saveJson(`${amendmentApiBase}/cancel`, 'POST', {})
    isCancelModalOpen.value = false
    await refresh()
    toast.add({ title: toast.localized('common.success'), description: toast.localized('agreement.amendments.cancelled_success'), color: 'success' })
  } catch (caughtError: unknown) {
    showError(caughtError)
  } finally {
    isCancelling.value = false
  }
}

useFieldTooltipProvider(() => amendment.value && String(amendment.value.id) === String(route.params.amendmentId) ? { entityType: 'fundingcaseamendment', entityId: amendment.value.id } : null)
</script>

<template>
  <CommonDetailPage id="agreement-amendment-detail" v-model:collapsed="isHeroCollapsed" data-field-tooltip-context="agreement" data-field-scope="agreements.amendments" data-scope-label-en="Agreements > Amendments > General" data-scope-label-fr="Ententes > Modifications > Général" :breadcrumb-items="breadcrumbItems" class="w-full">
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

        <CommonDetailWorkspace v-model="selectedTab" data-field-container="Page navigation state, not a business input field." :items="tabs" content-test-id="agreement-amendment-detail-content">
          <section v-if="selectedTab === 'general'" class="space-y-8">
            <CommonSection :title="t('agreement.amendments.sections.details')" badge="01" :grid-cols="1">
              <div class="space-y-4">
                <div class="grid gap-4 md:grid-cols-2">
                  <UFormField data-ui-target="agreements.amendments.amendments.name_en" :label="t('agreement.amendments.name_en')">
                    <UInput v-model="amendmentNameEn" :aria-describedby="nameRequirementId" class="w-full" :disabled="!canEditAmendmentScope" />
                  </UFormField>
                  <UFormField data-ui-target="agreements.amendments.amendments.name_fr" :label="t('agreement.amendments.name_fr')">
                    <UInput v-model="amendmentNameFr" :aria-describedby="nameRequirementId" class="w-full" :disabled="!canEditAmendmentScope" />
                  </UFormField>
                </div>
                <p :id="nameRequirementId" class="text-sm text-zinc-500 dark:text-zinc-400">
                  {{ t('agreement.amendments.name_help') }}
                </p>
              </div>
            </CommonSection>

            <CommonSection :title="t('agreement.amendments.sections.scope')" badge="02" :grid-cols="1">
              <div class="space-y-4">
                <p class="text-sm text-zinc-500 dark:text-zinc-400">
                  {{ t('agreement.amendments.types_description') }}
                </p>
                <UFormField data-ui-target="agreements.amendments.amendments.types" :label="t('agreement.amendments.types')" required>
                  <CommonServerLookupMultiSelect
                    v-model="scopeTypeIds"
                    :fetch-url="`/api/agreements/${agreementId}/amendments/lookups/types?amendmentId=${encodeURIComponent(amendmentId)}`"
                    value-key="id"
                    label-en-key="egcs_tp_name_en"
                    label-fr-key="egcs_tp_name_fr"
                    :disabled="!canEditAmendmentScope"
                    required
                    @update:model-value="onScopeTypesChanged"
                    @resolved-items="onResolvedScopeTypes" />
                </UFormField>
                <UFormField v-if="scopeTypeIds.length > 0" data-ui-target="agreements.amendments.amendments.subtypes" :label="t('agreement.amendments.subtypes')" :required="scopeSubtypeRequired">
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
                <UButton v-if="scopeSubtypeRequirementFailed" :label="t('common.retry')" color="neutral" variant="ghost" @click="loadRequiredScopeSubtypes" />
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
                  <UFormField data-ui-target="agreements.amendments.agreement.authorized_assistance_start_date" :label="t('agreement.authorized_assistance_start_date')" required>
                    <CommonDatePicker
                      v-model="durationDates.egcs_fc_proposedauthorizedassistancestartdate"
                      :disabled="!canEditAmendmentScope" />
                  </UFormField>
                  <UFormField data-ui-target="agreements.amendments.agreement.authorized_assistance_end_date" :label="t('agreement.authorized_assistance_end_date')" required>
                    <CommonDatePicker
                      v-model="durationDates.egcs_fc_proposedauthorizedassistanceenddate"
                      :disabled="!canEditAmendmentScope" />
                  </UFormField>
                </div>
              </div>
            </CommonSection>
            <CommonSection
              :title="t('agreement.amendments.risk_changes')"
              :badge="scopeIncludesDuration ? '04' : '03'"
              :grid-cols="1">
              <div class="space-y-5">
                <UFormField
                  :label="t('agreement.amendments.change_risk')"
                  name="egcs_fc_changerisk"
                  :description="amendment.isCompleted ? t('agreement.amendments.risk_frozen_help') : amendment.risk_workflow_managed ? t('agreement.amendments.risk_managed_help') : t('agreement.amendments.change_risk_help')">
                  <USwitch
                    v-model="changeRisk"
                    data-testid="amendment-change-risk"
                    :disabled="!canEditRisk || isSavingRisk" />
                </UFormField>
                <UFormField
                  :label="t('agreement.amendments.proposed_risk_score')"
                  name="egcs_fc_proposedriskscore"
                  :required="changeRisk && !amendment.risk_workflow_managed"
                  :description="amendment.isCompleted ? t('agreement.amendments.risk_frozen_help') : amendment.risk_workflow_managed ? t('agreement.amendments.risk_managed_help') : t('agreement.amendments.proposed_risk_score_help')">
                  <CommonServerLookupSelect
                    v-if="canEditAmendment"
                    v-model="proposedRiskScoreSelection"
                    data-testid="amendment-risk-score-lookup"
                    :fetch-url="`${amendmentApiBase}/lookups/risk-ratings`"
                    value-key="egcs_tp_riskscore"
                    label-en-key="label_en"
                    label-fr-key="label_fr"
                    :show-value-in-label="false"
                    :disabled="!canEditRisk || !changeRisk || isSavingRisk"
                    :required="changeRisk && !amendment.risk_workflow_managed"
                    :placeholder="t('agreement.risk_score_placeholder')"
                    searchable />
                  <USelectMenu
                    v-else
                    :model-value="proposedRiskScoreSelection"
                    :items="savedRiskScoreItems"
                    value-key="value"
                    disabled
                    class="w-full"
                    :placeholder="t('agreement.risk_score_placeholder')" />
                  <UButton
                    v-if="canEditRisk && changeRisk && proposedRiskScoreSelection !== undefined"
                    type="button"
                    color="neutral"
                    variant="link"
                    size="sm"
                    icon="i-lucide-x"
                    :label="t('common.clear')"
                    :disabled="isSavingRisk"
                    @click="proposedRiskScoreSelection = undefined" />
                </UFormField>
                <CommonSaveButton
                  v-if="canEditRisk"
                  type="button"
                  :label="t('agreement.amendments.save_risk')"
                  :loading="isSavingRisk"
                  :disabled="isSavingRisk"
                  @click="saveRisk" />
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
              :show-header="false"
              :title="t('agreement.budget.title')"
              :description="t('agreement.amendments.budget_snapshot_description')">
              <template #action>
                <UButton
                  v-if="canCreateAmendmentSnapshot"
                  icon="i-lucide-copy-plus"
                  :label="t('agreement.amendments.create_budget_snapshot')"
                  class="cursor-default"
                  :loading="isCreatingBudgetSnapshot"
                  :disabled="isCreatingBudgetSnapshot"
                  @click="createSnapshot('budget')" />
              </template>
            </CommonPreActionReport>
            <AgreementBudgetTab
              v-if="amendment.has_budget_snapshot && profile"
              :agreement-id="agreementId"
              :action-target="{ kind: 'amendment', agreementId, amendmentId }"
              :currency="profile.egcs_fc_currency"
              :api-base="amendmentApiBase"
              :fiscal-year-lookup-url="`${amendmentApiBase}/budget-fiscal-years/lookups/fiscal-years`"
              :can-create="profile?.can_create_agreement_role === true"
              :can-update="profile?.can_update_agreement_role === true"
              :can-delete="profile?.can_delete_agreement_role === true"
              :can-create-fiscal-year="profile?.can_create_agreement_role === true"
              :can-update-fiscal-year="profile?.can_update_agreement_role === true"
              :can-delete-fiscal-year="profile?.can_delete_agreement_role === true"
              :allow-delete-fiscal-year-with-lines="isBudgetAmendment || isDurationAmendment" />
          </section>

          <section v-else-if="selectedTab === 'activities'" class="w-full min-w-0 space-y-6">
            <CommonPreActionReport
              v-if="!amendment.has_activity_snapshot"
              :show-header="false"
              :title="t('agreement.activities.title')"
              :description="t('agreement.amendments.activity_snapshot_description')">
              <template #action>
                <UButton
                  v-if="canCreateAmendmentSnapshot"
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
              :action-target="{ kind: 'amendment', agreementId, amendmentId }"
              :api-base="amendmentApiBase"
              :can-create="profile?.can_create_agreement_role === true"
              :can-update="profile?.can_update_agreement_role === true"
              :can-delete="profile?.can_delete_agreement_role === true" />
          </section>

          <section v-else-if="selectedTab === 'recommendation'" class="space-y-6">
            <CommonCompletionPanel
              entity-type="fundingcaseamendment"
              :entity-id="amendmentId"
              :can-complete="canEditAmendment"
              :can-work-workflow="isAssigned"
              :refresh-key="approvalsRefreshKey"
              :show-header="false"
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

          <div v-else-if="selectedTab === 'risk-rating'" class="space-y-4">
            <UAlert
              :title="t('agreement.risk_rating_workflow')"
              :description="amendment.isCompleted ? t('agreement.amendments.risk_frozen_help') : amendment.risk_workflow_managed ? t('agreement.amendments.risk_managed_help') : t('agreement.amendments.risk_manual_help')"
              :icon="amendment.risk_workflow_managed ? 'i-lucide-workflow' : 'i-lucide-pencil'" />
            <CommonSection :show-header="false" :title="t('agreement.risk_rating_workflow')" :grid-cols="1">
              <dl class="grid gap-3 md:grid-cols-2">
                <div>
                  <dt class="text-sm text-muted">
                    {{ t('agreement.amendments.proposed_risk_score') }}
                  </dt>
                  <dd>{{ formatRiskScore(amendment.egcs_fc_proposedriskscore) }}</dd>
                </div>
                <div>
                  <dt class="text-sm text-muted">
                    {{ t('agreement.amendments.change_risk') }}
                  </dt>
                  <dd>{{ amendment.egcs_fc_changerisk ? t('common.yes') : t('common.no') }}</dd>
                </div>
                <template v-if="amendment.latest_risk_rating_run">
                  <div>
                    <dt class="text-sm text-muted">
                      {{ t('agreement.risk_rating_workflow_name') }}
                    </dt>
                    <dd>{{ getLocalizedWorkflowName(amendment.latest_risk_rating_run.workflowName) }}</dd>
                  </div>
                  <div>
                    <dt class="text-sm text-muted">
                      {{ t('agreement.risk_rating_run_status') }}
                    </dt>
                    <dd><CommonLifecycleBadge engine="runtime" :state="amendment.latest_risk_rating_run.status" /></dd>
                  </div>
                  <div>
                    <dt class="text-sm text-muted">
                      {{ t('agreement.risk_rating_assessment_score') }}
                    </dt>
                    <dd>{{ formatRiskScore(amendment.latest_risk_rating_run.assessmentScore) }}</dd>
                  </div>
                  <div>
                    <dt class="text-sm text-muted">
                      {{ t('agreement.risk_rating_mapped_score') }}
                    </dt>
                    <dd>{{ formatRiskScore(amendment.latest_risk_rating_run.mappedRating?.score) }}</dd>
                  </div>
                  <div>
                    <dt class="text-sm text-muted">
                      {{ t('agreement.risk_rating_completed') }}
                    </dt>
                    <dd>{{ formatDate(amendment.latest_risk_rating_run.completedAt) }}</dd>
                  </div>
                </template>
              </dl>
            </CommonSection>
            <CommonWorkflowSection
              entity-type="fundingcaseamendment"
              :entity-id="amendmentId"
              purpose="risk_rating"
              :can-edit="canEditAmendment && !amendment.isCompleted"
              @changed="refreshPage" />
          </div>

          <CommonReviewsTab
            v-else-if="selectedTab === 'reviews'"
            entity-type="fundingcaseamendment"
            :entity-id="amendmentId"
            :can-update="canEditAmendment"
            @changed="refreshPage" />

          <CommonWorkflowSection
            v-else-if="selectedTab === 'workflows'"
            entity-type="fundingcaseamendment"
            :entity-id="amendmentId"
            purpose="standard"
            :can-edit="isAssigned"
            :refresh-key="approvalsRefreshKey"
            @changed="refreshPage" />

          <CommonWorkflowSupplementaryInformation
            v-else-if="selectedTab === 'supplementary-information'"
            :show-header="false"
            entity-type="fundingcaseamendment"
            :entity-id="amendmentId" />

          <CommonAssignedUsers
            v-else-if="selectedTab === 'assignments'"
            :show-header="false"
            entity-type="fundingcaseamendment"
            :entity-id="amendmentId" />
          <AgreementDocumentsTab
            v-else-if="selectedTab === 'documents' && profile?.can_read_agreement"
            :agreement-id="agreementId"
            :amendment-id="amendmentId"
            :can-create="profile?.can_create_agreement_role === true"
            :can-delete="profile?.can_delete_agreement_role === true" />
          <CommonAttachmentsTab
            v-else-if="selectedTab === 'attachments'"
            entity-type="fundingcaseamendment"
            :entity-id="amendmentId" />
        </CommonDetailWorkspace>
      </div>

      <div v-else-if="isLoadingDetail" role="status" aria-live="polite" class="sr-only">
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
  </CommonDetailPage>
</template>
