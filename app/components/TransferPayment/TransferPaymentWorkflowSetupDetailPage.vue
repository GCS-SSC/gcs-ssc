<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- page-local navigation and save handlers */
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { FetchError } from 'ofetch'
import type { z } from 'zod'
import type { Scope } from '~~/shared/utils/scopes'
import type { TranslatedTabItem } from '~~/shared/types/ui'
import type { TransferPaymentProfileItem, TransferPaymentStreamItem } from '~~/shared/types/schemas'
import { CommonWorkflowSetupCreateSchema, CommonWorkflowSetupMemberCreateSchema } from '~~/shared/types/schemas'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'
import { applyCurrentWorkflowMemberSelection } from '~/utils/workflow-member-selection'
import type { EditorMutationToken } from '~/composables/useEditorMutationCoordinator'
import { useEditorMutationCoordinator } from '~/composables/useEditorMutationCoordinator'

type WorkflowSetupItem = z.infer<typeof CommonWorkflowSetupCreateSchema> & { id: string }
type WorkflowSetupDetail = WorkflowSetupItem & {
  entityTypeLabelEn: string
  entityTypeLabelFr: string
  publicationId: string
  publicationState: PublicationState
  publicationVersionId: string | null
  publicationVersion: number | null
  hasUnpublishedChanges: boolean
  members: WorkflowMember[]
}
type WorkflowMember = {
  id: string
  egcs_cn_sequence: number
  egcs_cn_kind: 'review_set' | 'recommendation_set' | 'approval_template'
  egcs_cn_reviewset?: string
  egcs_cn_recommendationset?: string
  egcs_cn_approvaltemplate?: string
  egcs_cn_materializationstatus?: string | null
  egcs_cn_successstatus?: string | null
  egcs_cn_failurestatus?: string | null
  egcs_cn_allowownerredirect: boolean
  owners?: Array<{ egcs_cn_reviewsetup?: string, egcs_cn_recommendationsetup?: string, egcs_cn_defaultowner?: string }>
}
type WorkflowMemberForm = Omit<WorkflowMember, 'id'> & { id?: string }
type NestedMember = { id: string, egcs_cn_name_en?: string, egcs_cn_name_fr?: string }

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { can } = useCan()
const { getHeroCollapsed } = useDashboard()
const { getBilingualValue } = useBilingualValue()
const { showError } = useApiErrorToast()
const { createValidator } = useZodI18n()
const toast = useToast()

const transferPaymentId = route.params.id as string
const streamId = route.params.streamId as string
const workflowSetupId = route.params.workflowSetupId as string
const endpoint = `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/workflow-setups/${workflowSetupId}`

const { data: profile } = await useFetch<TransferPaymentProfileItem, FetchError, string>(`/api/transfer-payments/${transferPaymentId}`)
const { data: stream } = await useFetch<TransferPaymentStreamItem, FetchError, string>(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}`)
const { data: setup, error: loadError, status: loadStatus, refresh } = await useFetch<WorkflowSetupDetail, FetchError, string>(endpoint)
const detailContent = useTemplateRef<HTMLElement>('detailContent')
const cloneSetup = (value: WorkflowSetupDetail): WorkflowSetupDetail => ({
  ...value,
  egcs_cn_allowedstartstatuses: [...value.egcs_cn_allowedstartstatuses],
  members: value.members.map(member => ({
    ...member,
    owners: member.owners?.map(owner => ({ ...owner }))
  }))
})
const state: Ref<WorkflowSetupDetail | null> = ref(setup.value ? cloneSetup(setup.value) : null)
const isMemberOpen: Ref<boolean> = ref(false)
const selectedMember: Ref<WorkflowMemberForm | null> = ref(null)
const nestedMembers: Ref<NestedMember[]> = ref([])
const selectedSection: Ref<string> = ref('workflow-identity')
const isHeroCollapsed = getHeroCollapsed('transfer-payment-workflow-setup-detail')
const profileScope = computed<Scope>(() => ({
  type: 'entity',
  agencyId: String(profile.value?.egcs_tp_agency),
  path: [{ type: 'transfer_payment', id: transferPaymentId }]
}))
const agencyId = computed(() => String(profile.value?.egcs_tp_agency ?? ''))
const canManagePublication = computed(() => Boolean(profile.value) && can('transfer_payment', 'update', profileScope.value))
const canUpdate = computed(() => canManagePublication.value && state.value?.publicationState !== 'retired')
const canDelete = computed(() => Boolean(profile.value) && can('transfer_payment', 'delete', profileScope.value))
const isLoadRetrying = computed(() => loadStatus.value === 'pending')
const validate = createValidator(CommonWorkflowSetupCreateSchema)
const validateMember = createValidator(CommonWorkflowSetupMemberCreateSchema)
const approvalSubmissionEntityTypes = new Set([
  'fundingcaseagreement', 'fundingcaseamendment', 'fundingcaseagreementcloseout',
  'fundingcaseagreementclaim', 'fundingclaimreconcile', 'fundingcaseagreementcommitment',
  'fundingcasepayment', 'fundingcaseforecast', 'fundingcasemonitor'
])
const purposeOptions = computed(() => [
  { value: 'standard', label: t('workflow.purposes.standard') },
  ...(approvalSubmissionEntityTypes.has(state.value?.egcs_cn_entitytype ?? '')
    ? [{ value: 'approval_submission', label: t('workflow.purposes.approval_submission') }]
    : []),
  ...(state.value?.egcs_cn_entitytype === 'fundingcaseagreement'
    ? [{ value: 'risk_rating', label: t('workflow.purposes.risk_rating') }]
    : [])
])
watch(() => state.value?.egcs_cn_entitytype, entityType => {
  if (state.value?.egcs_cn_purpose === 'approval_submission' && !approvalSubmissionEntityTypes.has(entityType ?? '')) {
    state.value.egcs_cn_purpose = 'standard'
  }
  if (state.value?.egcs_cn_purpose === 'risk_rating' && entityType !== 'fundingcaseagreement') {
    state.value.egcs_cn_purpose = 'standard'
  }
})
const approvalTemplateQuery = computed(() => ({
  scopeType: 'transferpaymentstream', scopeId: streamId
}))
const recommendationSetQuery = computed(() => ({
  limit: 100
}))
const reviewSetQuery = computed(() => ({
  limit: 100,
  ...(state.value?.egcs_cn_entitytype ? { entityType: state.value.egcs_cn_entitytype } : {})
}))
const backTo = computed(() => localePath(appRouteLocations.transferPaymentStreamDetail(transferPaymentId, streamId, { section: 'workflow-setups' })))
const breadcrumbItems = computed(() => [
  { label: t('transfer_payment.title'), to: localePath(appRouteLocations.transferPayments()) },
  { label: getBilingualValue(profile.value, 'egcs_tp_name'), to: localePath(appRouteLocations.transferPaymentDetail(transferPaymentId)) },
  { label: getBilingualValue(stream.value, 'egcs_tp_name'), to: backTo.value },
  { label: getBilingualValue(state.value, 'egcs_cn_name') }
])
const sectionTabs = computed<TranslatedTabItem[]>(() => [
  { key: 'workflow.identity', icon: 'i-lucide-file-text', value: 'workflow-identity' },
  { key: 'workflow.routing', icon: 'i-lucide-git-branch', value: 'workflow-routing' },
  { key: 'workflow.transitions', icon: 'i-lucide-arrow-right-left', value: 'workflow-transitions' },
  { key: 'workflow.behaviour', icon: 'i-lucide-settings-2', value: 'workflow-behaviour' }
])
const buildSetupPayload = () => state.value
  ? {
      egcs_cn_scopetype: state.value.egcs_cn_scopetype,
      egcs_cn_scopeid: state.value.egcs_cn_scopeid,
      egcs_cn_entitytype: state.value.egcs_cn_entitytype,
      egcs_cn_name_en: state.value.egcs_cn_name_en,
      egcs_cn_name_fr: state.value.egcs_cn_name_fr,
      egcs_cn_description_en: state.value.egcs_cn_description_en,
      egcs_cn_description_fr: state.value.egcs_cn_description_fr,
      egcs_cn_purpose: state.value.egcs_cn_purpose,
      egcs_cn_allowedstartstatuses: state.value.egcs_cn_allowedstartstatuses,
      egcs_cn_cancellationstatus: state.value.egcs_cn_cancellationstatus,
      egcs_cn_executionfailurestatus: state.value.egcs_cn_executionfailurestatus,
      egcs_cn_allowretry: state.value.egcs_cn_allowretry
    }
  : null
const mutation = useEditorMutationCoordinator({ getDraft: buildSetupPayload })
const initialSetup = setup.value
if (initialSetup) {
  mutation.replaceSessionDraft(() => {
    state.value = cloneSetup(initialSetup)
  })
}
const isSaving = computed(() => mutation.isActionPending('save'))
const isPublishing = computed(() => mutation.isActionPending('publish'))
const isRetiring = computed(() => mutation.isActionPending('retire'))
const isMemberSaving = computed(() => mutation.isActionPending('save-member'))
const isNestedMembersLoading = ref(false)
const nestedMembersError = ref<unknown>(null)
let nestedMembersGeneration = 0
const canEditFields = computed(() => canUpdate.value && !mutation.isPending.value)
watch(selectedSection, sectionId => {
  if (import.meta.client) document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})
const retryLoad = async () => {
  await refresh()
  const refreshedSetup = setup.value
  if (refreshedSetup && !loadError.value) {
    mutation.replaceSessionDraft(() => {
      state.value = cloneSetup(refreshedSetup)
    })
    await nextTick()
    detailContent.value?.focus()
  }
}

const showPreservedDraft = () => toast.add({
  title: t('common.warning'),
  description: t('common.newer_changes_preserved'),
  color: 'warning'
})
const blockDirtyAction = () => {
  if (!mutation.isDirty.value) return false
  toast.add({
    title: t('common.warning'),
    description: t('common.save_changes_before_action'),
    color: 'warning'
  })
  return true
}
const mergeMemberMetadata = (value: WorkflowSetupDetail) => {
  if (!state.value) return
  state.value.members = cloneSetup(value).members
  state.value.publicationId = value.publicationId
  state.value.publicationState = value.publicationState
  state.value.publicationVersionId = value.publicationVersionId
  state.value.publicationVersion = value.publicationVersion
  state.value.hasUnpublishedChanges = value.hasUnpublishedChanges
}
const refreshForMutation = async (token: EditorMutationToken) => {
  await refresh()
  const refreshedSetup = setup.value
  if (!refreshedSetup) return false
  return mutation.applyMutationRefresh(token, {
    apply: () => { state.value = cloneSetup(refreshedSetup) },
    mergeMetadata: () => mergeMemberMetadata(refreshedSetup)
  })
}
const persistSetup = async (token: EditorMutationToken, showSuccess: boolean) => {
  const body = buildSetupPayload()
  if (!body) return false
  const response = await fetch(getClientRequestUrl(endpoint), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) await throwFetchResponseError(response)
  if (!await refreshForMutation(token)) {
    if (mutation.isTokenCurrent(token)) showPreservedDraft()
    return false
  }
  if (showSuccess) {
    toast.add({ title: t('common.success'), description: t('workflow.saved'), color: 'success' })
  }
  return true
}

const save = async () => {
  if (!state.value || mutation.isPending.value || !canUpdate.value) return
  await mutation.run('save', async token => {
    try {
      await persistSetup(token, true)
    } catch (error) {
      showError(error)
    }
  })
}

const performPublicationAction = async (action: 'publish' | 'retire') => {
  if (mutation.isPending.value || !canManagePublication.value || state.value?.publicationState === 'retired') return
  if (action === 'retire' && blockDirtyAction()) return
  await mutation.run(action, async token => {
    try {
      if (action === 'publish' && mutation.isDirty.value && !await persistSetup(token, false)) return
      const response = await fetch(getClientRequestUrl(`${endpoint}/${action}`), { method: 'POST' })
      if (!response.ok) await throwFetchResponseError(response)
      if (!await refreshForMutation(token)) {
        if (mutation.isTokenCurrent(token)) showPreservedDraft()
        return
      }
      toast.add({ title: t('common.success'), description: t(`workflow.${action === 'publish' ? 'published' : 'retired'}`), color: 'success' })
    } catch (error) {
      showError(error)
    }
  })
}
const publish = () => performPublicationAction('publish')
const retire = () => performPublicationAction('retire')
const memberKinds = computed(() => [
  { value: 'review_set', label: t('workflow.review_set') },
  { value: 'recommendation_set', label: t('workflow.recommendation_set') },
  { value: 'approval_template', label: t('workflow.source_approval_template') }
])
const openMember = (member?: WorkflowMember) => {
  if (!canUpdate.value || mutation.isPending.value || blockDirtyAction()) return
  selectedMember.value = member
    ? { ...member }
    : {
        egcs_cn_sequence: (state.value?.members.length ?? 0) + 1,
        egcs_cn_kind: 'review_set', egcs_cn_allowownerredirect: false
      }
  isMemberOpen.value = true
}
watch(() => [selectedMember.value?.egcs_cn_kind, selectedMember.value?.egcs_cn_reviewset, selectedMember.value?.egcs_cn_recommendationset], async () => {
  const generation = ++nestedMembersGeneration
  const member = selectedMember.value
  nestedMembers.value = []
  nestedMembersError.value = null
  if (member) member.owners = []
  if (!member || member.egcs_cn_kind === 'approval_template') {
    return
  }
  const referenceId = member.egcs_cn_kind === 'review_set' ? member.egcs_cn_reviewset : member.egcs_cn_recommendationset
  if (!referenceId) {
    return
  }
  isNestedMembersLoading.value = true
  try {
    const requestedKind = member.egcs_cn_kind
    const requestedReferenceId = String(referenceId)
    const resource = requestedKind === 'review_set' ? 'review-setups' : 'recommendation-setups'
    await applyCurrentWorkflowMemberSelection(
      { kind: requestedKind, referenceId: requestedReferenceId },
      async () => {
        const request = await fetch(getClientRequestUrl(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/${resource}/${referenceId}`))
        if (!request.ok) await throwFetchResponseError(request)
        return await request.json() as { members: NestedMember[] }
      },
      () => {
        const current = selectedMember.value
        if (!current || current.egcs_cn_kind === 'approval_template') return null
        const currentReferenceId = current.egcs_cn_kind === 'review_set'
          ? current.egcs_cn_reviewset
          : current.egcs_cn_recommendationset
        return { kind: current.egcs_cn_kind, referenceId: String(currentReferenceId) }
      },
      response => {
        const current = selectedMember.value!
        nestedMembers.value = response.members
        current.owners = response.members.map((nested: NestedMember) => {
          const existing = current.owners?.find(owner => String(owner.egcs_cn_reviewsetup ?? owner.egcs_cn_recommendationsetup) === String(nested.id))
          return {
            ...(current.egcs_cn_kind === 'review_set' ? { egcs_cn_reviewsetup: String(nested.id) } : { egcs_cn_recommendationsetup: String(nested.id) }),
            ...(existing?.egcs_cn_defaultowner ? { egcs_cn_defaultowner: existing.egcs_cn_defaultowner } : {})
          }
        })
      }
    )
  } catch (error) {
    if (generation === nestedMembersGeneration) {
      nestedMembersError.value = error
      showError(error)
    }
  } finally {
    if (generation === nestedMembersGeneration) isNestedMembersLoading.value = false
  }
})
const saveMember = async () => {
  if (!selectedMember.value || !canUpdate.value || mutation.isPending.value || isNestedMembersLoading.value || nestedMembersError.value || blockDirtyAction()) return
  await mutation.run('save-member', async token => {
    try {
      const member = selectedMember.value
      if (!member) return
      const url = `${endpoint}/members${member.id ? `/${member.id}` : ''}`
      const response = await fetch(getClientRequestUrl(url), {
        method: member.id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(member)
      })
      if (!response.ok) await throwFetchResponseError(response)
      if (!await refreshForMutation(token)) return
      isMemberOpen.value = false
    } catch (error) {
      showError(error)
    }
  })
}
const moveMember = async (member: WorkflowMember, sequence: number) => {
  if (!canUpdate.value || mutation.isPending.value || blockDirtyAction()) return
  if (sequence < 1 || sequence > (state.value?.members.length ?? 0)) return
  await mutation.run('move-member', async token => {
    try {
      const response = await fetch(getClientRequestUrl(`${endpoint}/members/${member.id}`), {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ egcs_cn_sequence: sequence })
      })
      if (!response.ok) await throwFetchResponseError(response)
      await refreshForMutation(token)
    } catch (error) { showError(error) }
  })
}
const deleteMember = async (member: WorkflowMember) => {
  if (!canUpdate.value || !canDelete.value || mutation.isPending.value || blockDirtyAction()) return
  await mutation.run('delete-member', async token => {
    try {
      const response = await fetch(getClientRequestUrl(`${endpoint}/members/${member.id}`), { method: 'DELETE' })
      if (!response.ok) await throwFetchResponseError(response)
      await refreshForMutation(token)
    } catch (error) { showError(error) }
  })
}
</script>

<template>
  <UDashboardPanel id="transfer-payment-workflow-setup-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral" variant="ghost" :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
              :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')" class="cursor-default" @click="isHeroCollapsed = !isHeroCollapsed" />
            <CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div
        v-if="loadError"
        class="p-6"
        data-testid="design-time-detail-load-error"
        role="alert"
        :aria-label="t('common.configuration_load_failed')">
        <UAlert
          color="error"
          icon="i-lucide-circle-alert"
          :title="t('common.configuration_load_failed')"
          :description="t('common.configuration_load_failed_description')">
          <template #actions>
            <UButton
              color="error"
              variant="soft"
              size="sm"
              icon="i-lucide-refresh-cw"
              :label="t('common.retry')"
              :loading="isLoadRetrying"
              :disabled="isLoadRetrying"
              @click="retryLoad" />
          </template>
        </UAlert>
      </div>
      <div
        v-else-if="state"
        ref="detailContent"
        class="flex flex-1 flex-col"
        data-testid="design-time-detail-content"
        role="region"
        :aria-label="getBilingualValue(state, 'egcs_cn_name')"
        tabindex="-1">
        <TransferPaymentWorkflowSetupDetailHero
          :is-collapsed="isHeroCollapsed"
          :name="getBilingualValue(state, 'egcs_cn_name')"
          :entity-type="state.egcs_cn_entitytype"
          :entity-type-label-en="state.entityTypeLabelEn"
          :entity-type-label-fr="state.entityTypeLabelFr"
          :publication-version="state.publicationVersion"
          :publication-state="state.publicationState"
          :has-unpublished-changes="state.hasUnpublishedChanges"
          :is-publishing="isPublishing"
          :is-retiring="isRetiring"
          :is-mutation-pending="mutation.isPending.value"
          :can-manage="canManagePublication"
          @publish="publish"
          @retire="retire" />

        <UForm :state="state" :validate="validate" class="flex min-h-0 flex-1 flex-col gap-6 overflow-visible px-6 pt-0 pb-6 lg:flex-row lg:gap-0" @submit="save">
          <AssessmentSchemaDetailSidebar
            v-if="canUpdate"
            v-model="selectedSection"
            :section-tabs="sectionTabs"
            :is-saving="isSaving"
            :disabled="mutation.isPending.value"
            :ui="{ trigger: 'w-full justify-start whitespace-normal break-words text-left' }"
            @save="save" />
          <aside v-else class="w-full shrink-0 lg:sticky lg:top-6 lg:self-start lg:w-72 lg:border-r lg:border-zinc-200 lg:pr-4 dark:lg:border-zinc-800">
            <div class="pt-6">
              <CommonRouteTabs
                v-model="selectedSection"
                :items="sectionTabs"
                orientation="vertical"
                :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
            </div>
          </aside>

          <main class="min-h-0 min-w-0 flex-1 pt-6 lg:pl-6">
            <div class="w-full space-y-10 pb-12">
              <AssessmentSchemaPageSection section-id="workflow-identity" :title="t('workflow.identity')">
                <div class="grid gap-5 md:grid-cols-2">
                  <UFormField :label="t('transfer_payment.name_en')" name="egcs_cn_name_en">
                    <UInput v-model="state.egcs_cn_name_en" :disabled="!canEditFields" class="w-full" />
                  </UFormField>
                  <UFormField :label="t('transfer_payment.name_fr')" name="egcs_cn_name_fr">
                    <UInput v-model="state.egcs_cn_name_fr" :disabled="!canEditFields" class="w-full" />
                  </UFormField>
                  <UFormField :label="t('transfer_payment.description_en')" name="egcs_cn_description_en">
                    <CommonTextarea v-model="state.egcs_cn_description_en" :disabled="!canEditFields" />
                  </UFormField>
                  <UFormField :label="t('transfer_payment.description_fr')" name="egcs_cn_description_fr">
                    <CommonTextarea v-model="state.egcs_cn_description_fr" :disabled="!canEditFields" />
                  </UFormField>
                </div>
              </AssessmentSchemaPageSection>

              <AssessmentSchemaPageSection section-id="workflow-routing" :title="t('workflow.routing')">
                <div class="grid gap-5 lg:grid-cols-2">
                  <UFormField :label="t('transfer_payment.entity_type')" name="egcs_cn_entitytype">
                    <CommonEnumSelect v-model="state.egcs_cn_entitytype" name="transfer_payment_review_setup_entity_type" :disabled="!canEditFields" class="w-full" />
                  </UFormField>
                  <UFormField :label="t('workflow.purpose')" name="egcs_cn_purpose" :description="t('workflow.purpose_help')">
                    <CommonEnumSelect v-model="state.egcs_cn_purpose" name="workflow_purpose" :items="purposeOptions" :disabled="!canEditFields" class="w-full" />
                  </UFormField>
                </div>
                <div class="mt-6 space-y-3">
                  <div class="flex items-center justify-between">
                    <h3 class="font-medium">
                      {{ t('workflow.members') }}
                    </h3>
                    <UButton v-if="canUpdate" icon="i-lucide-plus" :label="t('workflow.add_member')" :disabled="!canEditFields" @click="openMember()" />
                  </div>
                  <div v-if="state.members.length" class="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                    <div v-for="member in state.members" :key="member.id" class="flex items-center gap-3 p-3">
                      <span class="w-8 text-sm text-zinc-500">{{ member.egcs_cn_sequence }}</span>
                      <span class="min-w-0 flex-1">{{ memberKinds.find(item => item.value === member.egcs_cn_kind)?.label }}</span>
                      <CommonStatusBadge v-if="member.egcs_cn_materializationstatus" :status-id="member.egcs_cn_materializationstatus" />
                      <CommonStatusBadge v-if="member.egcs_cn_successstatus" :status-id="member.egcs_cn_successstatus" />
                      <CommonStatusBadge v-if="member.egcs_cn_failurestatus" :status-id="member.egcs_cn_failurestatus" />
                      <template v-if="canUpdate">
                        <UButton
                          icon="i-lucide-arrow-up" color="neutral" variant="ghost"
                          :aria-label="t('workflow.move_member_up', { sequence: member.egcs_cn_sequence })"
                          :disabled="mutation.isPending.value || member.egcs_cn_sequence === 1" @click="moveMember(member, member.egcs_cn_sequence - 1)" />
                        <UButton
                          icon="i-lucide-arrow-down" color="neutral" variant="ghost"
                          :aria-label="t('workflow.move_member_down', { sequence: member.egcs_cn_sequence })"
                          :disabled="mutation.isPending.value || member.egcs_cn_sequence === state.members.length" @click="moveMember(member, member.egcs_cn_sequence + 1)" />
                        <UButton
                          icon="i-lucide-pencil" color="neutral" variant="ghost"
                          :aria-label="t('workflow.edit_member_sequence', { sequence: member.egcs_cn_sequence })"
                          :disabled="mutation.isPending.value"
                          @click="openMember(member)" />
                        <UButton
                          v-if="canDelete" icon="i-lucide-trash-2" color="error" variant="ghost"
                          :aria-label="t('workflow.delete_member', { sequence: member.egcs_cn_sequence })"
                          :disabled="mutation.isPending.value"
                          @click="deleteMember(member)" />
                      </template>
                    </div>
                  </div>
                  <p v-else class="text-sm text-zinc-500">
                    {{ t('workflow.no_members') }}
                  </p>
                </div>
              </AssessmentSchemaPageSection>

              <AssessmentSchemaPageSection section-id="workflow-transitions" :title="t('workflow.transitions')">
                <div class="space-y-5">
                  <UFormField :label="t('workflow.allowed_start_statuses')" name="egcs_cn_allowedstartstatuses" :description="t('workflow.allowed_start_statuses_help')">
                    <CommonStatusSelect v-model="state.egcs_cn_allowedstartstatuses" :agency-id="agencyId" multiple :disabled="!canEditFields" class="w-full" />
                  </UFormField>
                  <div class="grid gap-5 lg:grid-cols-2">
                    <UFormField :label="t('workflow.cancellation_status')" name="egcs_cn_cancellationstatus">
                      <CommonStatusSelect v-model="state.egcs_cn_cancellationstatus" :agency-id="agencyId" :disabled="!canEditFields" class="w-full" />
                    </UFormField>
                    <UFormField :label="t('workflow.execution_failure_status')" name="egcs_cn_executionfailurestatus">
                      <CommonStatusSelect v-model="state.egcs_cn_executionfailurestatus" :agency-id="agencyId" :disabled="!canEditFields" class="w-full" />
                    </UFormField>
                  </div>
                </div>
              </AssessmentSchemaPageSection>

              <AssessmentSchemaPageSection section-id="workflow-behaviour" :title="t('workflow.behaviour')">
                <div class="space-y-5">
                  <UFormField :label="t('workflow.allow_retry')" name="egcs_cn_allowretry" :description="t('workflow.allow_retry_help')">
                    <USwitch v-model="state.egcs_cn_allowretry" :disabled="!canEditFields" />
                  </UFormField>
                </div>
              </AssessmentSchemaPageSection>
            </div>
          </main>
        </UForm>
      </div>
    </template>
  </UDashboardPanel>
  <UModal
    v-if="!loadError"
    v-model:open="isMemberOpen"
    :title="selectedMember?.id ? t('workflow.edit_member') : t('workflow.add_member')"
    :ui="{ content: 'sm:max-w-4xl' }">
    <template #body>
      <UForm v-if="selectedMember" :state="selectedMember" :validate="validateMember" @submit="saveMember">
        <fieldset :disabled="mutation.isPending.value || isNestedMembersLoading" class="space-y-4">
          <UFormField :label="t('workflow.member_kind')" name="egcs_cn_kind">
            <CommonEnumSelect v-model="selectedMember.egcs_cn_kind" name="workflow_member_kind" :items="memberKinds" :disabled="Boolean(selectedMember.id)" class="w-full" />
          </UFormField>
          <AdminCommonLookupField
            v-if="selectedMember.egcs_cn_kind === 'review_set'" v-model="selectedMember.egcs_cn_reviewset"
            :label="t('workflow.review_set')" name="egcs_cn_reviewset"
            :fetch-url="`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/review-setups`"
            value-key="id" label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr" :query="reviewSetQuery" />
          <AdminCommonLookupField
            v-else-if="selectedMember.egcs_cn_kind === 'recommendation_set'" v-model="selectedMember.egcs_cn_recommendationset"
            :label="t('workflow.recommendation_set')" name="egcs_cn_recommendationset"
            :fetch-url="`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/recommendation-setups`"
            value-key="id" label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr" :query="recommendationSetQuery" />
          <AdminCommonLookupField
            v-else v-model="selectedMember.egcs_cn_approvaltemplate"
            :label="t('workflow.source_approval_template')" name="egcs_cn_approvaltemplate"
            fetch-url="/api/approval-templates" value-key="id" label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr"
            :query="approvalTemplateQuery" />
          <div class="grid gap-4 md:grid-cols-3">
            <UFormField :label="t('workflow.materialization_status')" name="egcs_cn_materializationstatus">
              <CommonStatusSelect v-model="selectedMember.egcs_cn_materializationstatus" :agency-id="agencyId" allow-empty :empty-label="t('workflow.no_change')" class="w-full" />
            </UFormField>
            <UFormField :label="t('workflow.success_status')" name="egcs_cn_successstatus">
              <CommonStatusSelect v-model="selectedMember.egcs_cn_successstatus" :agency-id="agencyId" allow-empty :empty-label="t('workflow.no_change')" class="w-full" />
            </UFormField>
            <UFormField :label="t('workflow.failure_status')" name="egcs_cn_failurestatus">
              <CommonStatusSelect v-model="selectedMember.egcs_cn_failurestatus" :agency-id="agencyId" allow-empty :empty-label="t('workflow.no_change')" class="w-full" />
            </UFormField>
          </div>
          <UFormField v-if="selectedMember.egcs_cn_kind !== 'approval_template'" :label="t('workflow.allow_owner_redirect')">
            <USwitch v-model="selectedMember.egcs_cn_allowownerredirect" />
          </UFormField>
          <div v-if="selectedMember.egcs_cn_kind !== 'approval_template' && nestedMembers.length" class="space-y-3">
            <h3 class="font-medium">
              {{ t('workflow.default_owners') }}
            </h3>
            <UFormField
              v-for="(nested, index) in nestedMembers" :key="nested.id"
              :label="getBilingualValue(nested, 'egcs_cn_name') || `${t('workflow.step')} ${index + 1}`"
              :description="t('workflow.default_owner_help')">
              <CommonServerLookupSelect
                v-model="selectedMember.owners![index]!.egcs_cn_defaultowner"
                :fetch-url="`/api/users/lookups?workflowSetupId=${workflowSetupId}&status=active`"
                value-key="id" label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr" />
            </UFormField>
          </div>
          <div class="flex justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isMemberOpen = false" />
            <CommonSaveButton :label="t('common.save')" :loading="isMemberSaving || isNestedMembersLoading" :disabled="mutation.isPending.value || isNestedMembersLoading || Boolean(nestedMembersError)" />
          </div>
        </fieldset>
      </UForm>
    </template>
  </UModal>
</template>
