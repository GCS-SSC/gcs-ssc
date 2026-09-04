import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { FetchError } from 'ofetch'
/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- composable callbacks use self-descriptive local signatures */
import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { z } from 'zod'
import type { AssessmentDefinition, ScoringMatrixItem } from '~~/shared/types/schemas/assessment/assessment'
import type {
  AssessmentResponse,
  AssessmentResponseAnswer,
  AssessmentResponseCustomOutcome,
  AssessmentResponseOutcome
} from '~~/shared/types/schemas/assessment/assessmentresponse'
import {
  createAssessmentResponseValidationSchema,
  createAssessmentReviewAlignmentValidationSchema
} from '~~/shared/types/schemas/assessment/assessmentresponse'
import type { AssessmentRuntimeSummary } from '~~/shared/types/schemas/assessment/currentassessment'
import { useCurrentAssessment } from '~/composables/useCurrentAssessment'
import type { AssessmentDefinitionEditorState, AssessmentSectionRow } from '~/composables/useAssessmentSchemaEditorState'
import { normalizeAssessmentDefinitionEditorState } from '~/composables/useAssessmentSchemaEditorState'
import type { TranslatedTabItem } from '~~/shared/types/ui'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import { appRouteLocations } from '~/utils/route-locations'
import { getReviewReturnPath } from '~/utils/review-navigation'
import { useUrlTabState } from '~/composables/useUrlTabState'

type AssessmentDetailResponse = {
  id: string
  runtimeId: string
  runtimeItemId: string
  runtimeState: RuntimeState
  attempt: number
  previousRuntimeId: string | null
  publicationVersionId: string
  egcs_cn_reviewresult: number
  egcs_cn_reviewset: string
  egcs_cn_reviewschema: string
  egcs_cn_helpers?: Record<string, unknown> | null
  egcs_cn_disablecustomoutcomes: boolean
  egcs_cn_disablealignment: boolean
  egcs_cn_disablereviewers: boolean
  egcs_cn_reviewalignment: boolean
  egcs_cn_reviewalignresult: number | null
  egcs_cn_reviewalignmentnarrative: string
  egcs_cn_entitytype: string
  egcs_cn_entityid: string
  egcs_cn_transferpaymentstream: string | null
  egcs_cn_agency: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_outcomename_en: string
  egcs_cn_outcomename_fr: string
  publicationVersion: number
  egcs_cn_scoringmatrix: ScoringMatrixItem[]
  egcs_cn_assessmentschema: AssessmentDefinition
  entity_name_en?: string
  entity_name_fr?: string
  entity_operating_name_en?: string
  entity_operating_name_fr?: string
  permissions?: {
    can_read: boolean
    can_update: boolean
  }
  reviewRuntime?: {
    is_locked: boolean
    total_additional_reviewer_count: number
    pending_additional_reviewer_count: number
  }
  assessmentResponse: AssessmentResponse
  runtime: AssessmentRuntimeSummary
}

const OUTCOMES_TAB_KEY = 'transfer_payment.outcomes'
const REVIEW_TAB_KEY = 'assessment.review'

/** Normalizes translated tab labels into URL-safe tab values. */
const toSectionValue = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

const createAnswerKey = (sectionName: string, subSectionName: string, questionName: string) =>
  [sectionName, subSectionName, questionName].map(encodeURIComponent).join('::')

const createOutcomeKey = (section: string, subsection: string, nameEn: string, nameFr: string) =>
  [section, subsection, nameEn, nameFr].map(encodeURIComponent).join('::')

const getCurrentOverallResultOption = (
  scoringMatrixItems: ScoringMatrixItem[],
  weightedScore: number
) => scoringMatrixItems.find(item => weightedScore <= item.max) ?? null

/**
 * Coordinates assessment detail page state, persistence, and runtime derivations.
 */
export const useAssessmentDetailPage = () => {
  const route = useRoute()
  const localePath = useLocalePath()
  const toast = useToast()
  const { showError } = useApiErrorToast()
  const { t, locale } = useI18n()
  const { translateMessage, createValidator } = useZodI18n()
  const { getHeroCollapsed } = useDashboard()
  const { getBilingualValue } = useBilingualValue()

  const reviewId = computed(() => String(route.params.reviewId))
  const {
    data: assessment,
    error: loadError,
    status: loadStatus,
    refresh
  } = useFetch<AssessmentDetailResponse, FetchError, string>(computed(() => `/api/reviews/${reviewId.value}/assessment`))

  const assessmentDefinition: ComputedRef<AssessmentDefinition | null> = computed(() =>
    assessment.value?.egcs_cn_assessmentschema ?? null
  )
  const assessmentDefinitionState: ComputedRef<AssessmentDefinitionEditorState | null> = computed(() =>
    assessmentDefinition.value ? normalizeAssessmentDefinitionEditorState(assessmentDefinition.value) : null
  )
  const scoringMatrix: ComputedRef<ScoringMatrixItem[]> = computed(() =>
    assessment.value?.egcs_cn_scoringmatrix ?? []
  )
  const helperState: ComputedRef<Record<string, unknown> | null> = computed(() =>
    assessment.value?.egcs_cn_helpers ?? null
  )
  const assessmentResponse: Ref<AssessmentResponse> = ref({
    answers: [],
    outcomes: [],
    customOutcomes: [],
    egcs_cn_reviewalignment: false,
    egcs_cn_reviewalignresult: null,
    egcs_cn_reviewalignmentnarrative: ''
  })
  const serializeResponse = (value: AssessmentResponse) => JSON.stringify(value)
  const persistedResponse = ref(serializeResponse(assessmentResponse.value))
  const isDirty = computed(() => serializeResponse(assessmentResponse.value) !== persistedResponse.value)
  const isSaving: Ref<boolean> = ref(false)
  const totalAdditionalReviewerCount: Ref<number> = ref(0)
  const pendingAdditionalReviewerCount: Ref<number> = ref(0)
  const customOutcomesDisabled = computed(() => assessment.value?.egcs_cn_disablecustomoutcomes === true)
  const alignmentDisabled = computed(() => assessment.value?.egcs_cn_disablealignment === true)

  watch(assessment, value => {
    totalAdditionalReviewerCount.value = value?.reviewRuntime?.total_additional_reviewer_count ?? 0
    pendingAdditionalReviewerCount.value = value?.reviewRuntime?.pending_additional_reviewer_count ?? 0
    const nextResponse: AssessmentResponse = value?.assessmentResponse
      ? {
          answers: value.assessmentResponse.answers.map((answer: AssessmentResponseAnswer) => ({ ...answer })),
          outcomes: value.assessmentResponse.outcomes.map((outcome: AssessmentResponseOutcome) => ({ ...outcome })),
          customOutcomes: (value.assessmentResponse.customOutcomes ?? []).map((customOutcome: AssessmentResponseCustomOutcome) => ({ ...customOutcome })),
          egcs_cn_reviewalignment: value.assessmentResponse.egcs_cn_reviewalignment === true,
          egcs_cn_reviewalignresult: value.assessmentResponse.egcs_cn_reviewalignresult ?? null,
          egcs_cn_reviewalignmentnarrative: value.assessmentResponse.egcs_cn_reviewalignmentnarrative ?? ''
        }
      : {
          answers: [],
          outcomes: [],
          customOutcomes: [],
          egcs_cn_reviewalignment: false,
          egcs_cn_reviewalignresult: null,
          egcs_cn_reviewalignmentnarrative: ''
        }
    if (!isDirty.value) {
      assessmentResponse.value = nextResponse
      persistedResponse.value = serializeResponse(nextResponse)
    }
  }, { immediate: true })
  watch(reviewId, () => {
    assessmentResponse.value = { answers: [], outcomes: [], customOutcomes: [], egcs_cn_reviewalignment: false, egcs_cn_reviewalignresult: null, egcs_cn_reviewalignmentnarrative: '' }
    persistedResponse.value = serializeResponse(assessmentResponse.value)
    isSaving.value = false
  })

  const reviewRuntimeContext = computed(() => ({
    reviewAlignmentDisabled: alignmentDisabled.value,
    reviewersDisabled: assessment.value?.egcs_cn_disablereviewers === true,
    totalAdditionalReviewerCount: totalAdditionalReviewerCount.value,
    pendingAdditionalReviewerCount: pendingAdditionalReviewerCount.value,
    isReviewLocked: assessment.value?.reviewRuntime?.is_locked === true
  }))

  const {
    runtimeSummary,
    currentScore,
    generatedOutcomes
  } = useCurrentAssessment(assessmentResponse, assessmentDefinition, scoringMatrix, helperState, reviewRuntimeContext)

  watch(generatedOutcomes, value => {
    const generatedOutcomeMap = new Map(value.map(outcome => [
      createOutcomeKey(outcome.section, outcome.subsection, outcome.nameEn, outcome.nameFr),
      outcome
    ]))

    if (generatedOutcomeMap.size === 0) {
      if (assessmentResponse.value.outcomes.length > 0) {
        assessmentResponse.value.outcomes = []
      }
      return
    }

    const nextOutcomes = value.map(outcome => {
      const existing = assessmentResponse.value.outcomes.find(item =>
        createOutcomeKey(item.section, item.subsection, item.nameEn, item.nameFr)
        === createOutcomeKey(outcome.section, outcome.subsection, outcome.nameEn, outcome.nameFr)
      )
      const selectedStrategy = existing?.selectedStrategy && outcome.options.some(option => option.value === existing.selectedStrategy)
        ? existing.selectedStrategy
        : outcome.selectedStrategy

      return {
        section: outcome.section,
        subsection: outcome.subsection,
        nameEn: outcome.nameEn,
        nameFr: outcome.nameFr,
        recommendedStrategy: outcome.recommendedStrategy,
        selectedStrategy,
        accepted: selectedStrategy !== '' && selectedStrategy === outcome.recommendedStrategy,
        justification: selectedStrategy === outcome.recommendedStrategy ? '' : existing?.justification ?? outcome.justification,
        comment: existing?.comment ?? outcome.comment
      } satisfies AssessmentResponseOutcome
    })
    const currentSerialized = JSON.stringify(assessmentResponse.value.outcomes)
    const nextSerialized = JSON.stringify(nextOutcomes)

    if (currentSerialized !== nextSerialized) {
      assessmentResponse.value.outcomes = nextOutcomes
    }
  }, { immediate: true })

  const getAnswerRecord = (sectionName: string, subSectionName: string, questionName: string) =>
    assessmentResponse.value.answers.find(answer => createAnswerKey(answer.section, answer.subsection, answer.question)
      === createAnswerKey(sectionName, subSectionName, questionName))

  /** Ensures there is a mutable answer record for the requested question. */
  const ensureAnswerRecord = (sectionName: string, subSectionName: string, questionName: string) => {
    const existing = getAnswerRecord(sectionName, subSectionName, questionName)
    if (existing) {
      return existing
    }

    const nextValue: AssessmentResponseAnswer = {
      section: sectionName,
      subsection: subSectionName,
      question: questionName,
      value: null,
      comment: ''
    }
    assessmentResponse.value.answers.push(nextValue)
    return nextValue
  }

  /** Returns the legacy question-state shape still used by existing tests. */
  const ensureQuestionState = (sectionName: string, subSectionName: string, questionName: string) => {
    const answer = ensureAnswerRecord(sectionName, subSectionName, questionName)
    return {
      value: answer.value === null || answer.value === undefined ? null : String(answer.value),
      comment: answer.comment
    }
  }

  /**
   * Stores a numeric answer value, clearing invalid or empty inputs back to null.
   */
  const setAnswerValue = (sectionName: string, subSectionName: string, questionName: string, value: string | null) => {
    const answer = ensureAnswerRecord(sectionName, subSectionName, questionName)
    if (value === null || value === '') {
      answer.value = null
      return
    }

    const parsedValue = Number(value)
    answer.value = Number.isFinite(parsedValue) ? parsedValue : null
  }

  const setAnswerComment = (sectionName: string, subSectionName: string, questionName: string, value: string) => {
    const answer = ensureAnswerRecord(sectionName, subSectionName, questionName)
    answer.comment = value
  }

  /** Applies the selected strategy and resets justification when the choice matches the recommendation. */
  const setOutcomeSelection = (section: string, subsection: string, nameEn: string, nameFr: string, value: string) => {
    const expectedKey = createOutcomeKey(section, subsection, nameEn, nameFr)
    for (let index = 0; index < assessmentResponse.value.outcomes.length; index++) {
      const candidate = assessmentResponse.value.outcomes[index]!
      if (createOutcomeKey(candidate.section, candidate.subsection, candidate.nameEn, candidate.nameFr) === expectedKey) {
        assessmentResponse.value.outcomes[index]!.selectedStrategy = value
        assessmentResponse.value.outcomes[index]!.accepted = value !== '' && value === candidate.recommendedStrategy
        if (assessmentResponse.value.outcomes[index]!.accepted) {
          assessmentResponse.value.outcomes[index]!.justification = ''
        }
        return
      }
    }
  }

  /** Stores reviewer justification for a non-recommended outcome selection. */
  const setOutcomeJustification = (section: string, subsection: string, nameEn: string, nameFr: string, value: string) => {
    const expectedKey = createOutcomeKey(section, subsection, nameEn, nameFr)
    for (let index = 0; index < assessmentResponse.value.outcomes.length; index++) {
      const candidate = assessmentResponse.value.outcomes[index]!
      if (createOutcomeKey(candidate.section, candidate.subsection, candidate.nameEn, candidate.nameFr) === expectedKey) {
        assessmentResponse.value.outcomes[index]!.justification = value
        return
      }
    }
  }

  /** Stores reviewer comments for the selected outcome row. */
  const setOutcomeComment = (section: string, subsection: string, nameEn: string, nameFr: string, value: string) => {
    const expectedKey = createOutcomeKey(section, subsection, nameEn, nameFr)
    for (let index = 0; index < assessmentResponse.value.outcomes.length; index++) {
      const candidate = assessmentResponse.value.outcomes[index]!
      if (createOutcomeKey(candidate.section, candidate.subsection, candidate.nameEn, candidate.nameFr) === expectedKey) {
        assessmentResponse.value.outcomes[index]!.comment = value
        return
      }
    }
  }

  /** Adds a new empty custom outcome row to the assessment payload. */
  const addCustomOutcome = () => {
    if (customOutcomesDisabled.value) {
      return
    }

    const nextValue: AssessmentResponseCustomOutcome = {
      name: '',
      outcome: ''
    }

    assessmentResponse.value.customOutcomes.push(nextValue)
  }

  /** Removes a custom outcome row by index. */
  const removeCustomOutcome = (index: number) => {
    assessmentResponse.value.customOutcomes.splice(index, 1)
  }

  /** Updates a single custom outcome field. */
  const updateCustomOutcome = (
    index: number,
    field: 'name' | 'outcome',
    value: string
  ) => {
    const customOutcome = assessmentResponse.value.customOutcomes[index]

    if (!customOutcome) {
      return
    }

    customOutcome[field] = value
  }

  const currentOverallResultOption = computed(() => getCurrentOverallResultOption(
    scoringMatrix.value,
    runtimeSummary.value?.score.weightedScore ?? 0
  ))
  const reviewAlignResultItems = computed(() => scoringMatrix.value
    .map(item => ({
      value: item.max,
      label: getBilingualValue({
        label_en: item.label.en,
        label_fr: item.label.fr
      }, 'label', String(item.max))
    })))
  const reviewAlignmentSchema = computed(() => createAssessmentReviewAlignmentValidationSchema(
    scoringMatrix.value,
    runtimeSummary.value?.score.weightedScore ?? 0,
    alignmentDisabled.value
  ))
  const assessmentValidationSchema = computed(() => createAssessmentResponseValidationSchema(
    assessmentDefinition.value ?? { sections: [], sectionMatrix: [], outcomes: [], impactors: [] },
    scoringMatrix.value,
    helperState.value,
    {
      enforceCompletion: false,
      disableCustomOutcomes: customOutcomesDisabled.value,
      disableAlignment: alignmentDisabled.value
    }
  ))
  const validateAssessmentResponse = computed(() => createValidator(assessmentValidationSchema.value))
  const validateReviewAlignment = computed(() => createValidator(reviewAlignmentSchema.value))

  /** Toggles reviewer alignment documentation and clears dependent fields when disabled. */
  const setReviewAlignment = (value: boolean) => {
    assessmentResponse.value.egcs_cn_reviewalignment = value

    if (!value) {
      assessmentResponse.value.egcs_cn_reviewalignresult = null
      assessmentResponse.value.egcs_cn_reviewalignmentnarrative = ''
    }
  }

  const setReviewAlignResult = (value: number | null) => {
    assessmentResponse.value.egcs_cn_reviewalignresult = value
  }

  const setReviewAlignmentNarrative = (value: string) => {
    assessmentResponse.value.egcs_cn_reviewalignmentnarrative = value
  }

  /**
   * Reviewer rows are edited through a child runtime component. Mirror its row counts back into
   * the parent composable so the shared runtime summary can keep the scorecard current.
   */
  const setAdditionalReviewerProgress = (value: { total: number; pending: number }) => {
    totalAdditionalReviewerCount.value = value.total
    pendingAdditionalReviewerCount.value = value.pending
  }

  /** Validates and persists the current full assessment response payload. */
  const saveAssessment = async () => {
    if (isSaving.value) {
      return
    }

    try {
      isSaving.value = true
      const validationResult = await assessmentValidationSchema.value.safeParseAsync(assessmentResponse.value)

      if (!validationResult.success) {
        const firstIssue = validationResult.error.issues[0]
        toast.add({
          title: t('common.error'),
          description: firstIssue ? translateMessage(firstIssue.message, firstIssue as z.ZodIssue) : t('apiErrors.validation.failed'),
          color: 'error'
        })
        return
      }

      const targetReviewId = reviewId.value
      const submittedDraft = serializeResponse(validationResult.data)
      const response = await fetch(getClientRequestUrl(`/api/reviews/${targetReviewId}/assessment`), {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(validationResult.data)
      })
      if (!response.ok) {
        await throwFetchResponseError(response)
      }
      if (reviewId.value !== targetReviewId) return
      persistedResponse.value = submittedDraft
      await refresh()
      if (reviewId.value !== targetReviewId) return
      toast.add({
        title: t('common.success'),
        description: t('common.updated_success'),
        color: 'success'
      })
    } catch (error) {
      showError(error)
    } finally {
      isSaving.value = false
    }
  }

  const sectionRows = computed<AssessmentSectionRow[]>(() => assessmentDefinitionState.value?.sections ?? [])
  const sectionTabs = computed(() => sectionRows.value.map((section, index) => ({
    key: `assessment.section.${index}`,
    label: locale.value === 'fr' ? section.label.fr : section.label.en,
    icon: section.icon,
    value: `section-${index}`,
    section
  })))

  const tabs = computed<TranslatedTabItem[]>(() => [
    ...sectionTabs.value.map(sectionTab => ({
      key: sectionTab.key,
      label: sectionTab.label,
      icon: sectionTab.icon,
      value: sectionTab.value
    })),
    {
      key: OUTCOMES_TAB_KEY,
      label: getBilingualValue(assessment.value, 'egcs_cn_outcomename', t('transfer_payment.outcomes')),
      icon: 'i-lucide-flag',
      value: toSectionValue(t('transfer_payment.outcomes'))
    },
    {
      key: REVIEW_TAB_KEY,
      label: t('assessment.review_tab'),
      icon: 'i-lucide-users',
      value: toSectionValue(t('assessment.review_tab'))
    }
  ])
  const outcomesTabValue = computed(() => toSectionValue(t('transfer_payment.outcomes')))
  const reviewTabValue = computed(() => toSectionValue(t('assessment.review_tab')))
  const canUpdateAssessment = computed(() => assessment.value?.permissions?.can_update === true)

  const {
    selectedTab,
    selectedTabKey
  } = useUrlTabState({
    tabs,
    defaultTab: computed(() => sectionTabs.value[0]?.value ?? toSectionValue(t('transfer_payment.outcomes'))),
    enabled: computed(() => Boolean(assessment.value)),
    queryKey: 'section'
  })

  const selectedSection = computed<AssessmentSectionRow | null>(() => {
    if (
      selectedTabKey.value === OUTCOMES_TAB_KEY
      || selectedTab.value === outcomesTabValue.value
      || selectedTabKey.value === REVIEW_TAB_KEY
      || selectedTab.value === reviewTabValue.value
    ) {
      return null
    }

    return sectionTabs.value.find(sectionTab => sectionTab.value === selectedTab.value)?.section ?? sectionRows.value[0] ?? null
  })

  const entityId = computed(() => String(assessment.value?.egcs_cn_entityid ?? ''))
  const entityName = computed(() => getBilingualValue(
    assessment.value,
    'entity_name',
    getBilingualValue(assessment.value, 'entity_operating_name', entityId.value || reviewId.value)
  ))

  const breadcrumbItems = computed(() => {
    const returnPath = getReviewReturnPath(route.query.returnTo)
    if (returnPath) {
      return [
        { label: t('workflow.back_to_entity'), to: returnPath },
        { label: getBilingualValue(assessment.value, 'egcs_cn_name', String(assessment.value?.id ?? '')) }
      ]
    }

    if (assessment.value?.egcs_cn_entitytype === 'applicantrecipient' && entityId.value) {
      return [
        { label: t('applicant_recipient.title'), to: localePath(appRouteLocations.proponents()) },
        {
          label: entityName.value,
          to: localePath({
            ...appRouteLocations.proponentEdit(entityId.value),
            query: { section: 'reviews' }
          })
        },
        { label: getBilingualValue(assessment.value, 'egcs_cn_name', String(assessment.value?.id ?? '')) }
      ]
    }

    return [
      { label: t('transfer_payment.assessment') },
      { label: getBilingualValue(assessment.value, 'egcs_cn_name', String(assessment.value?.id ?? '')) }
    ]
  })

  const heroName = computed(() => getBilingualValue(assessment.value, 'egcs_cn_name', ''))
  const outcomeTabLabel = computed(() => getBilingualValue(assessment.value, 'egcs_cn_outcomename',
    t('transfer_payment.outcomes')))
  const isHeroCollapsed = getHeroCollapsed('assessment-detail')
  const questionState = computed(() => assessmentResponse.value.answers.reduce<Record<string, { value: string | null; comment: string }>>(
    (acc, answer) => {
      acc[createAnswerKey(answer.section, answer.subsection, answer.question)] = {
        value: answer.value === null || answer.value === undefined ? null : String(answer.value),
        comment: answer.comment
      }
      return acc
    },
    {}
  ))

  return {
    assessment,
    loadError,
    loadStatus,
    isDirty,
    assessmentResponse,
    assessmentDefinitionState,
    runtimeSummary,
    currentScore,
    generatedOutcomes,
    isSaving,
    saveAssessment,
    sectionTabs,
    tabs,
    selectedTab,
    selectedTabKey,
    selectedSection,
    questionState,
    breadcrumbItems,
    heroName,
    entityName,
    outcomeTabLabel,
    isHeroCollapsed,
    setAnswerValue,
    setAnswerComment,
    getAnswerRecord,
    ensureQuestionState,
    setOutcomeSelection,
    setOutcomeJustification,
    setOutcomeComment,
    addCustomOutcome,
    removeCustomOutcome,
    updateCustomOutcome,
    customOutcomesDisabled,
    alignmentDisabled,
    currentOverallResultOption,
    reviewAlignResultItems,
    validateAssessmentResponse,
    validateReviewAlignment,
    canUpdateAssessment,
    setReviewAlignment,
    setReviewAlignResult,
    setReviewAlignmentNarrative,
    setAdditionalReviewerProgress,
    refreshAssessment: refresh,
    outcomesTabId: OUTCOMES_TAB_KEY,
    outcomesTabValue,
    reviewTabId: REVIEW_TAB_KEY,
    reviewTabValue
  }
}
