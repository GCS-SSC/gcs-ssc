<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- concise page-local interaction handlers are self-documenting */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { JsonValue } from '~~/shared/types/database'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import { appRouteLocations } from '~/utils/route-locations'
import {
  validateRecommendationResponses,
  type RecommendationDefinition,
  type RecommendationResponse
} from '~~/shared/types/schemas/recommendation/recommendation'

definePageMeta({
  i18n: {
    paths: {
      en: '/recommendations/[recommendationId]',
      fr: '/recommandations/[recommendationId]'
    }
  }
})

type RecommendationDetail = {
  id: string
  runtimeId: string
  runtimeItemId: string
  runtimeState: RuntimeState
  attempt: number
  previousRuntimeId: string | null
  publicationVersionId: string
  publicationVersion: number
  egcs_cn_outcome: string | null
  egcs_cn_response: { responses?: RecommendationResponse[] }
  egcs_cn_revision: number
  definition: RecommendationDefinition
  name_en: string
  name_fr: string
  can_read: boolean
  can_update: boolean
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
const fetchRecommendationDetail = $fetch as unknown as (url: string) => Promise<RecommendationDetail>
const mutateRecommendation = $fetch as unknown as (
  url: string,
  options: { method: 'PATCH' | 'PUT'; body: unknown; query?: Record<string, unknown> }
) => Promise<unknown>

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const { showError } = useApiErrorToast()
const { getHeroCollapsed } = useDashboard()
const { getBilingualValue } = useBilingualValue()
const recommendationId = String(route.params.recommendationId)
const isHeroCollapsed = getHeroCollapsed('recommendation-detail')
const {
  data,
  error,
  status,
  refresh
} = await useAsyncData(
  `recommendation-${recommendationId}`,
  () => fetchRecommendationDetail(`/api/recommendations/${recommendationId}`)
)
const responses: Ref<RecommendationResponse[]> = ref([])
const validationIssues: Ref<Array<{ questionKey: string; message: string }>> = ref([])
const isSaving: Ref<boolean> = ref(false)

watch(data, value => {
  responses.value = structuredClone(value?.egcs_cn_response.responses ?? [])
  validationIssues.value = []
}, { immediate: true })

const title = computed(() => {
  return getBilingualValue(data.value, 'name', t('recommendation.detail_title', { id: recommendationId }))
})
const breadcrumbItems = computed(() => [
  { label: t('nav.home'), to: localePath(appRouteLocations.home()) },
  { label: title.value }
])
const isEditable = computed(() => data.value?.can_update === true && data.value.runtimeState === 'active')
const readOnlyDescription = computed(() => {
  if (data.value?.is_assigned) return t('recommendation.locked_description')
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

const save = async (submit: boolean) => {
  if (!isEditable.value || isSaving.value || !data.value) return
  if (submit) {
    validationIssues.value = validateRecommendationResponses(data.value.definition, responses.value)
    if (validationIssues.value.length > 0) return
  }

  isSaving.value = true
  try {
    await mutateRecommendation(`/api/recommendations/${recommendationId}`, {
      method: 'PUT',
      query: { submit },
      body: { responses: responses.value, revision: data.value.egcs_cn_revision }
    })
    await refresh()
    const successMessageKey = submit ? 'recommendation.submitted_success' : 'recommendation.saved_success'
    toast.add({
      title: t('common.success'),
      description: t(successMessageKey),
      color: 'success'
    })
  } catch (caughtError: unknown) {
    showError(caughtError)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="recommendation-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
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
      <div v-if="data" class="flex flex-1 flex-col">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-message-square-quote"
          :title="title"
          :meta-items="[t('recommendation.identifier', { id: recommendationId })]"
          :badges="heroBadges" />

        <div class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-6">
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
            :title="t('workflow.recommendation_validation_title')"
            :description="t('workflow.recommendation_validation_description')" />

          <CommonWorkflowApprovalPacket
            v-if="data.approval_submission_packet && data.approval_submission_hash && data.approval_submission_submitted_at"
            :submission="{
              egcs_fc_packet: data.approval_submission_packet,
              egcs_fc_canonicalhash: data.approval_submission_hash,
              egcs_fc_submittedat: data.approval_submission_submitted_at
            }" />

          <CommonSection :title="t('recommendation.responses')" badge="01" :grid-cols="1">
            <div class="space-y-6">
              <RecommendationForm
                v-model:responses="responses"
                :definition="data.definition"
                :issues="validationIssues"
                :readonly="!isEditable" />
              <div v-if="isEditable" class="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-5 dark:border-zinc-800">
                <CommonSaveButton
                  :label="t('common.save')"
                  variant="outline"
                  :loading="isSaving"
                  :disabled="isSaving"
                  @click="save(false)" />
                <UButton
                  icon="i-lucide-send"
                  :label="t('common.submit')"
                  :loading="isSaving"
                  :disabled="isSaving"
                  @click="save(true)" />
              </div>
            </div>
          </CommonSection>

          <CommonSection v-if="data.approvalRuntimeId" :title="t('assessment.approvals.title')" badge="02" :grid-cols="1">
            <AssessmentApprovalsSection
              entity-type="commonrecommendation"
              :entity-id="recommendationId"
              :routing-slip-id="data.routingSlipId"
              hide-title
              @changed="refresh" />
          </CommonSection>

          <CommonSection :title="t('assignments.title')" :badge="assignmentSectionBadge" :grid-cols="1">
            <CommonAssignedUsers entity-type="commonrecommendation" :entity-id="recommendationId" />
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
          :title="t('recommendation.load_failed')"
          :description="error?.message ?? t('common.unknown_error')" />
      </div>
    </template>
  </UDashboardPanel>
</template>
