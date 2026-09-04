/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- typed runtime helpers expose their contracts through explicit signatures */
import type {
  AssessmentDefinition,
  AssessmentQuestionItem,
  CommentThreshold,
  Dependency,
  DependencyOn,
  ScoringMatrixItem,
  Section,
  SubSection
} from '../types/schemas/assessment/assessment'
import type {
  AssessmentResponse,
  AssessmentResponseAnswer,
  AssessmentResponseOutcome
} from '../types/schemas/assessment/assessmentresponse'
import type {
  AssessmentRuntimeBlockingIssue,
  AssessmentRuntimeCalculatedAnswer,
  AssessmentRuntimeGeneratedOutcome,
  AssessmentRuntimeReviewContext,
  AssessmentRuntimeReviewStatusItem,
  AssessmentRuntimeImpactorScore,
  AssessmentRuntimeScore,
  AssessmentRuntimeScoreItem,
  AssessmentRuntimeSectionScore,
  AssessmentRuntimeSectionStatus,
  AssessmentRuntimeStatus,
  AssessmentRuntimeStatusItem,
  AssessmentRuntimeSubSectionScore,
  AssessmentRuntimeSummary
} from '../types/schemas/assessment/currentassessment'
import type { EnFrLabel } from '../types/schemas/common'
import {
  buildAssessmentCalculationKey,
  collectDependencyAnswerKeys,
  resolveAssessmentCalculationValues
} from './assessment-calculation'

type AssessmentRuntimeSchema = AssessmentDefinition & {
  scoringMatrix: ScoringMatrixItem[]
}

const EMPTY_LABEL: EnFrLabel = {
  en: '',
  fr: ''
}

const REVIEW_ALIGNMENT_LABEL: EnFrLabel = {
  en: 'Review Alignment',
  fr: 'Alignement de l\'examen'
}

const ADDITIONAL_REVIEWERS_LABEL: EnFrLabel = {
  en: 'Additional Reviewers',
  fr: 'Examinateurs additionnels'
}

const COMPLETION_LABEL: EnFrLabel = {
  en: 'Completion',
  fr: 'Achèvement'
}

/** Rounds runtime numeric values to two decimal places. */
const normalizeNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Number.parseFloat(value.toFixed(2))
}

const buildAnswerKey = (section: string, subsection: string, question: string) =>
  [section, subsection, question].map(encodeURIComponent).join('::')

/** Builds a stable key for persisted outcome rows. */
const buildOutcomeKey = (
  section: string,
  subsection: string,
  nameEn: string,
  nameFr: string
) => [section, subsection, nameEn, nameFr].map(encodeURIComponent).join('::')

/** Collapses child statuses into a single parent status for scorecard rendering. */
const getAggregateStatus = (
  items: Array<{ status: AssessmentRuntimeStatus }>,
  statusWhenEmpty: AssessmentRuntimeStatus = 'empty'
): AssessmentRuntimeStatus => {
  if (items.length === 0) {
    return statusWhenEmpty
  }

  if (items.every(item => item.status === 'completed')) {
    return 'completed'
  }

  if (items.every(item => item.status === 'empty')) {
    return 'empty'
  }

  return 'in_progress'
}

/** Resolves the bilingual score band label for a numeric score. */
const getScoreLabel = (scoringMatrixItems: ScoringMatrixItem[], score?: number): EnFrLabel => {
  if (score === undefined) {
    return EMPTY_LABEL
  }

  return scoringMatrixItems.find(item => score <= item.max)?.label ?? EMPTY_LABEL
}

/** Resolves the configured color indicator for a numeric score. */
const getScoreIndicator = (scoringMatrixItems: ScoringMatrixItem[], score?: number) => {
  if (score === undefined) {
    return ''
  }

  return scoringMatrixItems.find(item => score <= item.max)?.indicator ?? ''
}

/** Indexes answer rows by section, subsection, and question identity. */
const getResponseAnswerMap = (response: AssessmentResponse) => response.answers.reduce<Map<string, AssessmentResponseAnswer>>(
  (acc, answer) => {
    acc.set(buildAnswerKey(answer.section, answer.subsection, answer.question), answer)
    return acc
  },
  new Map<string, AssessmentResponseAnswer>()
)

/** Indexes answer values by section, subsection, and question identity. */
const getResponseAnswerValueMap = (response: AssessmentResponse) => response.answers.reduce<Map<string, number | null | undefined>>(
  (acc, answer) => {
    acc.set(buildAnswerKey(answer.section, answer.subsection, answer.question), answer.value)
    return acc
  },
  new Map<string, number | null | undefined>()
)

/** Indexes outcome rows by review outcome identity. */
const getResponseOutcomeMap = (response: AssessmentResponse) => response.outcomes.reduce<Map<string, AssessmentResponseOutcome>>(
  (acc, outcome) => {
    acc.set(buildOutcomeKey(outcome.section, outcome.subsection, outcome.nameEn, outcome.nameFr), outcome)
    return acc
  },
  new Map<string, AssessmentResponseOutcome>()
)

/** Reads a saved answer row by schema coordinates. */
const getAnswer = (
  answerMap: Map<string, AssessmentResponseAnswer>,
  section: string,
  subsection: string,
  question: string
) => answerMap.get(buildAnswerKey(section, subsection, question))

/** Reads a saved numeric answer value by schema coordinates. */
const getAnswerValue = (
  answerValueMap: Map<string, number | null | undefined>,
  section: string,
  subsection: string,
  question: string
) => answerValueMap.get(buildAnswerKey(section, subsection, question))

/** Resolves a dependency target value from either helpers or previous answers. */
const getDependencyValue = (
  answerValueMap: Map<string, number | null | undefined>,
  helpers: Record<string, unknown>,
  on: DependencyOn
): unknown => {
  if (on.type === 'helpers') {
    return helpers[on.field]
  }

  return getAnswerValue(answerValueMap, on.section, on.subsection, on.question)
}

/** Evaluates a single dependency clause against the current runtime state. */
const evaluateDependencyClause = (
  answerValueMap: Map<string, number | null | undefined>,
  helpers: Record<string, unknown>,
  clause: { on: DependencyOn; value: string | number | boolean }
) => {
  const currentValue = getDependencyValue(answerValueMap, helpers, clause.on)

  if (currentValue === undefined || currentValue === null) {
    return true
  }

  return currentValue === clause.value
}

/** Evaluates a dependency group, supporting OR groups inside an AND list. */
const evaluateDependency = (
  answerValueMap: Map<string, number | null | undefined>,
  helpers: Record<string, unknown>,
  dependency: Dependency
) => {
  if (Array.isArray(dependency)) {
    return dependency.some(clause => evaluateDependencyClause(answerValueMap, helpers, clause))
  }

  return evaluateDependencyClause(answerValueMap, helpers, dependency)
}

/** Determines whether every configured dependency currently evaluates as applicable. */
const dependenciesMet = (
  answerValueMap: Map<string, number | null | undefined>,
  helpers: Record<string, unknown>,
  depends?: Dependency[]
) => {
  if (!depends || depends.length === 0) {
    return true
  }

  return depends.every(dependency => evaluateDependency(answerValueMap, helpers, dependency))
}

/** Determines whether a dependent subsection or question is currently applicable. */
export const questionSubsectionNeedsAnswering = (
  response: AssessmentResponse,
  helpers: Record<string, unknown>,
  depends?: Dependency[],
  answerValueMap?: Map<string, number | null | undefined>
) => {
  return dependenciesMet(answerValueMap ?? getResponseAnswerValueMap(response), helpers, depends)
}

/** Resolves manual and calculated answers into a single value map for runtime scoring. */
const buildResolvedAssessmentAnswerState = (
  response: AssessmentResponse,
  schema: AssessmentRuntimeSchema,
  helpers: Record<string, unknown>
): {
  answerValueMap: Map<string, number | null | undefined>
  calculatedAnswers: AssessmentRuntimeCalculatedAnswer[]
} => {
  const answerValueMap = getResponseAnswerValueMap(response)
  const calculationState = new Map<string, { subsectionDepends?: Dependency[]; itemDepends?: Dependency[] }>()
  const calculationItems = schema.sections.flatMap(section => section.subSections.flatMap(subsection => {
    const subsectionDependencyKeys = collectDependencyAnswerKeys(subsection.depends)

    return subsection.questions.flatMap(item => {
      if (item.type !== 'calculation') {
        return []
      }

      const key = buildAssessmentCalculationKey(section.name, subsection.name, item.name)
      calculationState.set(key, {
        subsectionDepends: subsection.depends,
        itemDepends: item.depends
      })

      return [{
        key,
        section: section.name,
        subsection: subsection.name,
        question: item.name,
        expression: item.formula,
        dependencyKeys: [
          ...subsectionDependencyKeys,
          ...collectDependencyAnswerKeys(item.depends)
        ]
      }]
    })
  }))

  const calculatedAnswers = resolveAssessmentCalculationValues(
    calculationItems,
    answerValueMap,
    helpers,
    (item, valuesByKey) => {
      const calculationConfig = calculationState.get(item.key)
      return dependenciesMet(valuesByKey, helpers, calculationConfig?.subsectionDepends)
        && dependenciesMet(valuesByKey, helpers, calculationConfig?.itemDepends)
    }
  )

  calculatedAnswers.forEach(answer => {
    answerValueMap.set(buildAnswerKey(answer.section, answer.subsection, answer.question), answer.value)
  })

  return {
    answerValueMap,
    calculatedAnswers
  }
}

/** Resolves a static or helper-adjusted weight definition into a numeric weight. */
const resolveWeight = (
  answerValueMap: Map<string, number | null | undefined>,
  helpers: Record<string, unknown>,
  weightConfig: Section['subSections'][number]['weight'] | AssessmentQuestionItem['weight']
) => {
  if (Array.isArray(weightConfig)) {
    return normalizeNumber(weightConfig[1].reduce((acc, current) => {
      const dependencyValue = getDependencyValue(answerValueMap, helpers, current.on)
      const normalizedDependency = dependencyValue === undefined || dependencyValue === null
        ? undefined
        : String(dependencyValue)
      const currentWeight = normalizedDependency ? current.weights[normalizedDependency] : undefined

      if (currentWeight === undefined) {
        return acc
      }

      return acc * currentWeight
    }, weightConfig[0]))
  }

  if (weightConfig.adjustable) {
    const dependencyValue = getDependencyValue(answerValueMap, helpers, weightConfig.on)
    const normalizedDependency = dependencyValue === undefined || dependencyValue === null
      ? undefined
      : String(dependencyValue)

    return normalizeNumber(normalizedDependency ? weightConfig.weights[normalizedDependency] ?? 0 : 0)
  }

  return normalizeNumber(weightConfig.weight)
}

/** Determines whether the selected score requires a reviewer comment. */
export const commentsRequired = (fieldValue: number | null | undefined, commentThreshold?: CommentThreshold) => {
  if (fieldValue === undefined || fieldValue === null || !commentThreshold) {
    return false
  }

  return fieldValue >= commentThreshold.min && fieldValue <= commentThreshold.max
}

/** Builds completion status rows for applicable subsections in a section. */
const getSubSectionStatusItems = (
  answerMap: Map<string, AssessmentResponseAnswer>,
  answerValueMap: Map<string, number | null | undefined>,
  response: AssessmentResponse,
  helpers: Record<string, unknown>,
  section: Section
) => section.subSections.reduce<AssessmentRuntimeStatusItem[]>((acc, subsection) => {
  if (!questionSubsectionNeedsAnswering(response, helpers, subsection.depends, answerValueMap)) {
    return acc
  }

  const applicableQuestions = subsection.questions.filter(item => {
    if (!questionSubsectionNeedsAnswering(response, helpers, item.depends, answerValueMap)) {
      return false
    }

    return item.type !== 'calculation'
  }) as Extract<AssessmentQuestionItem, { type: 'question' }>[]

  const hasStarted = applicableQuestions.some(item => {
    const answer = getAnswer(answerMap, section.name, subsection.name, item.name)
    return !!answer && (
      (
        answer.value !== null
        && answer.value !== undefined
      )
      || String(answer.comment ?? '').trim().length > 0
    )
  })

  const hasPendingQuestion = applicableQuestions.some(item => {
    const answer = getAnswer(answerMap, section.name, subsection.name, item.name)
    if (!answer || answer.value === null || answer.value === undefined) {
      return true
    }

    return commentsRequired(answer.value, item.commentThreshold) && !String(answer.comment ?? '').trim()
  })

  const status: AssessmentRuntimeStatus = !hasStarted
    ? 'empty'
    : hasPendingQuestion
      ? 'in_progress'
      : 'completed'

  acc.push({
    name: subsection.name,
    label: subsection.label,
    status
  })
  return acc
}, [])

/** Returns the completion status for a single subsection. */
export const getSubSectionStatus = (
  section: Section,
  subsection: SubSection,
  response: AssessmentResponse,
  helpers: Record<string, unknown>
): AssessmentRuntimeStatus => {
  const helperValues = helpers ?? {}
  const { answerValueMap } = buildResolvedAssessmentAnswerState(response, {
    sections: [section],
    sectionMatrix: [],
    outcomes: [],
    impactors: [],
    scoringMatrix: []
  }, helperValues)
  const subsectionStatus = getSubSectionStatusItems(getResponseAnswerMap(response), answerValueMap, response, helperValues, section)
    .find(item => item.name === subsection.name)

  return subsectionStatus?.status ?? 'empty'
}

/** Computes per-question and per-subsection scores for a section. */
const getSubSectionScores = (
  answerValueMap: Map<string, number | null | undefined>,
  section: Section,
  response: AssessmentResponse,
  helpers: Record<string, unknown>
) => section.subSections.reduce<AssessmentRuntimeSubSectionScore[]>((acc, subsection) => {
  if (!questionSubsectionNeedsAnswering(response, helpers, subsection.depends, answerValueMap)) {
    return acc
  }

  const questionScores = subsection.questions.reduce<AssessmentRuntimeScoreItem[]>((questionAcc, item) => {
    if (!questionSubsectionNeedsAnswering(response, helpers, item.depends, answerValueMap)) {
      return questionAcc
    }

    const rawValue = getAnswerValue(answerValueMap, section.name, subsection.name, item.name)
    const normalizedRawValue = typeof rawValue === 'number' ? rawValue : 0
    const weight = resolveWeight(answerValueMap, helpers, item.weight)

    questionAcc.push({
      name: item.name,
      label: item.question,
      rawScore: normalizeNumber(normalizedRawValue),
      weightedScore: normalizeNumber(normalizedRawValue * weight),
      weight,
      source: item.type
    })
    return questionAcc
  }, [])

  const subsectionWeight = resolveWeight(answerValueMap, helpers, subsection.weight)
  const rawSubsectionScore = normalizeNumber(questionScores.reduce((total, score) => total + score.weightedScore, 0))

  acc.push({
    name: subsection.name,
    label: subsection.label,
    rawScore: rawSubsectionScore,
    weightedScore: normalizeNumber(rawSubsectionScore * subsectionWeight),
    weight: subsectionWeight,
    source: 'question',
    questions: questionScores
  })
  return acc
}, [])

/** Calculates section, impactor, and final assessment scores. */
export const calculateScore = (
  response: AssessmentResponse,
  schema: AssessmentRuntimeSchema,
  helpers: Record<string, unknown> | null | undefined,
  answerValueMap?: Map<string, number | null | undefined>
): AssessmentRuntimeScore => {
  const helperValues = helpers ?? {}
  const resolvedAnswerValueMap = answerValueMap ?? buildResolvedAssessmentAnswerState(response, schema, helperValues).answerValueMap
  const maxSectionScore = schema.sectionMatrix.reduce((max, current) => current.max > max ? current.max : max, 0)
  const maxAssessmentScore = schema.scoringMatrix.reduce((max, current) => current.max > max ? current.max : max, 0)

  const scoredSections = schema.sections.reduce<AssessmentRuntimeSectionScore[]>((acc, section) => {
    const scoredSubSections = getSubSectionScores(resolvedAnswerValueMap, section, response, helperValues)
    const rawScore = Math.min(
      normalizeNumber(scoredSubSections.reduce((total, score) => total + score.weightedScore, 0)),
      maxSectionScore
    )

    acc.push({
      score: {
        name: section.name,
        label: section.label,
        rawScore,
        weightedScore: normalizeNumber(section.weight * rawScore),
        weight: section.weight,
        source: 'question'
      },
      totalScore: maxSectionScore,
      scoredSubSections,
      scoreLabel: getScoreLabel(schema.sectionMatrix, rawScore),
      scoreIndicator: getScoreIndicator(schema.sectionMatrix, rawScore)
    })
    return acc
  }, [])

  const weightedScore = normalizeNumber(scoredSections.reduce((total, section) => total + section.score.weightedScore, 0))

  const impactors = (schema.impactors ?? []).reduce<AssessmentRuntimeImpactorScore[]>((acc, impactor) => {
    const dependencyValue = getDependencyValue(resolvedAnswerValueMap, helperValues, impactor.on)
    const normalizedDependency = typeof dependencyValue === 'number'
      ? dependencyValue
      : Number(dependencyValue)
    const impactorBand = Number.isFinite(normalizedDependency)
      ? impactor.scoringMatrix.find(item => normalizedDependency <= item.max)?.value ?? 0
      : 0
    const score = normalizeNumber(impactorBand * impactor.weight)
    const indicator = getScoreIndicator(schema.sectionMatrix, impactorBand)

    acc.push({
      target: impactor.on,
      label: impactor.label ?? {
        en: 'Impactor',
        fr: 'Impact'
      },
      score,
      weight: impactor.weight,
      indicator
    })
    return acc
  }, [])

  const impactorTotalWeight = normalizeNumber(impactors.reduce((total, impactor) => total + impactor.weight, 0))
  const impactorScore = normalizeNumber(impactors.reduce((total, impactor) => total + impactor.score, 0))
  const impactorAverage = impactorTotalWeight > 0 ? normalizeNumber(impactorScore / impactorTotalWeight) : 0
  const totalWeightedScore = Math.min(normalizeNumber(weightedScore + impactorScore), maxAssessmentScore)

  return {
    weightedScore: totalWeightedScore,
    totalScore: maxAssessmentScore,
    scoreLabel: getScoreLabel(schema.scoringMatrix, totalWeightedScore),
    scoreIndicator: getScoreIndicator(schema.scoringMatrix, totalWeightedScore),
    impactorScore,
    impactorLabel: getScoreLabel(schema.sectionMatrix, impactorAverage),
    impactorIndicator: getScoreIndicator(schema.sectionMatrix, impactorAverage),
    impactorTotalWeight,
    impactors,
    scoredSections
  }
}

/** Generates applicable outcome rows from the final score and schema definitions. */
const getSelectedOutcomeStrategy = (
  savedOutcome: AssessmentResponseOutcome | undefined,
  strategy: AssessmentRuntimeSchema['outcomes'][number]['strategies'][number]
): string => {
  const allowedValues = new Set(strategy.options.map(option => option.value))
  return savedOutcome?.selectedStrategy && allowedValues.has(savedOutcome.selectedStrategy)
    ? savedOutcome.selectedStrategy
    : ''
}

const isRecommendedOutcomeStrategyAccepted = (
  selectedStrategy: string,
  recommendedStrategy: string
): boolean => selectedStrategy !== '' && selectedStrategy === recommendedStrategy

/** Projects an outcome into its selectable state and accepted recommendation strategy. */
const buildApplicableOutcome = (
  outcomeGroup: AssessmentRuntimeSchema['outcomes'][number],
  strategy: AssessmentRuntimeSchema['outcomes'][number]['strategies'][number],
  outcomeMap: Map<string, AssessmentResponseOutcome>,
  score: AssessmentRuntimeScore
): AssessmentRuntimeGeneratedOutcome => {
  const recommendedOption = strategy.options.find(option => score.weightedScore <= option.max) ?? strategy.options.at(-1)
  const savedOutcome = outcomeMap.get(
    buildOutcomeKey(outcomeGroup.name, strategy.name, strategy.label.en, strategy.label.fr)
  )
  const selectedStrategy = getSelectedOutcomeStrategy(savedOutcome, strategy)
  const recommendedStrategy = recommendedOption?.value ?? ''

  return {
    section: outcomeGroup.name,
    subsection: strategy.name,
    nameEn: strategy.label.en,
    nameFr: strategy.label.fr,
    sectionLabel: outcomeGroup.label,
    subsectionLabel: strategy.label,
    recommendedStrategy,
    recommendedLabel: recommendedOption?.label ?? EMPTY_LABEL,
    selectedStrategy,
    accepted: isRecommendedOutcomeStrategyAccepted(selectedStrategy, recommendedStrategy),
    justification: savedOutcome?.justification ?? '',
    comment: savedOutcome?.comment ?? '',
    options: strategy.options.map(option => ({
      value: option.value,
      label: option.label
    }))
  }
}

/** Filters assessment outcomes by dependency rules and recommendation acceptance. */
export const getApplicableOutcomes = (
  response: AssessmentResponse,
  schema: AssessmentRuntimeSchema,
  score: AssessmentRuntimeScore
) => {
  const outcomeMap = getResponseOutcomeMap(response)

  return schema.outcomes.flatMap<AssessmentRuntimeGeneratedOutcome>(outcomeGroup =>
    outcomeGroup.strategies.map(strategy => buildApplicableOutcome(outcomeGroup, strategy, outcomeMap, score))
  )
}

const buildAssessmentSectionStatuses = (
  schema: AssessmentRuntimeSchema,
  response: AssessmentResponse,
  helpers: Record<string, unknown>,
  answerMap: Map<string, AssessmentResponseAnswer>,
  answerValueMap: Map<string, number | null | undefined>
): AssessmentRuntimeSectionStatus[] => schema.sections.map(section => {
  const subSections = getSubSectionStatusItems(answerMap, answerValueMap, response, helpers, section)

  return {
    name: section.name,
    label: section.label,
    status: getAggregateStatus(subSections),
    subSections,
    icon: section.icon
  }
})

/** Reports missing required answers and threshold-triggered reviewer comments. */
const collectAssessmentAnswerBlockingIssues = (
  response: AssessmentResponse,
  schema: AssessmentRuntimeSchema,
  helpers: Record<string, unknown>,
  answerMap: Map<string, AssessmentResponseAnswer>,
  answerValueMap: Map<string, number | null | undefined>
): AssessmentRuntimeBlockingIssue[] => {
  const blockingIssues: AssessmentRuntimeBlockingIssue[] = []

  schema.sections.forEach(section => {
    section.subSections.forEach(subsection => {
      if (!questionSubsectionNeedsAnswering(response, helpers, subsection.depends, answerValueMap)) {
        return
      }

      subsection.questions.forEach(item => {
        if (item.type === 'calculation') {
          return
        }

        if (!questionSubsectionNeedsAnswering(response, helpers, item.depends, answerValueMap)) {
          return
        }

        const answer = getAnswer(answerMap, section.name, subsection.name, item.name)
        const answerIndex = response.answers.findIndex(candidate =>
          buildAnswerKey(candidate.section, candidate.subsection, candidate.question)
          === buildAnswerKey(section.name, subsection.name, item.name)
        )
        if (!answer || answer.value === null || answer.value === undefined) {
          blockingIssues.push({
            path: ['answers'],
            message: 'validation.incomplete_assessment_answers'
          })
          return
        }

        if (commentsRequired(answer.value, item.commentThreshold) && !String(answer.comment ?? '').trim()) {
          blockingIssues.push({
            path: answerIndex >= 0 ? ['answers', answerIndex, 'comment'] : ['answers'],
            message: 'validation.comments_required_question',
            params: {
              question_en: item.question.en,
              question_fr: item.question.fr
            }
          })
        }
      })
    })
  })

  return blockingIssues
}

/** Reports missing outcome strategies and required recommendation overrides. */
const collectAssessmentOutcomeBlockingIssues = (
  response: AssessmentResponse,
  generatedOutcomes: AssessmentRuntimeGeneratedOutcome[]
): AssessmentRuntimeBlockingIssue[] => {
  const blockingIssues: AssessmentRuntimeBlockingIssue[] = []

  generatedOutcomes.forEach((outcome, index) => {
    const responseOutcomeIndex = response.outcomes.findIndex(candidate =>
      buildOutcomeKey(candidate.section, candidate.subsection, candidate.nameEn, candidate.nameFr)
      === buildOutcomeKey(outcome.section, outcome.subsection, outcome.nameEn, outcome.nameFr)
    )
    if (!outcome.selectedStrategy) {
      blockingIssues.push({
        path: ['outcomes', index, 'selectedStrategy'],
        message: 'validation.outcome_selection_required'
      })
    }

    if (outcome.selectedStrategy && outcome.selectedStrategy !== outcome.recommendedStrategy && !outcome.justification.trim()) {
      blockingIssues.push({
        path: responseOutcomeIndex >= 0 ? ['outcomes', responseOutcomeIndex, 'justification'] : ['outcomes', index, 'justification'],
        message: 'validation.justification_required_outcome',
        params: {
          outcome_en: outcome.nameEn,
          outcome_fr: outcome.nameFr
        }
      })
    }
  })

  return blockingIssues
}

/** Reports repeated answer paths at their duplicate response indexes. */
const collectDuplicateAssessmentAnswerIssues = (
  answers: AssessmentResponseAnswer[]
): AssessmentRuntimeBlockingIssue[] => {
  const uniqueAnswerKeys = new Set<string>()
  const blockingIssues: AssessmentRuntimeBlockingIssue[] = []

  answers.forEach((answer, index) => {
    const key = buildAnswerKey(answer.section, answer.subsection, answer.question)
    if (uniqueAnswerKeys.has(key)) {
      blockingIssues.push({
        path: ['answers', index],
        message: 'validation.duplicate_answer'
      })
      return
    }

    uniqueAnswerKeys.add(key)
  })

  return blockingIssues
}

/** Reports repeated bilingual outcome keys at their duplicate response indexes. */
const collectDuplicateAssessmentOutcomeIssues = (
  outcomes: AssessmentResponseOutcome[]
): AssessmentRuntimeBlockingIssue[] => {
  const uniqueOutcomeKeys = new Set<string>()
  const blockingIssues: AssessmentRuntimeBlockingIssue[] = []

  outcomes.forEach((outcome, index) => {
    const key = buildOutcomeKey(outcome.section, outcome.subsection, outcome.nameEn, outcome.nameFr)
    if (uniqueOutcomeKeys.has(key)) {
      blockingIssues.push({
        path: ['outcomes', index],
        message: 'validation.duplicate_outcome'
      })
      return
    }

    uniqueOutcomeKeys.add(key)
  })

  return blockingIssues
}

const buildAssessmentOutcomeStatuses = (
  generatedOutcomes: AssessmentRuntimeGeneratedOutcome[]
): AssessmentRuntimeStatusItem[] => generatedOutcomes.map(outcome => {
  const hasSelectedStrategy = outcome.selectedStrategy !== ''
  const requiresJustification = hasSelectedStrategy && outcome.selectedStrategy !== outcome.recommendedStrategy
  const hasJustification = outcome.justification.trim().length > 0
  const status: AssessmentRuntimeStatus = !hasSelectedStrategy
    ? 'empty'
    : requiresJustification && !hasJustification
      ? 'in_progress'
      : 'completed'

  return {
    name: `${outcome.section}::${outcome.subsection}::${outcome.nameEn}::${outcome.nameFr}`,
    label: outcome.subsectionLabel,
    status
  }
})

const getReviewAlignmentStatus = (
  response: AssessmentResponse,
  reviewContext?: AssessmentRuntimeReviewContext
): AssessmentRuntimeStatus => {
  const reviewAlignmentDisabled = reviewContext?.reviewAlignmentDisabled === true
  const reviewAlignmentNarrative = response.egcs_cn_reviewalignmentnarrative?.trim() ?? ''

  if (reviewAlignmentDisabled || response.egcs_cn_reviewalignment !== true) {
    return 'completed'
  }

  return response.egcs_cn_reviewalignresult === null || reviewAlignmentNarrative.length === 0
    ? 'in_progress'
    : 'completed'
}

const getAdditionalReviewersStatus = (
  reviewContext?: AssessmentRuntimeReviewContext
): AssessmentRuntimeStatus => {
  const totalAdditionalReviewerCount = Number(reviewContext?.totalAdditionalReviewerCount ?? 0)
  const pendingAdditionalReviewerCount = Number(reviewContext?.pendingAdditionalReviewerCount ?? 0)

  if (reviewContext?.reviewersDisabled === true) {
    return 'completed'
  }

  if (totalAdditionalReviewerCount === 0) {
    return 'empty'
  }

  return pendingAdditionalReviewerCount > 0 ? 'in_progress' : 'completed'
}

/** Derives blocking and completion statuses for each review in an assessment. */
const buildAssessmentReviewStatuses = (
  response: AssessmentResponse,
  reviewContext?: AssessmentRuntimeReviewContext
): AssessmentRuntimeReviewStatusItem[] => {
  const totalAdditionalReviewerCount = Number(reviewContext?.totalAdditionalReviewerCount ?? 0)
  const pendingAdditionalReviewerCount = Number(reviewContext?.pendingAdditionalReviewerCount ?? 0)
  const completionStatus: AssessmentRuntimeStatus = reviewContext?.isReviewLocked === true ? 'completed' : 'empty'

  return [
    {
      name: 'review_alignment',
      label: REVIEW_ALIGNMENT_LABEL,
      status: getReviewAlignmentStatus(response, reviewContext)
    },
    {
      name: 'additional_reviewers',
      label: ADDITIONAL_REVIEWERS_LABEL,
      status: getAdditionalReviewersStatus(reviewContext),
      totalCount: totalAdditionalReviewerCount,
      pendingCount: pendingAdditionalReviewerCount
    },
    {
      name: 'completion',
      label: COMPLETION_LABEL,
      status: completionStatus
    }
  ]
}

/** Builds the complete runtime summary used by both server validation and UI rendering. */
export const buildAssessmentRuntimeSummary = (
  response: AssessmentResponse,
  schema: AssessmentRuntimeSchema,
  helpers: Record<string, unknown> | null | undefined,
  reviewContext?: AssessmentRuntimeReviewContext
): AssessmentRuntimeSummary => {
  const helperValues = helpers ?? {}
  const answerMap = getResponseAnswerMap(response)
  const {
    answerValueMap,
    calculatedAnswers
  } = buildResolvedAssessmentAnswerState(response, schema, helperValues)
  const score = calculateScore(response, schema, helperValues, answerValueMap)
  const sectionStatuses = buildAssessmentSectionStatuses(schema, response, helperValues, answerMap, answerValueMap)

  const answersComplete = sectionStatuses.every(section => section.status === 'completed')
  const generatedOutcomes = answersComplete
    ? getApplicableOutcomes(response, schema, score)
    : []

  const blockingIssues: AssessmentRuntimeBlockingIssue[] = [
    ...collectAssessmentAnswerBlockingIssues(response, schema, helperValues, answerMap, answerValueMap),
    ...(answersComplete ? collectAssessmentOutcomeBlockingIssues(response, generatedOutcomes) : []),
    ...collectDuplicateAssessmentAnswerIssues(response.answers),
    ...collectDuplicateAssessmentOutcomeIssues(response.outcomes)
  ]

  const outcomesAvailable = answersComplete && generatedOutcomes.length > 0
  const outcomesComplete = generatedOutcomes.length === 0
    ? answersComplete
    : generatedOutcomes.every(outcome =>
        outcome.selectedStrategy !== ''
        && (
          outcome.selectedStrategy === outcome.recommendedStrategy
          || outcome.justification.trim().length > 0
        )
      )

  const outcomeStatuses = buildAssessmentOutcomeStatuses(generatedOutcomes)

  const outcomesStatus = getAggregateStatus(outcomeStatuses, answersComplete ? 'completed' : 'empty')

  // Review-tab work combines mutable assessment fields with server-owned runtime activities.
  // Keep that blend explicit here so future entities can plug in their own runtime activity
  // counts while still reusing the same scorecard/status rendering contract.
  const reviewStatuses = buildAssessmentReviewStatuses(response, reviewContext)
  const reviewStatus = getAggregateStatus(reviewStatuses)

  return {
    sectionStatuses,
    outcomesStatus,
    outcomeStatuses,
    reviewStatus,
    reviewStatuses,
    score,
    calculatedAnswers: calculatedAnswers as AssessmentRuntimeCalculatedAnswer[],
    generatedOutcomes,
    answersComplete,
    outcomesAvailable,
    outcomesComplete,
    readyToComplete: answersComplete && outcomesComplete && blockingIssues.length === 0,
    blockingIssues
  }
}
