import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { FetchError } from 'ofetch'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type {
  ChecklistAnswer,
  ChecklistDefinition,
  ChecklistResponse,
  ChecklistResult
} from '~~/shared/types/schemas/checklist/checklist'
import type { ChecklistEvaluationTrace } from '~~/shared/utils/checklist-evaluation'
import { evaluateChecklist } from '~~/shared/utils/checklist-evaluation'
import { appRouteLocations } from '~/utils/route-locations'
import { getReviewReturnPath } from '~/utils/review-navigation'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'

export type ChecklistAnswerValue = ChecklistAnswer | null
export type EditableChecklistResponse = {
  questionKey: string
  answer: ChecklistAnswerValue
  comment: string
}

type ChecklistDetailResponse = {
  id: string
  runtimeId: string
  runtimeItemId: string
  runtimeState: RuntimeState
  attempt: number
  previousRuntimeId: string | null
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_entitytype: string
  egcs_cn_entityid: string
  entity_name_en?: string
  entity_name_fr?: string
  entity_operating_name_en?: string
  entity_operating_name_fr?: string
  publicationVersionId: string
  publicationVersion: number
  egcs_cn_disablereviewers?: boolean
  checklistDefinition: ChecklistDefinition
  checklistResponse: {
    responses: ChecklistResponse[]
    result: ChecklistResult | null
    evaluationTrace?: ChecklistEvaluationTrace | null
  }
  reviewRuntime?: {
    is_locked?: boolean
    additional_reviewer_count?: number
    pending_additional_reviewer_count?: number
  }
  permissions?: { can_update?: boolean }
}

/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-returns -- concise local state helpers are self-documenting */
/** Coordinates checklist runtime loading, editing, and persistence. */
export const useChecklistDetailPage = () => {
  const route = useRoute()
  const { t } = useI18n()
  const localePath = useLocalePath()
  const { getBilingualValue } = useBilingualValue()
  const { getHeroCollapsed } = useDashboard()
  const reviewId = computed(() => String(route.params.reviewId))
  const checklistEndpoint = computed(() => `/api/reviews/${reviewId.value}/checklist`)
  const { data: checklist, error: loadError, status: loadStatus, refresh } = useFetch<ChecklistDetailResponse, FetchError, string>(checklistEndpoint)
  const responses: Ref<EditableChecklistResponse[]> = ref([])
  const persistedResponses: Ref<string> = ref('[]')
  const isSaving: Ref<boolean> = ref(false)
  const totalAdditionalReviewerCount: Ref<number> = ref(0)
  const pendingAdditionalReviewerCount: Ref<number> = ref(0)
  const { showError } = useApiErrorToast()
  const toast = useToast()

  const serializeResponses = (value: EditableChecklistResponse[]) => JSON.stringify(value)
  const isDirty = computed(() => serializeResponses(responses.value) !== persistedResponses.value)
  watch(checklist, value => {
    totalAdditionalReviewerCount.value = value?.reviewRuntime?.additional_reviewer_count ?? 0
    pendingAdditionalReviewerCount.value = value?.reviewRuntime?.pending_additional_reviewer_count ?? 0
    const nextResponses = value?.checklistResponse?.responses
      ? value.checklistResponse.responses.map(response => ({ ...response, comment: response.comment ?? '' }))
      : []
    if (!isDirty.value) {
      responses.value = nextResponses
      persistedResponses.value = serializeResponses(nextResponses)
    }
  }, { immediate: true })
  watch(reviewId, () => {
    checklist.value = undefined
    responses.value = []
    persistedResponses.value = '[]'
    isSaving.value = false
  })

  const sections = computed(() => checklist.value?.checklistDefinition?.sections ?? [])
  const liveEvaluation = computed(() => {
    const definition = checklist.value?.checklistDefinition
    if (!definition) return null

    return evaluateChecklist(definition, responses.value.flatMap(response => response.answer === null
      ? []
      : [{ questionKey: response.questionKey, answer: response.answer, comment: response.comment }]))
  })
  const canUpdate = computed(() => checklist.value?.permissions?.can_update === true && checklist.value?.reviewRuntime?.is_locked !== true)
  const heroName = computed(() => getBilingualValue(checklist.value, 'egcs_cn_name', reviewId.value))
  const entityId = computed(() => String(checklist.value?.egcs_cn_entityid ?? ''))
  const entityName = computed(() => getBilingualValue(
    checklist.value,
    'entity_name',
    getBilingualValue(checklist.value, 'entity_operating_name', entityId.value || reviewId.value)
  ))
  const breadcrumbItems = computed(() => {
    const returnPath = getReviewReturnPath(route.query.returnTo)
    if (returnPath) {
      return [
        { label: t('workflow.back_to_entity'), to: returnPath },
        { label: heroName.value }
      ]
    }

    if (checklist.value?.egcs_cn_entitytype === 'applicantrecipient' && entityId.value) {
      return [
        { label: t('applicant_recipient.title'), to: localePath(appRouteLocations.proponents()) },
        {
          label: entityName.value,
          to: localePath({
            ...appRouteLocations.proponentEdit(entityId.value),
            query: { section: 'reviews' }
          })
        },
        { label: heroName.value }
      ]
    }

    return [
      { label: t('checklist.title') },
      { label: heroName.value }
    ]
  })
  const isHeroCollapsed = getHeroCollapsed('checklist-detail')

  const getResponse = (questionKey: string) => {
    for (const response of responses.value) {
      if (response.questionKey === questionKey) return response
    }
    return undefined
  }
  const updateAnswer = (questionKey: string, answer: ChecklistAnswerValue) => {
    const existing = getResponse(questionKey)
    if (existing) {
      existing.answer = answer
      return
    }
    responses.value.push({ questionKey, answer, comment: '' })
  }
  const updateComment = (questionKey: string, comment: string) => {
    for (let index = 0; index < responses.value.length; index++) {
      const existing = responses.value[index]!
      if (existing.questionKey === questionKey) {
        if (existing.answer !== null && existing.answer !== undefined) {
          responses.value[index]!.comment = comment
        }
        return
      }
    }
  }
  const setAdditionalReviewerProgress = (value: { total: number, pending: number }) => {
    totalAdditionalReviewerCount.value = value.total
    pendingAdditionalReviewerCount.value = value.pending
  }
  const saveChecklist = async () => {
    if (!canUpdate.value || isSaving.value) return
    const targetReviewId = reviewId.value
    const submittedResponses = responses.value
      .filter(response => response.answer !== null)
      .map(response => ({ questionKey: response.questionKey, answer: response.answer, comment: response.comment }))
    const submittedDraft = serializeResponses(responses.value)
    try {
      isSaving.value = true
      const response = await fetch(getClientRequestUrl(`/api/reviews/${targetReviewId}/checklist`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          responses: submittedResponses
        })
      })
      if (!response.ok) await throwFetchResponseError(response)
      if (reviewId.value !== targetReviewId) return
      persistedResponses.value = submittedDraft
      await refresh()
      if (reviewId.value !== targetReviewId) return
      toast.add({ title: t('common.success'), description: t('checklist.saved'), color: 'success' })
    } catch (error) {
      showError(error)
    } finally {
      isSaving.value = false
    }
  }

  return {
    checklist, loadError, loadStatus, responses, sections, liveEvaluation, isDirty,
    totalAdditionalReviewerCount, pendingAdditionalReviewerCount,
    canUpdate, isSaving, heroName, entityName, breadcrumbItems, isHeroCollapsed, getResponse, updateAnswer,
    updateComment, setAdditionalReviewerProgress, saveChecklist, refresh
  }
}
