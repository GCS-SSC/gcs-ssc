<script setup lang="ts">
import { usePageResourceError } from '~/composables/usePageResourceError'
/* eslint-disable jsdoc/require-jsdoc -- concise page-local interaction handlers are self-documenting */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { JsonValue } from '~~/shared/types/database'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import { appRouteLocations } from '~/utils/route-locations'
import type { QuestionnaireDefinition, QuestionnaireResponse } from '~~/shared/types/schemas/questionnaire'
import { QuestionnaireDefinitionSchema, QuestionnaireResponsesSchema } from '~~/shared/types/schemas/questionnaire'
import { copyQuestionnaireResponses } from '~/utils/questionnaire-runtime'
import type { QuestionnaireRuntimeConfiguration } from '~/utils/questionnaire-runtime'
import QuestionnaireRuntimeShell from './RuntimeShell.vue'

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
  can_update_role?: boolean
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

const { entityId, configuration, embedded = false } = defineProps<{
  entityId: string
  configuration: QuestionnaireRuntimeConfiguration
  embedded?: boolean
}>()
const emit = defineEmits<{ changed: [] }>()
const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const { showError } = useApiErrorToast()
const { getHeroCollapsed } = useDashboard()
const { getBilingualValue } = useBilingualValue()
const endpoint = computed(() => `${configuration.apiBase}/${entityId}`)
const runtimeIdentity = computed(() => `${configuration.entityType}-${entityId}`)
const isHeroCollapsed = getHeroCollapsed(configuration.panelId)
const responses: Ref<QuestionnaireResponse[]> = ref([])
const validationIssues: Ref<Array<{ questionKey: string; message: string; field?: 'comment' }>> = ref([])
const mutation = useEditorMutationCoordinator({ getDraft: () => responses.value })
const isSaving = mutation.isPending
const hasRevisionConflict: Ref<boolean> = ref(false)
const isClaiming: Ref<boolean> = ref(false)
const isReloading: Ref<boolean> = ref(false)
const assignmentRosterVersion: Ref<number> = ref(0)
let targetGeneration = 0
let readGeneration = 0
let disposed = false
const isCurrentTarget = (generation: number, requestedEndpoint: string) =>
  !disposed && generation === targetGeneration && requestedEndpoint === endpoint.value

onBeforeUnmount(() => {
  disposed = true
  targetGeneration += 1
  readGeneration += 1
  mutation.replaceSessionDraft(() => {})
})

const readRuntimeDetail = async (
  requestedEndpoint: string,
  requestedEntityId: string,
  requestedEntityType: string
): Promise<QuestionnaireRuntimeDetail> => {
  const payload = await fetchQuestionnaireRuntimeDetail(requestedEndpoint)
  if (requestedEntityType === 'commondatacollection' && (
    !payload || payload.id !== requestedEntityId || typeof payload.name_en !== 'string' || typeof payload.name_fr !== 'string'
    || typeof payload.can_update !== 'boolean' || !Number.isInteger(payload.egcs_cn_revision) || payload.egcs_cn_revision < 1
    || !QuestionnaireDefinitionSchema.safeParse(payload.definition).success
    || !payload.egcs_cn_response || !QuestionnaireResponsesSchema.safeParse(payload.egcs_cn_response.responses ?? []).success
  )) throw new Error(t('common.unknown_error'))
  return payload
}
const {
  data,
  error,
  status,
  refresh
} = await useAsyncData(
  computed(() => `questionnaire-${runtimeIdentity.value}`),
  async () => {
    const generation = targetGeneration
    const requestedEndpoint = endpoint.value
    const payload = await readRuntimeDetail(requestedEndpoint, entityId, configuration.entityType)
    return isCurrentTarget(generation, requestedEndpoint) ? payload : null
  }
)
if (!embedded && !disposed) {
  usePageResourceError({ identity: () => route.path, errors: [error], pending: () => status.value === 'pending', hasContent: () => Boolean(data.value) })
}

if (!disposed) {
  watch(data, value => {
    if (disposed || mutation.isPending.value || mutation.isDirty.value) return
    mutation.replaceSessionDraft(() => {
      responses.value = copyQuestionnaireResponses(value?.egcs_cn_response.responses ?? [])
      validationIssues.value = []
    })
  }, { immediate: true })
  watch(endpoint, () => {
    targetGeneration += 1
    readGeneration += 1
    mutation.replaceSessionDraft(() => {
      responses.value = []
      validationIssues.value = []
      hasRevisionConflict.value = false
      data.value = null
    })
    isClaiming.value = false
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
  if (disposed || !data.value?.can_claim || isClaiming.value) return
  const generation = targetGeneration
  const requestedEndpoint = endpoint.value
  isClaiming.value = true
  try {
    await mutateQuestionnaire(`${requestedEndpoint}/claim`, { method: 'POST', body: {} })
    if (!isCurrentTarget(generation, requestedEndpoint)) return
    if (!embedded && configuration.entityType === 'commonrecommendation') {
      await refresh()
      if (!data.value || !isCurrentTarget(generation, requestedEndpoint)) return
    } else {
      const refreshed = await refreshRuntime()
      if (!refreshed || !isCurrentTarget(generation, requestedEndpoint)) return
    }
    assignmentRosterVersion.value += 1
    emit('changed')
  } catch (caughtError: unknown) {
    if (isCurrentTarget(generation, requestedEndpoint)) showError(caughtError)
  } finally {
    if (isCurrentTarget(generation, requestedEndpoint)) isClaiming.value = false
  }
}

const refreshRuntime = async (): Promise<QuestionnaireRuntimeDetail | null> => {
  if (disposed) return null
  const generation = targetGeneration
  const requestedEndpoint = endpoint.value
  const request = ++readGeneration
  try {
    const payload = await readRuntimeDetail(requestedEndpoint, entityId, configuration.entityType)
    if (!isCurrentTarget(generation, requestedEndpoint) || request !== readGeneration) return null
    data.value = payload
    return payload
  } catch (caughtError: unknown) {
    if (!isCurrentTarget(generation, requestedEndpoint) || request !== readGeneration) return null
    if (embedded) data.value = null
    throw caughtError
  }
}
const retryLoad = async () => {
  if (disposed || isReloading.value) return
  isReloading.value = true
  try {
    await refreshRuntime()
  } catch {
    // The embedded load alert remains available.
  } finally {
    if (!disposed) isReloading.value = false
  }
}
const handleRuntimeChanged = async () => {
  const generation = targetGeneration
  const requestedEndpoint = endpoint.value
  try {
    const refreshed = await refreshRuntime()
    if (refreshed && isCurrentTarget(generation, requestedEndpoint)) emit('changed')
  } catch (caughtError: unknown) {
    if (isCurrentTarget(generation, requestedEndpoint)) showError(caughtError)
  }
}
const reloadResponses = async () => {
  const generation = targetGeneration
  const requestedEndpoint = endpoint.value
  try {
    const refreshed = await refreshRuntime()
    if (!refreshed || !isCurrentTarget(generation, requestedEndpoint)) return
    mutation.replaceSessionDraft(() => {
      responses.value = copyQuestionnaireResponses(refreshed.egcs_cn_response.responses ?? [])
      validationIssues.value = []
      hasRevisionConflict.value = false
    })
  } catch (caughtError: unknown) {
    if (isCurrentTarget(generation, requestedEndpoint)) showError(caughtError)
  }
}
const save = async (submit: boolean) => {
  if (disposed || !showMutationActions.value || isSaving.value || !data.value) return
  if (!isEditable.value || hasRevisionConflict.value) {
    toast.add({
      title: t('common.warning'),
      description: hasRevisionConflict.value ? t('questionnaire.revision_conflict_description') : readOnlyDescription.value,
      color: 'warning'
    })
    return
  }
  const generation = targetGeneration
  const requestedEndpoint = endpoint.value
  const requestedEntityId = entityId
  const requestedEntityType = configuration.entityType
  validationIssues.value = submit ? configuration.validate(data.value.definition, responses.value) : []
  if (validationIssues.value.length > 0) return
  const payload = { responses: copyQuestionnaireResponses(responses.value), revision: data.value.egcs_cn_revision }
  await mutation.run(submit ? 'submit' : 'save', async token => {
    try {
      await mutateQuestionnaire(requestedEndpoint, { method: 'PUT', query: { submit }, body: payload })
      if (!mutation.isTokenCurrent(token) || !isCurrentTarget(generation, requestedEndpoint)) return
      const refreshed = await readRuntimeDetail(requestedEndpoint, requestedEntityId, requestedEntityType)
      if (!mutation.isTokenCurrent(token) || !isCurrentTarget(generation, requestedEndpoint)) return
      mutation.applyMutationRefresh(token, {
        apply: () => {
          data.value = refreshed
          responses.value = copyQuestionnaireResponses(refreshed.egcs_cn_response.responses ?? [])
        },
        mergeMetadata: () => { data.value = refreshed }
      })
      toast.add({ title: t('common.success'), description: t(`${configuration.messagePrefix}.${submit ? 'submitted_success' : 'saved_success'}`), color: 'success' })
      emit('changed')
    } catch (caughtError: unknown) {
      if (!mutation.isTokenCurrent(token) || !isCurrentTarget(generation, requestedEndpoint)) return
      const failure = caughtError as { statusCode?: number, status?: number }
      if (failure.statusCode === 409 || failure.status === 409) hasRevisionConflict.value = true
      showError(caughtError)
    }
  })
}
</script>

<template>
  <QuestionnaireRuntimeShell v-model:collapsed="isHeroCollapsed" :embedded="embedded" :panel-id="configuration.panelId" :breadcrumb-items="breadcrumbItems">
    <template #default>
      <div v-if="data" class="flex flex-1 flex-col">
        <CommonEntityHero
          v-if="!embedded"
          :is-collapsed="isHeroCollapsed"
          :icon="configuration.icon"
          :title="title"
          :meta-items="[t(`${configuration.messagePrefix}.identifier`, { id: entityId })]"
          :badges="heroBadges" />

        <div :class="embedded ? 'min-w-0 space-y-8' : 'mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-6'">
          <UButton
            v-if="data.can_claim"
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

          <CommonSection :title="t(`${configuration.messagePrefix}.responses`)" badge="01" :grid-cols="1">
            <div class="space-y-6">
              <CommonQuestionnaireForm
                v-model:responses="responses"
                :definition="data.definition"
                :issues="validationIssues"
                :readonly="!isEditable || mutation.isActionPending('submit')" />
              <div v-if="showMutationActions" class="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-5 dark:border-zinc-800">
                <CommonSaveButton
                  :label="t('common.save')"
                  variant="outline"
                  :loading="isSaving"
                  :disabled="isSaving || (configuration.entityType !== 'commondatacollection' && hasRevisionConflict)"
                  @click="save(false)" />
                <UButton
                  icon="i-lucide-send"
                  :label="t('common.submit')"
                  :loading="isSaving"
                  :disabled="isSaving || (configuration.entityType !== 'commondatacollection' && hasRevisionConflict)"
                  @click="save(true)" />
              </div>
            </div>
          </CommonSection>

          <CommonSection v-if="data.approvalRuntimeId" :title="t('assessment.approvals.title')" badge="02" :grid-cols="1">
            <AssessmentApprovalsSection
              :entity-type="configuration.entityType"
              :entity-id="entityId"
              :routing-slip-id="data.routingSlipId"
              hide-title
              @changed="handleRuntimeChanged" />
          </CommonSection>

          <CommonSection v-if="data.can_read_assignments !== false" :title="t('assignments.title')" :badge="assignmentSectionBadge" :grid-cols="1">
            <CommonAssignedUsers :key="`${runtimeIdentity}:${assignmentRosterVersion}`" :show-header="false" :entity-type="configuration.entityType" :entity-id="entityId" @changed="handleRuntimeChanged" />
          </CommonSection>
        </div>
      </div>

      <div v-else-if="status === 'pending'" class="flex flex-1 items-center justify-center p-8">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary" />
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
