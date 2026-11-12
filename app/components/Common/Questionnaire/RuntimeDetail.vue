<script setup lang="ts">
import { useFieldTooltipProvider } from '~/composables/useFieldTooltipProvider'
import { usePageResourceError } from '~/composables/usePageResourceError'
/* eslint-disable jsdoc/require-jsdoc -- concise page-local interaction handlers are self-documenting */
import { computed, defineComponent, Fragment, h, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { GuideObservedContext } from '@gcs-ssc/guided-help/runtime'
import type { JsonValue } from '~~/shared/types/database'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import { appRouteLocations } from '~/utils/route-locations'
import type { QuestionnaireDefinition, QuestionnaireResponse } from '~~/shared/types/schemas/questionnaire'
import { QuestionnaireDefinitionSchema, QuestionnaireResponsesSchema } from '~~/shared/types/schemas/questionnaire'
import { copyQuestionnaireResponses, QuestionnaireMutationResultSchema } from '~/utils/questionnaire-runtime'
import type { QuestionnaireRuntimeConfiguration } from '~/utils/questionnaire-runtime'
import QuestionnaireRuntimeShell from './RuntimeShell.vue'
import { useActionContext } from '~/composables/useActionContext'

type QuestionnaireRuntimeDetail = {
  id: string
  runtimeId: string
  runtimeItemId: string
  runtimeState: RuntimeState
  attempt: number
  previousRuntimeId: string | null
  publicationVersionId: string
  publicationVersion: number
  egcs_cn_outcome?: string | null
  egcs_cn_response: { responses?: QuestionnaireResponse[] }
  egcs_cn_revision: number
  definition: QuestionnaireDefinition
  name_en: string
  name_fr: string
  can_claim: boolean
  can_read: boolean
  can_update: boolean
  can_update_role: boolean
  can_read_assignments?: boolean
  can_manage_assignments: boolean
  is_assigned: boolean
  is_primary: boolean
  approvalRuntimeId: string | null
  approvalRuntimeState: RuntimeState | null
  routingSlipId: string | null
  approval_submission_packet?: JsonValue | null
  approval_submission_hash?: string | null
  approval_submission_submitted_at?: string | null
}
const fetchQuestionnaireRuntimeDetail = $fetch as unknown as (url: string) => Promise<QuestionnaireRuntimeDetail>
const mutateQuestionnaire = $fetch as unknown as (
  url: string,
  options: { method: 'PATCH' | 'PUT' | 'POST'; body: unknown; query?: Record<string, unknown> }
) => Promise<unknown>

const { entityId, configuration, embedded = false, helpContext } = defineProps<{
  entityId: string
  configuration: QuestionnaireRuntimeConfiguration
  embedded?: boolean
  helpContext?: GuideObservedContext
}>()
const QuestionnaireHelpView = defineComponent({
  inheritAttrs: false,
  setup: (_props, { attrs, slots }) => () => embedded ? h(Fragment, slots.default?.()) : h('div', attrs, slots.default?.())
})
const emit = defineEmits<{ changed: [] }>()
const guidedHelpActions = useGuidedHelpActions()
const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const { getHeroCollapsed } = useDashboard()
const { getBilingualValue } = useBilingualValue()
const endpoint = computed(() => `${configuration.apiBase}/${entityId}`)
const runtimeIdentity = computed(() => `${configuration.entityType}-${entityId}`)
const isHeroCollapsed = getHeroCollapsed(configuration.panelId)
const data: Ref<QuestionnaireRuntimeDetail | null> = ref(null)
const responses: Ref<QuestionnaireResponse[]> = ref([])
const validationIssues: Ref<Array<{ questionKey: string; message: string; field?: 'comment' }>> = ref([])
const actionContext = useActionContext({
  identity: [() => entityId, () => configuration.entityType, endpoint],
  authority: () => data.value?.can_update_role === true,
  eligible: () => data.value?.can_update === true && data.value.runtimeState === 'active'
})
const mutation = useEditorMutationCoordinator({ getDraft: () => responses.value, context: actionContext })
const isSaving = mutation.isPending
type ActiveTarget = { kind: 'active'; endpoint: string; entityId: string; entityType: string }
type TargetState = ActiveTarget | { kind: 'disposed' }
type RequestState = { kind: 'idle' } | { kind: 'pending'; target: ActiveTarget }
type RevisionState = { kind: 'absent' } | { kind: 'current'; revision: number } | { kind: 'conflicted'; revision: number }
const createTarget = (): ActiveTarget => ({ kind: 'active', endpoint: endpoint.value, entityId, entityType: configuration.entityType })
const targetState = shallowRef<TargetState>(createTarget())
const readState = shallowRef<RequestState>({ kind: 'idle' })
const claimState = shallowRef<RequestState>({ kind: 'idle' })
const reloadState = shallowRef<RequestState>({ kind: 'idle' })
const revisionState = shallowRef<RevisionState>({ kind: 'absent' })
const hasRevisionConflict = computed(() => revisionState.value.kind === 'conflicted')
const isClaiming = computed(() => claimState.value.kind === 'pending')
const isReloading = computed(() => reloadState.value.kind === 'pending')
const assignmentRosterVersion: Ref<number> = ref(0)
const isCurrentTarget = (target: ActiveTarget) => targetState.value === target && target.endpoint === endpoint.value
watch(endpoint, () => {
  if (targetState.value.kind !== 'disposed') targetState.value = createTarget()
}, { flush: 'sync' })

onBeforeUnmount(() => {
  targetState.value = { kind: 'disposed' }
  readState.value = { kind: 'idle' }
  claimState.value = { kind: 'idle' }
  reloadState.value = { kind: 'idle' }
  mutation.replaceSessionDraft(() => {})
})

const readRuntimeDetail = async (
  target: ActiveTarget,
  accept: (payload: QuestionnaireRuntimeDetail) => void,
  clearOnError = false
): Promise<QuestionnaireRuntimeDetail | null> => {
  const request: RequestState = { kind: 'pending', target }
  readState.value = request
  const ownsRead = () => isCurrentTarget(target) && readState.value === request
  try {
    const payload = await fetchQuestionnaireRuntimeDetail(target.endpoint)
    if (!ownsRead()) return null
    if (target.entityType === 'commondatacollection' && (
      !payload || payload.id !== target.entityId || typeof payload.name_en !== 'string' || typeof payload.name_fr !== 'string'
      || typeof payload.can_update !== 'boolean' || !Number.isInteger(payload.egcs_cn_revision) || payload.egcs_cn_revision < 1
      || !QuestionnaireDefinitionSchema.safeParse(payload.definition).success
      || !payload.egcs_cn_response || !QuestionnaireResponsesSchema.safeParse(payload.egcs_cn_response.responses ?? []).success
    )) throw new Error(t('common.unknown_error'))
    accept(payload)
    return payload
  } catch (caughtError: unknown) {
    if (!ownsRead()) return null
    if (clearOnError) data.value = null
    throw caughtError
  } finally {
    if (ownsRead()) readState.value = { kind: 'idle' }
  }
}
const initialTarget = targetState.value
const {
  data: initialData,
  error,
  status,
  refresh
} = await useAsyncData(
  computed(() => `questionnaire-${runtimeIdentity.value}`),
  async () => {
    const target = targetState.value
    if (target.kind === 'disposed') return null
    return readRuntimeDetail(target, payload => {
      data.value = payload
    })
  }
)
if (!data.value && initialTarget.kind === 'active' && isCurrentTarget(initialTarget) && initialData.value?.id === initialTarget.entityId) {
  data.value = initialData.value
}
useFieldTooltipProvider(() => {
  if (!data.value || String(data.value.id) !== entityId) return null
  if (configuration.entityType === 'commonrecommendation') return { entityType: 'recommendation', entityId }
  if (configuration.entityType === 'commondatacollection') return { entityType: 'data_collection', entityId }
  return null
})
if (!embedded && targetState.value.kind !== 'disposed') {
  usePageResourceError({ identity: () => route.path, errors: [error], pending: () => status.value === 'pending', hasContent: () => Boolean(data.value) })
}

if (targetState.value.kind !== 'disposed') {
  watch([data, isSaving], ([value]) => {
    if (targetState.value.kind === 'disposed' || mutation.isPending.value || mutation.isDirty.value || hasRevisionConflict.value) return
    mutation.replaceSessionDraft(() => {
      responses.value = copyQuestionnaireResponses(value?.egcs_cn_response.responses ?? [])
      validationIssues.value = []
      revisionState.value = value ? { kind: 'current', revision: value.egcs_cn_revision } : { kind: 'absent' }
    })
  }, { immediate: true })
  watch(endpoint, () => {
    readState.value = { kind: 'idle' }
    reloadState.value = { kind: 'idle' }
    mutation.replaceSessionDraft(() => {
      responses.value = []
      validationIssues.value = []
      revisionState.value = { kind: 'absent' }
      data.value = null
    })
    claimState.value = { kind: 'idle' }
    assignmentRosterVersion.value = 0
  }, { flush: 'sync' })
}

const title = computed(() => {
  return getBilingualValue(data.value, 'name', t(`${configuration.messagePrefix}.detail_title`, { id: entityId }))
})
const breadcrumbItems = computed(() => [
  { label: t('nav.home'), to: localePath(appRouteLocations.home()) },
  { label: title.value }
])
const isEditable = computed(() => data.value?.can_update === true && data.value.runtimeState === 'active')
const showMutationActions = computed(() => configuration.entityType === 'commondatacollection'
  ? data.value?.can_update_role === true
  : isEditable.value)
const readOnlyDescription = computed(() => {
  if (data.value?.runtimeState !== 'active') return t(`${configuration.messagePrefix}.locked_description`)
  return t('assignments.read_only_description')
})
const heroBadges = computed(() => [
  ...(data.value?.runtimeState
    ? [{ lifecycleEngine: 'runtime' as const, lifecycleState: data.value.runtimeState }]
    : []),
  ...(data.value?.is_primary ? [{ variant: 'meta', label: t('assignments.primary') }] : [])
])
const assignmentSectionBadge = computed(() => {
  if (data.value?.approvalRuntimeId) return '03'
  return '02'
})

const claim = async () => {
  const target = targetState.value
  if (target.kind === 'disposed' || !data.value?.can_claim || isClaiming.value) return
  const request: RequestState = { kind: 'pending', target }
  claimState.value = request
  const ownsClaim = () => isCurrentTarget(target) && claimState.value === request
  try {
    await mutateQuestionnaire(`${target.endpoint}/claim`, { method: 'POST', body: {} })
    if (!ownsClaim()) return
    if (!embedded && target.entityType === 'commonrecommendation') {
      await refresh()
      if (!data.value || !ownsClaim()) return
    } else {
      const refreshed = await refreshRuntime()
      if (!refreshed || !ownsClaim()) return
    }
    assignmentRosterVersion.value += 1
    emit('changed')
  } catch (caughtError: unknown) {
    if (ownsClaim()) showError(caughtError)
  } finally {
    if (ownsClaim()) claimState.value = { kind: 'idle' }
  }
}

const refreshRuntime = async (): Promise<QuestionnaireRuntimeDetail | null> => {
  const target = targetState.value
  if (target.kind === 'disposed') return null
  return readRuntimeDetail(target, payload => {
    data.value = payload
  }, embedded)
}
const retryLoad = async () => {
  const target = targetState.value
  if (target.kind === 'disposed' || isReloading.value) return
  const request: RequestState = { kind: 'pending', target }
  reloadState.value = request
  try {
    await refreshRuntime()
  } catch {
    // The embedded load alert remains available.
  } finally {
    if (reloadState.value === request) reloadState.value = { kind: 'idle' }
  }
}
const handleRuntimeChanged = async () => {
  const target = targetState.value
  if (target.kind === 'disposed') return
  try {
    const refreshed = await refreshRuntime()
    if (refreshed && isCurrentTarget(target)) emit('changed')
  } catch (caughtError: unknown) {
    if (isCurrentTarget(target)) showError(caughtError)
  }
}
const reloadResponses = async () => {
  const target = targetState.value
  if (target.kind === 'disposed') return
  try {
    const refreshed = await refreshRuntime()
    if (!refreshed || !isCurrentTarget(target)) return
    mutation.replaceSessionDraft(() => {
      responses.value = copyQuestionnaireResponses(refreshed.egcs_cn_response.responses ?? [])
      validationIssues.value = []
      revisionState.value = { kind: 'current', revision: refreshed.egcs_cn_revision }
    })
  } catch (caughtError: unknown) {
    if (isCurrentTarget(target)) showError(caughtError)
  }
}

const save = async (submit: boolean) => {
  const target = targetState.value
  if (target.kind === 'disposed' || !showMutationActions.value || isSaving.value || !data.value) return
  if (!isEditable.value || hasRevisionConflict.value) {
    toast.add({
      title: toast.localized('common.warning'),
      description: hasRevisionConflict.value ? toast.localized('questionnaire.revision_conflict_description') : toast.localized(data.value?.runtimeState !== 'active' ? `${configuration.messagePrefix}.locked_description` : 'assignments.read_only_description'),
      color: 'warning'
    })
    return
  }
  if (revisionState.value.kind !== 'current') return
  const requestedEndpoint = target.endpoint
  const requestedEntityId = target.entityId
  validationIssues.value = submit ? configuration.validate(data.value.definition, responses.value) : []
  if (validationIssues.value.length > 0) return
  const invalidate = guidedHelpActions.begin({ kind: 'invalidated', binding: helpContext?.kind === 'task' ? helpContext.execution.binding : helpContext?.kind === 'owner' && helpContext.binding ? helpContext.binding : { resourceType: configuration.entityType, resourceId: requestedEntityId } })
  const payload = { responses: copyQuestionnaireResponses(responses.value), revision: revisionState.value.revision }
  await mutation.run(submit ? 'submit' : 'save', async token => {
    try {
      const result = await mutateQuestionnaire(requestedEndpoint, { method: 'PUT', query: { submit }, body: payload })
      if (!mutation.isTokenCurrent(token) || !isCurrentTarget(target)) return
      const committed = QuestionnaireMutationResultSchema.parse(result)
      if (committed.id !== requestedEntityId) throw new Error(t('common.unknown_error'))
      readState.value = { kind: 'idle' }
      mutation.acceptCommittedDraft(token, committed.egcs_cn_response.responses)
      revisionState.value = { kind: 'current', revision: committed.egcs_cn_revision }
      if (data.value) data.value = {
        ...data.value,
        runtimeState: committed.runtimeState,
        egcs_cn_response: committed.egcs_cn_response,
        egcs_cn_revision: committed.egcs_cn_revision
      }
      await readRuntimeDetail(target, refreshed => {
        if (!mutation.isTokenCurrent(token)) return
        mutation.applyMutationRefresh(token, {
          apply: () => {
            data.value = refreshed
            responses.value = copyQuestionnaireResponses(refreshed.egcs_cn_response.responses ?? [])
            revisionState.value = { kind: 'current', revision: refreshed.egcs_cn_revision }
          },
          mergeMetadata: () => { data.value = refreshed }
        })
      })
      if (!mutation.isTokenCurrent(token) || !isCurrentTarget(target)) return
      toast.add({ title: toast.localized('common.success'), description: toast.localized(`${configuration.messagePrefix}.${submit ? 'submitted_success' : 'saved_success'}`), color: 'success' })
      invalidate()
      emit('changed')
    } catch (caughtError: unknown) {
      if (!mutation.isTokenCurrent(token) || !isCurrentTarget(target)) return
      const failure = caughtError as { statusCode?: number, status?: number }
      if (failure.statusCode === 409 || failure.status === 409) revisionState.value = { kind: 'conflicted', revision: payload.revision }
      showError(caughtError)
    }
  })
}
</script>

<template>
  <QuestionnaireRuntimeShell v-model:collapsed="isHeroCollapsed" :embedded="embedded" :panel-id="configuration.panelId" :breadcrumb-items="breadcrumbItems">
    <template #default>
      <div v-if="data && String(data.id) === entityId" class="flex flex-1 flex-col">
        <QuestionnaireHelpView data-help-view="casework.questionnaire" class="flex flex-1 flex-col">
          <CommonEntityHero
            v-if="!embedded"
            :is-collapsed="isHeroCollapsed"
            :icon="configuration.icon"
            :title="title"
            :meta-items="[t(`${configuration.messagePrefix}.identifier`, { id: entityId })]"
            :badges="heroBadges" />
          <div :class="embedded ? 'min-w-0 space-y-8' : 'mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-6'">
            <UButton
              v-if="data.can_claim" data-help-target="casework.questionnaire.claim" data-help-kind="button"
              icon="i-lucide-user-plus" :label="t('groups.claim')"
              :loading="isClaiming" :disabled="isClaiming" class="self-start" @click="claim" />

            <UAlert
              v-if="!isEditable"
              color="neutral"
              variant="soft"
              icon="i-lucide-eye"
              :title="t('assignments.read_only_title')"
              :description="readOnlyDescription" />

            <UAlert
              v-if="validationIssues.length > 0"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              :title="t(`${configuration.messagePrefix}.validation_title`)"
              :description="t('questionnaire.validation_description')" />

            <UAlert v-if="hasRevisionConflict" color="warning" icon="i-lucide-refresh-cw" :title="t('questionnaire.revision_conflict')" :description="t('questionnaire.revision_conflict_description')">
              <template #actions>
                <UButton color="warning" variant="soft" :label="t('questionnaire.reload_responses')" @click="reloadResponses" />
              </template>
            </UAlert>

            <CommonWorkflowApprovalPacket
              v-if="data.approval_submission_packet && data.approval_submission_hash && data.approval_submission_submitted_at"
              :submission="{
                egcs_fc_packet: data.approval_submission_packet,
                egcs_fc_canonicalhash: data.approval_submission_hash,
                egcs_fc_submittedat: data.approval_submission_submitted_at
              }" />

            <section data-help-target="casework.questionnaire.responses" data-help-kind="section" class="flex w-full min-w-0 flex-col">
              <CommonSection :title="t(`${configuration.messagePrefix}.responses`)" badge="01" :grid-cols="1">
                <div class="space-y-6">
                  <CommonQuestionnaireForm
                    v-model:responses="responses"
                    :definition="data.definition"
                    :issues="validationIssues"
                    :readonly="!isEditable || mutation.isActionPending('submit')" />
                  <div v-if="showMutationActions" class="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-5 dark:border-zinc-800">
                    <CommonSaveButton
                      data-help-target="casework.questionnaire.save" data-help-kind="button"
                      :label="t('common.save')"
                      variant="outline"
                      :loading="isSaving"
                      :disabled="isSaving || (configuration.entityType !== 'commondatacollection' && hasRevisionConflict)"
                      @click="save(false)" />
                    <UButton
                      icon="i-lucide-send" data-help-target="casework.questionnaire.submit" data-help-kind="button"
                      :label="t('common.submit')"
                      :loading="isSaving"
                      :disabled="isSaving || (configuration.entityType !== 'commondatacollection' && hasRevisionConflict)"
                      @click="save(true)" />
                  </div>
                </div>
              </CommonSection>
            </section>

            <section v-if="data.approvalRuntimeId" data-help-target="casework.questionnaire.approvals" data-help-kind="section" class="flex w-full min-w-0 flex-col">
              <CommonSection :title="t('assessment.approvals.title')" badge="02" :grid-cols="1">
                <AssessmentApprovalsSection
                  :entity-type="configuration.entityType"
                  :entity-id="entityId"
                  :routing-slip-id="data.routingSlipId"
                  hide-title
                  @changed="handleRuntimeChanged" />
              </CommonSection>
            </section>

            <section v-if="data.can_read_assignments !== false" data-help-target="casework.questionnaire.assignments" data-help-kind="section" class="flex w-full min-w-0 flex-col">
              <CommonSection :title="t('assignments.title')" :badge="assignmentSectionBadge" :grid-cols="1">
                <CommonAssignedUsers :key="`${runtimeIdentity}:${assignmentRosterVersion}`" :show-header="false" :entity-type="configuration.entityType" :entity-id="entityId" @changed="handleRuntimeChanged" />
              </CommonSection>
            </section>
          </div>
        </QuestionnaireHelpView>
      </div>

      <div v-else-if="status === 'pending'" class="sr-only" role="status" aria-live="polite">
        {{ t('common.loading') }}
      </div>

      <div v-else class="p-6">
        <UAlert
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :title="t(`${configuration.messagePrefix}.load_failed`)"
          :description="embedded ? t('common.unknown_error') : error?.message ?? t('common.unknown_error')">
          <template v-if="embedded" #actions>
            <UButton color="neutral" variant="outline" :label="t('common.retry')" :loading="isReloading" :disabled="isReloading" @click="retryLoad" />
          </template>
        </UAlert>
      </div>
    </template>
  </QuestionnaireRuntimeShell>
</template>
