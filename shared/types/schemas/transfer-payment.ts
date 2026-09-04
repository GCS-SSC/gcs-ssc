import { z } from 'zod'
import { isRepresentableByNumeric } from '~~/shared/utils/decimal'
import type {
  TransferPaymentDocumentTemplateEntityType,
  TransferPaymentDocumentTemplateKind,
  TransferPaymentDocumentTemplateOutputFormat
} from '~~/shared/types/database'
import {
  createApprovalTemplateCertificationBaseSchema,
  createApprovalTemplateStepBaseSchema,
  validateApprovalTemplateCertifications,
  validateApprovalTemplatePatchCertifications,
  validateApprovalTemplateStepSequences
} from './approval-template-common'
import { DirectReviewEntityTypeIdentitySchema, PaginationSchema, RequiredStringId, type WithId } from './common'
import { MoneySchema } from './money'
import {
  AMENDED_TYPE_ENUM,
  LANGUAGE_PREFERENCE_ENUM,
  REVIEW_TYPE_ENUM
} from '~~/shared/constants/enums'
import { SYSTEM_LIFECYCLE, type PublicationState } from '~~/shared/constants/system-lifecycle'

const RequiredString = () => z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' })
const RequiredId = RequiredStringId
const RequiredNumeric = (precision: number, scale: number) => z.coerce.number({ error: 'validation.required' })
  .finite({ error: 'validation.invalid_number' })
  .refine(value => isRepresentableByNumeric(value, precision, scale), { error: 'validation.numeric_not_representable' })
const RequiredUniqueSelectionIdsSchema = () => z.array(RequiredId(), { error: 'validation.required' })
  .min(1, { error: 'validation.required' })
  .refine(values => new Set(values).size === values.length, { error: 'validation.duplicate' })
const normalizeBilingual = (value: string) => value.trim().toLowerCase()
const TRANSFER_PAYMENT_LIST_STATUS_ENUM = ['all', 'active', 'inactive'] as const

type TransferPaymentSetupNameItem = {
  publicationState?: PublicationState
  egcs_cn_entitytype?: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
}

export const TransferPaymentListQuerySchema = PaginationSchema.extend({
  status: z.enum(TRANSFER_PAYMENT_LIST_STATUS_ENUM).default('all'),
  agency_id: RequiredId().optional()
})

export type TransferPaymentListQuery = z.infer<typeof TransferPaymentListQuerySchema>

export const TransferPaymentProfileBaseSchema = z.object({
  egcs_tp_agency: RequiredId(),
  egcs_tp_datestart: z.coerce.date({ error: 'validation.required' }),
  egcs_tp_dateend: z.coerce.date({ error: 'validation.required' }),
  egcs_tp_name_en: RequiredString(),
  egcs_tp_name_fr: RequiredString(),
  egcs_tp_abbreviation_en: RequiredString(),
  egcs_tp_abbreviation_fr: RequiredString(),
  egcs_tp_description_en: RequiredString(),
  egcs_tp_description_fr: RequiredString(),
  egcs_tp_purpose_en: RequiredString(),
  egcs_tp_purpose_fr: RequiredString(),
  egcs_tp_tclink: RequiredString().url({ message: 'validation.invalid_url' }),
  egcs_tp_active: z.boolean().default(false)
})

export const TransferPaymentProfileSchema = TransferPaymentProfileBaseSchema.refine(
  data => data.egcs_tp_datestart <= data.egcs_tp_dateend,
  {
    message: 'validation.date_range',
    path: ['egcs_tp_dateend']
  }
)

export type TransferPaymentProfile = z.infer<typeof TransferPaymentProfileSchema>
export type TransferPaymentProfileItem = WithId<TransferPaymentProfile>

export const TransferPaymentStreamSchema = z.object({
  egcs_tp_parentstream: z.coerce.string().optional().nullable(),
  egcs_tp_name_en: RequiredString(),
  egcs_tp_name_fr: RequiredString(),
  egcs_tp_description_en: RequiredString(),
  egcs_tp_description_fr: RequiredString(),
  egcs_tp_abbreviation_en: RequiredString(),
  egcs_tp_abbreviation_fr: RequiredString(),
  egcs_tp_objective_en: RequiredString(),
  egcs_tp_objective_fr: RequiredString(),
  egcs_tp_allowsfurtherdistribution: z.boolean().default(false),
  egcs_tp_active: z.boolean().default(false)
})

export type TransferPaymentStream = z.infer<typeof TransferPaymentStreamSchema>
export type TransferPaymentStreamItem = WithId<TransferPaymentStream>

export const TransferPaymentStreamHoldbackBasisSchema = z.object({
  egcs_tp_agencyholdback: RequiredId(),
  egcs_tp_name_en: RequiredString(),
  egcs_tp_name_fr: RequiredString()
})
export type TransferPaymentStreamHoldbackBasis = z.infer<typeof TransferPaymentStreamHoldbackBasisSchema>
export type TransferPaymentStreamHoldbackBasisItem = WithId<TransferPaymentStreamHoldbackBasis>
export const TransferPaymentStreamWizardHoldbackBasisSchema = TransferPaymentStreamHoldbackBasisSchema.extend({
  tempId: RequiredString()
})

export const TransferPaymentFinancialLimitsSchema = z.object({
  egcs_tp_transferpaymentstream: RequiredId(),
  egcs_tp_maxallowableperrecipient: MoneySchema,
  egcs_tp_maxpercentofsupportavailableperrecipient: RequiredNumeric(5, 2),
  egcs_tp_maxpercentofretroactivecostsallowable: RequiredNumeric(5, 2),
  egcs_tp_stackinglimit: RequiredNumeric(5, 2),
  egcs_tp_active: z.boolean().default(false)
})

export type TransferPaymentFinancialLimits = z.infer<typeof TransferPaymentFinancialLimitsSchema>
export type TransferPaymentFinancialLimitsItem = WithId<TransferPaymentFinancialLimits>

export const TransferPaymentOutcomeSchema = z.object({
  egcs_tp_name_en: RequiredString(),
  egcs_tp_name_fr: RequiredString(),
  egcs_tp_description_en: RequiredString(),
  egcs_tp_description_fr: RequiredString()
})

export type TransferPaymentOutcome = z.infer<typeof TransferPaymentOutcomeSchema>
export type TransferPaymentOutcomeItem = WithId<TransferPaymentOutcome>

export const TransferPaymentBudgetSchema = z.object({
  egcs_tp_fiscalyear: RequiredId(),
  egcs_tp_totalbudget: MoneySchema,
  egcs_tp_overcommitthreshold: RequiredNumeric(5, 2)
    .min(0, { error: 'validation.invalid_number' })
    .max(1, { error: 'validation.invalid_number' })
})

export type TransferPaymentBudget = z.infer<typeof TransferPaymentBudgetSchema>
export type TransferPaymentBudgetItem = WithId<TransferPaymentBudget>

export const TransferPaymentStreamBudgetSchema = z.object({
  egcs_tp_transferpaymentbudget: RequiredId(),
  egcs_tp_totalbudget: MoneySchema,
  egcs_tp_overcommitthreshold: RequiredNumeric(5, 2)
    .min(0, { error: 'validation.invalid_number' })
    .max(1, { error: 'validation.invalid_number' })
})

export type TransferPaymentStreamBudget = z.infer<typeof TransferPaymentStreamBudgetSchema>
export type TransferPaymentStreamBudgetItem = WithId<TransferPaymentStreamBudget>

export const TransferPaymentEligibleRecipientSchema = z.object({
  egcs_tp_applicantrecipientsubtype: RequiredId()
})

export type TransferPaymentEligibleRecipient = z.infer<typeof TransferPaymentEligibleRecipientSchema>
export type TransferPaymentEligibleRecipientItem = WithId<TransferPaymentEligibleRecipient>

export const TransferPaymentCostCategoryLineItemSchema = z.object({
  egcs_tp_organizationcostcategory: RequiredId(),
  egcs_tp_costsharingratio: RequiredNumeric(5, 2)
})

export type TransferPaymentCostCategoryLineItem = z.infer<typeof TransferPaymentCostCategoryLineItemSchema>
export type TransferPaymentCostCategoryLineItemItem = WithId<TransferPaymentCostCategoryLineItem>

export const TransferPaymentPerformanceIndicatorSchema = z.object({
  egcs_tp_name_en: RequiredString(),
  egcs_tp_name_fr: RequiredString(),
  egcs_tp_description_en: RequiredString(),
  egcs_tp_description_fr: RequiredString()
})

export type TransferPaymentPerformanceIndicator = z.infer<typeof TransferPaymentPerformanceIndicatorSchema>
export type TransferPaymentPerformanceIndicatorItem = WithId<TransferPaymentPerformanceIndicator>

export const TransferPaymentObjectiveSchema = z.object({
  egcs_tp_objective_en: RequiredString(),
  egcs_tp_objective_fr: RequiredString()
})

export type TransferPaymentObjective = z.infer<typeof TransferPaymentObjectiveSchema>
export type TransferPaymentObjectiveItem = WithId<TransferPaymentObjective>

export const TransferPaymentWizardOutcomeSchema = TransferPaymentOutcomeSchema.extend({
  tempId: RequiredString()
})

export type TransferPaymentWizardOutcome = z.infer<typeof TransferPaymentWizardOutcomeSchema>

export const TransferPaymentWizardObjectiveSchema = TransferPaymentObjectiveSchema.extend({
  tempId: RequiredString()
})

export type TransferPaymentWizardObjective = z.infer<typeof TransferPaymentWizardObjectiveSchema>

export const TransferPaymentWizardBudgetSchema = TransferPaymentBudgetSchema.extend({
  tempId: RequiredString()
})

export type TransferPaymentWizardBudget = z.infer<typeof TransferPaymentWizardBudgetSchema>

export const TransferPaymentWizardPerformanceIndicatorSchema = TransferPaymentPerformanceIndicatorSchema.extend({
  tempId: RequiredString(),
  tempOutcomeId: RequiredString()
})

export type TransferPaymentWizardPerformanceIndicator = z.infer<typeof TransferPaymentWizardPerformanceIndicatorSchema>

/**
 * Adds the standard invalid-selection issue used by wizard relationship checks.
 *
 * @param ctx - Zod refinement context.
 * @param path - Issue path.
 */
const addInvalidWizardSelectionIssue = (
  ctx: z.RefinementCtx,
  path: Array<string | number>
) => {
  ctx.addIssue({
    code: 'custom',
    message: 'validation.invalid_selection',
    path
  })
}

/**
 * Builds a normalized duplicate-detection key for bilingual values.
 *
 * @param valueEn - English value.
 * @param valueFr - French value.
 * @returns Normalized bilingual duplicate key.
 */
const getBilingualDuplicateKey = (valueEn: string, valueFr: string) => [
  normalizeBilingual(valueEn),
  normalizeBilingual(valueFr)
].join('|')

/**
 * Validates wizard outcome temp ids and bilingual name uniqueness.
 *
 * @param outcomes - Wizard outcomes.
 * @param ctx - Zod refinement context.
 * @returns Valid outcome temp ids for child references.
 */
const validateWizardOutcomes = (
  outcomes: TransferPaymentWizardOutcome[],
  ctx: z.RefinementCtx
) => {
  const outcomeIds = new Set<string>()
  const outcomeNameCombos = new Set<string>()

  for (const [index, outcome] of outcomes.entries()) {
    if (outcomeIds.has(outcome.tempId)) {
      addInvalidWizardSelectionIssue(ctx, ['outcomes', index, 'tempId'])
      continue
    }
    outcomeIds.add(outcome.tempId)

    const outcomeKey = getBilingualDuplicateKey(outcome.egcs_tp_name_en, outcome.egcs_tp_name_fr)
    if (outcomeNameCombos.has(outcomeKey)) {
      addInvalidWizardSelectionIssue(ctx, ['outcomes', index, 'egcs_tp_name_en'])
      continue
    }
    outcomeNameCombos.add(outcomeKey)
  }

  return outcomeIds
}

/**
 * Validates wizard objective bilingual uniqueness.
 *
 * @param objectives - Wizard objectives.
 * @param ctx - Zod refinement context.
 */
const validateWizardObjectives = (
  objectives: TransferPaymentWizardObjective[],
  ctx: z.RefinementCtx
) => {
  const objectiveCombos = new Set<string>()

  for (const [index, objective] of objectives.entries()) {
    const objectiveKey = getBilingualDuplicateKey(objective.egcs_tp_objective_en, objective.egcs_tp_objective_fr)
    if (objectiveCombos.has(objectiveKey)) {
      addInvalidWizardSelectionIssue(ctx, ['objectives', index, 'egcs_tp_objective_en'])
      continue
    }
    objectiveCombos.add(objectiveKey)
  }
}

/**
 * Validates wizard budget fiscal year uniqueness.
 *
 * @param budgets - Wizard budgets.
 * @param ctx - Zod refinement context.
 */
const validateWizardBudgets = (
  budgets: TransferPaymentWizardBudget[],
  ctx: z.RefinementCtx
) => {
  const budgetFiscalYearIds = new Set<string>()

  for (const [index, budget] of budgets.entries()) {
    const budgetKey = String(budget.egcs_tp_fiscalyear)
    if (budgetFiscalYearIds.has(budgetKey)) {
      addInvalidWizardSelectionIssue(ctx, ['budgets', index, 'egcs_tp_fiscalyear'])
      continue
    }
    budgetFiscalYearIds.add(budgetKey)
  }
}

/**
 * Validates wizard performance indicator references and per-outcome uniqueness.
 *
 * @param performanceIndicators - Wizard performance indicators.
 * @param outcomeIds - Valid outcome temp ids.
 * @param ctx - Zod refinement context.
 */
const validateWizardPerformanceIndicators = (
  performanceIndicators: TransferPaymentWizardPerformanceIndicator[],
  outcomeIds: Set<string>,
  ctx: z.RefinementCtx
) => {
  const performanceIndicatorCombos = new Set<string>()

  for (const [index, indicator] of performanceIndicators.entries()) {
    if (!outcomeIds.has(indicator.tempOutcomeId)) {
      addInvalidWizardSelectionIssue(ctx, ['performanceIndicators', index, 'tempOutcomeId'])
    }

    const indicatorKey = [
      String(indicator.tempOutcomeId),
      normalizeBilingual(indicator.egcs_tp_name_en),
      normalizeBilingual(indicator.egcs_tp_name_fr)
    ].join('|')
    if (performanceIndicatorCombos.has(indicatorKey)) {
      addInvalidWizardSelectionIssue(ctx, ['performanceIndicators', index, 'egcs_tp_name_en'])
      continue
    }
    performanceIndicatorCombos.add(indicatorKey)
  }
}

export const TransferPaymentWizardSchema = z.object({
  profile: TransferPaymentProfileSchema,
  outcomes: z.array(TransferPaymentWizardOutcomeSchema),
  objectives: z.array(TransferPaymentWizardObjectiveSchema),
  budgets: z.array(TransferPaymentWizardBudgetSchema),
  performanceIndicators: z.array(TransferPaymentWizardPerformanceIndicatorSchema)
}).superRefine((data, ctx) => {
  const outcomeIds = validateWizardOutcomes(data.outcomes, ctx)
  validateWizardObjectives(data.objectives, ctx)
  validateWizardBudgets(data.budgets, ctx)
  validateWizardPerformanceIndicators(data.performanceIndicators, outcomeIds, ctx)
})

export type TransferPaymentWizard = z.infer<typeof TransferPaymentWizardSchema>

export const TransferPaymentAmendmentTypeSchema = z.object({
  egcs_tp_amended: z.enum(AMENDED_TYPE_ENUM, {
    error: 'validation.required'
  }),
  egcs_tp_name_en: RequiredString(),
  egcs_tp_name_fr: RequiredString(),
  egcs_tp_requiresamendmentsubtype: z.boolean().default(false),
  egcs_tp_transferpaymentstream: RequiredId()
})

export type TransferPaymentAmendmentType = z.infer<typeof TransferPaymentAmendmentTypeSchema>
export type TransferPaymentAmendmentTypeItem = WithId<TransferPaymentAmendmentType>

export const TransferPaymentAmendmentSubtypesSchema = z.object({
  amendment_type_ids: RequiredUniqueSelectionIdsSchema(),
  egcs_tp_name_en: RequiredString(),
  egcs_tp_name_fr: RequiredString(),
  egcs_tp_description_en: RequiredString(),
  egcs_tp_description_fr: RequiredString(),
  egcs_tp_transferpaymentstream: RequiredId()
})

export type TransferPaymentAmendmentSubtypes = z.infer<typeof TransferPaymentAmendmentSubtypesSchema>
export type TransferPaymentAmendmentSubtypesItem = WithId<TransferPaymentAmendmentSubtypes>

export const TransferPaymentAgreementSubtypeSchema = z.object({
  egcs_tp_agreementtype: RequiredId(),
  egcs_tp_transferpaymentstream: RequiredId()
})

export type TransferPaymentAgreementSubtype = z.infer<typeof TransferPaymentAgreementSubtypeSchema>
export type TransferPaymentAgreementSubtypeItem = WithId<TransferPaymentAgreementSubtype>

export const TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_ENTITY_TYPE_ENUM = [
  'fundingcaseagreement',
  'fundingcaseagreementcloseout'
] as const satisfies readonly TransferPaymentDocumentTemplateEntityType[]
export const TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_KIND_ENUM = ['docx', 'html'] as const satisfies readonly TransferPaymentDocumentTemplateKind[]
export const TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_OUTPUT_FORMAT_ENUM = ['docx', 'html', 'pdf'] as const satisfies readonly TransferPaymentDocumentTemplateOutputFormat[]

// eslint-disable-next-line jsdoc/require-jsdoc -- local multipart coercion helper is self-descriptive
const normalizeDocumentTemplateActive = (value: unknown): unknown => {
  if (value === true || value === 'true') {
    return true
  }

  if (value === false || value === 'false') {
    return false
  }

  return value
}

export const TransferPaymentStreamDocumentTemplateBaseSchema = z.object({
  egcs_tp_entitytype: z.enum(TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_ENTITY_TYPE_ENUM, { error: 'validation.required' }).default('fundingcaseagreement'),
  egcs_tp_name_en: RequiredString(),
  egcs_tp_name_fr: RequiredString(),
  egcs_tp_description_en: RequiredString(),
  egcs_tp_description_fr: RequiredString(),
  egcs_tp_templatekind: z.enum(TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_KIND_ENUM, { error: 'validation.required' }).default('docx'),
  egcs_tp_outputformats: z.preprocess(value => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as unknown
      } catch {
        return value.split(',').map(item => item.trim()).filter(Boolean)
      }
    }
    return value
  }, z.array(z.enum(TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_OUTPUT_FORMAT_ENUM), { error: 'validation.required' }).min(1, { error: 'validation.required' }).default(['docx'])),
  egcs_tp_active: z.preprocess(normalizeDocumentTemplateActive, z.boolean()).default(true)
})

/**
 * Validates compatible document template kind and output format values.
 *
 * @param data - Template values to validate.
 * @param ctx - Zod refinement context.
 */
const validateDocumentTemplateKindOutput = (
  data: Pick<TransferPaymentStreamDocumentTemplate, 'egcs_tp_templatekind' | 'egcs_tp_outputformats'>,
  ctx: z.RefinementCtx
) => {
  const nativeFormat = data.egcs_tp_templatekind
  if (data.egcs_tp_outputformats.some(format => format !== nativeFormat && format !== 'pdf')) {
    ctx.addIssue({
      code: 'custom',
      message: 'validation.invalid_selection',
      path: ['egcs_tp_outputformats']
    })
  }
}

export const TransferPaymentStreamDocumentTemplateCreateSchema = TransferPaymentStreamDocumentTemplateBaseSchema
  .superRefine(validateDocumentTemplateKindOutput)
export const TransferPaymentStreamDocumentTemplatePatchSchema = TransferPaymentStreamDocumentTemplateBaseSchema
  .extend({
    egcs_tp_entitytype: z.enum(TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_ENTITY_TYPE_ENUM, { error: 'validation.required' }),
    egcs_tp_templatekind: z.enum(TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_KIND_ENUM, { error: 'validation.required' }),
    egcs_tp_outputformats: z.preprocess(value => {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value) as unknown
        } catch {
          return value.split(',').map(item => item.trim()).filter(Boolean)
        }
      }
      return value
    }, z.array(z.enum(TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_OUTPUT_FORMAT_ENUM), { error: 'validation.required' }).min(1, { error: 'validation.required' })),
    egcs_tp_active: z.preprocess(normalizeDocumentTemplateActive, z.boolean())
  })
  .partial()
  .superRefine((data, ctx) => {
    if (data.egcs_tp_templatekind && data.egcs_tp_outputformats) {
      validateDocumentTemplateKindOutput(data as Pick<TransferPaymentStreamDocumentTemplate, 'egcs_tp_templatekind' | 'egcs_tp_outputformats'>, ctx)
    }
  })

export const AgreementDocumentGenerateSchema = z.object({
  templateId: RequiredId(),
  language: z.enum(LANGUAGE_PREFERENCE_ENUM, { error: 'validation.required' }),
  outputFormat: z.enum(TRANSFER_PAYMENT_DOCUMENT_TEMPLATE_OUTPUT_FORMAT_ENUM, { error: 'validation.required' })
})

export type TransferPaymentStreamDocumentTemplate = z.infer<typeof TransferPaymentStreamDocumentTemplateBaseSchema>
export type TransferPaymentStreamDocumentTemplateCreate = z.infer<typeof TransferPaymentStreamDocumentTemplateCreateSchema>
export type TransferPaymentStreamDocumentTemplatePatch = z.infer<typeof TransferPaymentStreamDocumentTemplatePatchSchema>
export type TransferPaymentStreamDocumentTemplateItem = WithId<TransferPaymentStreamDocumentTemplate & {
  egcs_tp_transferpaymentstream: string
  egcs_tp_templateattachment_en: string
  egcs_tp_templateattachment_fr: string
  attachment_en_name_en?: string
  attachment_en_name_fr?: string
  attachment_en_mimetype?: string
  attachment_en_filesize?: number
  attachment_fr_name_en?: string
  attachment_fr_name_fr?: string
  attachment_fr_mimetype?: string
  attachment_fr_filesize?: number
}>
export type AgreementDocumentGenerate = z.infer<typeof AgreementDocumentGenerateSchema>
export type AgreementGeneratedDocumentItem = WithId<{
  egcs_fc_fundingagreement: string
  egcs_fc_closeout?: string | null
  egcs_fc_documenttemplate: string
  egcs_fc_generatedattachment: string
  egcs_fc_language: 'eng' | 'fra'
  egcs_fc_name_en: string
  egcs_fc_name_fr: string
  egcs_fc_outputformat: TransferPaymentDocumentTemplateOutputFormat
  egcs_fc_generatedat: string | Date
  attachment_name_en?: string
  attachment_name_fr?: string
  attachment_mimetype?: string
  attachment_filesize?: number
}>
export const TransferPaymentStreamChartOfAccountDimensionSchema = z.object({
  label_en: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' }),
  label_fr: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' }),
  value: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' })
})

export type TransferPaymentStreamChartOfAccountDimension = z.infer<typeof TransferPaymentStreamChartOfAccountDimensionSchema>

/**
 * Adds path-specific issues for duplicate bilingual accounting labels.
 *
 * @param dimensions - Accounting dimensions being validated.
 * @param ctx - Active Zod refinement context.
 */
const validateChartOfAccountDimensions = (
  dimensions: TransferPaymentStreamChartOfAccountDimension[] | undefined,
  ctx: z.RefinementCtx
) => {
  if (!dimensions) return

  const seenEnglishLabels = new Set<string>()
  const seenFrenchLabels = new Set<string>()

  dimensions.forEach((dimension, index) => {
    const englishLabel = normalizeBilingual(dimension.label_en)
    const frenchLabel = normalizeBilingual(dimension.label_fr)

    if (seenEnglishLabels.has(englishLabel)) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.duplicate_chart_of_account_label_en',
        path: ['egcs_tp_accountingdimensions', index, 'label_en']
      })
    }
    if (seenFrenchLabels.has(frenchLabel)) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.duplicate_chart_of_account_label_fr',
        path: ['egcs_tp_accountingdimensions', index, 'label_fr']
      })
    }

    seenEnglishLabels.add(englishLabel)
    seenFrenchLabels.add(frenchLabel)
  })
}

export const TransferPaymentStreamChartOfAccountBaseSchema = z.object({
  egcs_tp_streambudget: RequiredId(),
  egcs_tp_accountingdimensions: z.array(
    TransferPaymentStreamChartOfAccountDimensionSchema,
    { error: 'validation.required' }
  ).min(1, { error: 'validation.chart_of_account_dimension_required' })
})

export const TransferPaymentStreamChartOfAccountSchema = TransferPaymentStreamChartOfAccountBaseSchema.superRefine(
  (data, ctx) => validateChartOfAccountDimensions(data.egcs_tp_accountingdimensions, ctx)
)
export const TransferPaymentStreamChartOfAccountPatchSchema = TransferPaymentStreamChartOfAccountBaseSchema.partial().superRefine(
  (data, ctx) => validateChartOfAccountDimensions(data.egcs_tp_accountingdimensions, ctx)
)

export type TransferPaymentStreamChartOfAccount = z.infer<typeof TransferPaymentStreamChartOfAccountSchema>
export type TransferPaymentStreamChartOfAccountPatch = z.infer<typeof TransferPaymentStreamChartOfAccountPatchSchema>
export type TransferPaymentStreamChartOfAccountItem = WithId<TransferPaymentStreamChartOfAccount & {
  egcs_tp_transferpaymentstream: string
}>

export const TransferPaymentStreamCommitmentTypeSchema = z.object({
  egcs_tp_name_en: RequiredString(),
  egcs_tp_name_fr: RequiredString()
})

export const TransferPaymentStreamCommitmentTypePatchSchema = TransferPaymentStreamCommitmentTypeSchema.partial().superRefine(() => undefined)
export type TransferPaymentStreamCommitmentType = z.infer<typeof TransferPaymentStreamCommitmentTypeSchema>
export type TransferPaymentStreamCommitmentTypePatch = z.infer<typeof TransferPaymentStreamCommitmentTypePatchSchema>
export type TransferPaymentStreamCommitmentTypeItem = WithId<TransferPaymentStreamCommitmentType & {
  egcs_tp_transferpaymentstream: string
}>

export const TransferPaymentMonitorTypeSchema = z.object({
  egcs_tp_name_en: RequiredString(),
  egcs_tp_name_fr: RequiredString(),
  egcs_tp_transferpaymentstream: RequiredId()
})

export type TransferPaymentMonitorType = z.infer<typeof TransferPaymentMonitorTypeSchema>
export type TransferPaymentMonitorTypeItem = WithId<TransferPaymentMonitorType>

export const TransferPaymentStreamAreaOfExpertiseSchema = z.object({
  egcs_tp_transferpaymentstream: RequiredId(),
  egcs_tp_name_en: RequiredString(),
  egcs_tp_name_fr: RequiredString(),
  egcs_tp_description_en: RequiredString(),
  egcs_tp_description_fr: RequiredString()
})

export type TransferPaymentStreamAreaOfExpertise = z.infer<typeof TransferPaymentStreamAreaOfExpertiseSchema>
export type TransferPaymentStreamAreaOfExpertiseItem = WithId<TransferPaymentStreamAreaOfExpertise>

export const TransferPaymentStreamRiskRatingSchema = z.object({
  egcs_tp_transferpaymentstream: RequiredId(),
  egcs_tp_riskscore: z.coerce.number({ error: 'validation.required' })
    .finite({ error: 'validation.invalid_number' })
    .nonnegative({ error: 'validation.invalid_number' })
    .refine(value => isRepresentableByNumeric(value, 8, 2), { error: 'validation.numeric_not_representable' }),
  egcs_tp_name_en: RequiredString(),
  egcs_tp_name_fr: RequiredString()
})

export type TransferPaymentStreamRiskRating = z.infer<typeof TransferPaymentStreamRiskRatingSchema>
export type TransferPaymentStreamRiskRatingItem = WithId<TransferPaymentStreamRiskRating>

export const TransferPaymentStreamWizardBudgetSchema = TransferPaymentStreamBudgetSchema.extend({
  tempId: RequiredString()
})

export type TransferPaymentStreamWizardBudget = z.infer<typeof TransferPaymentStreamWizardBudgetSchema>

export const TransferPaymentStreamWizardEligibleRecipientSchema = TransferPaymentEligibleRecipientSchema.extend({
  tempId: RequiredString()
})

export type TransferPaymentStreamWizardEligibleRecipient = z.infer<
  typeof TransferPaymentStreamWizardEligibleRecipientSchema
>

export const TransferPaymentStreamWizardCostCategoryLineItemSchema = TransferPaymentCostCategoryLineItemSchema.extend({
  tempId: RequiredString()
})

export type TransferPaymentStreamWizardCostCategoryLineItem = z.infer<
  typeof TransferPaymentStreamWizardCostCategoryLineItemSchema
>

export const TransferPaymentStreamWizardAmendmentTypeSchema = TransferPaymentAmendmentTypeSchema.omit({
  egcs_tp_transferpaymentstream: true
}).extend({
  tempId: RequiredString()
})

export type TransferPaymentStreamWizardAmendmentType = z.infer<typeof TransferPaymentStreamWizardAmendmentTypeSchema>

export const TransferPaymentStreamWizardAmendmentSubtypeSchema = TransferPaymentAmendmentSubtypesSchema.omit({
  egcs_tp_transferpaymentstream: true,
  amendment_type_ids: true
}).extend({
  tempId: RequiredString(),
  tempAmendmentTypeIds: z.array(RequiredString()).min(1, { error: 'validation.required' })
})

export type TransferPaymentStreamWizardAmendmentSubtype = z.infer<
  typeof TransferPaymentStreamWizardAmendmentSubtypeSchema
>

export const TransferPaymentStreamWizardAgreementSubtypeSchema = TransferPaymentAgreementSubtypeSchema.omit({
  egcs_tp_transferpaymentstream: true
}).extend({
  tempId: RequiredString()
})

export type TransferPaymentStreamWizardAgreementSubtype = z.infer<
  typeof TransferPaymentStreamWizardAgreementSubtypeSchema
>

export const TransferPaymentStreamWizardChartOfAccountDimensionSchema = TransferPaymentStreamChartOfAccountDimensionSchema.extend({
  tempId: RequiredString()
})

export const TransferPaymentStreamWizardChartOfAccountSchema = z.object({
  tempId: RequiredString(),
  tempStreamBudgetId: RequiredString(),
  egcs_tp_accountingdimensions: z.array(TransferPaymentStreamWizardChartOfAccountDimensionSchema)
    .min(1, { error: 'validation.chart_of_account_dimension_required' })
}).superRefine((value, ctx) => validateChartOfAccountDimensions(value.egcs_tp_accountingdimensions, ctx))

export type TransferPaymentStreamWizardChartOfAccount = z.infer<typeof TransferPaymentStreamWizardChartOfAccountSchema>

export const TransferPaymentStreamWizardMonitorTypeSchema = TransferPaymentMonitorTypeSchema.omit({
  egcs_tp_transferpaymentstream: true
}).extend({
  tempId: RequiredString()
})

export type TransferPaymentStreamWizardMonitorType = z.infer<typeof TransferPaymentStreamWizardMonitorTypeSchema>

export const TransferPaymentStreamWizardCommitmentTypeSchema = TransferPaymentStreamCommitmentTypeSchema.extend({
  tempId: RequiredString()
})

export type TransferPaymentStreamWizardCommitmentType = z.infer<typeof TransferPaymentStreamWizardCommitmentTypeSchema>

export const TransferPaymentStreamWizardAreaOfExpertiseSchema = TransferPaymentStreamAreaOfExpertiseSchema.omit({
  egcs_tp_transferpaymentstream: true
}).extend({
  tempId: RequiredString()
})

export type TransferPaymentStreamWizardAreaOfExpertise = z.infer<
  typeof TransferPaymentStreamWizardAreaOfExpertiseSchema
>

export const TransferPaymentStreamWizardFinancialLimitSchema = TransferPaymentFinancialLimitsSchema.omit({
  egcs_tp_transferpaymentstream: true
})

export type TransferPaymentStreamWizardFinancialLimit = z.infer<
  typeof TransferPaymentStreamWizardFinancialLimitSchema
>

export type TransferPaymentConfigEntityType =
  | 'applicantrecipient'
  | 'fundingcaseagreement'
  | 'fundingcaseagreementclaim'
  | 'fundingcaseintake'
  | 'fundingcasemonitor'
  | 'fundingclaimreconcile'
  | 'fundingcaseforecast'
  | 'fundingcasepayment'

export const TRANSFER_PAYMENT_CONFIG_ENTITY_TYPE_ENUM = [
  'applicantrecipient',
  'fundingcaseagreement',
  'fundingcaseagreementclaim',
  'fundingcaseintake',
  'fundingcasemonitor',
  'fundingclaimreconcile',
  'fundingcaseforecast',
  'fundingcasepayment'
] as const satisfies readonly TransferPaymentConfigEntityType[]

export type TransferPaymentReviewSetupEntityType =
  | 'applicantrecipient'
  | 'fundingcaseagreement'
  | 'fundingcaseintake'
  | 'fundingcaseagreementclaim'
  | 'fundingcaseamendment'
  | 'fundingcasemonitor'
  | 'fundingclaimreconcile'
  | 'fundingcaseforecast'
  | 'fundingcasepayment'
  | 'fundingcaserecommendation'

export const TRANSFER_PAYMENT_REVIEW_SETUP_ENTITY_TYPE_ENUM = [
  'applicantrecipient',
  'fundingcaseagreement',
  'fundingcaseintake',
  'fundingcaseagreementclaim',
  'fundingcaseamendment',
  'fundingcasemonitor',
  'fundingclaimreconcile',
  'fundingcaseforecast',
  'fundingcasepayment',
  'fundingcaserecommendation'
] as const satisfies readonly TransferPaymentReviewSetupEntityType[]

export const TransferPaymentReviewSetupEntityTypeSchema = DirectReviewEntityTypeIdentitySchema

export const TransferPaymentApprovalTemplateCertificationBaseSchema = createApprovalTemplateCertificationBaseSchema(RequiredString)

export const TransferPaymentApprovalTemplateCertificationSchema = TransferPaymentApprovalTemplateCertificationBaseSchema
export const TransferPaymentApprovalTemplateCertificationPatchSchema = TransferPaymentApprovalTemplateCertificationBaseSchema.partial().extend({
  id: RequiredId().optional(),
  _deleted: z.boolean().optional()
})

export type TransferPaymentApprovalTemplateCertification = z.infer<typeof TransferPaymentApprovalTemplateCertificationSchema>
export type TransferPaymentApprovalTemplateCertificationItem = WithId<TransferPaymentApprovalTemplateCertification>

export const TransferPaymentApprovalTemplateStepBaseSchema = createApprovalTemplateStepBaseSchema(
  TransferPaymentApprovalTemplateCertificationSchema,
  RequiredId,
  RequiredString
)

export const TransferPaymentApprovalTemplateStepSchema = TransferPaymentApprovalTemplateStepBaseSchema.superRefine((data, ctx) => {
  validateApprovalTemplateCertifications(data.certifications, ctx, 'validation.invalid_selection')
})

export const TransferPaymentApprovalTemplateStepPatchSchema = TransferPaymentApprovalTemplateStepBaseSchema
  .partial()
  .extend({
    id: RequiredId().optional(),
    certifications: z.array(TransferPaymentApprovalTemplateCertificationPatchSchema).optional(),
    _deleted: z.boolean().optional()
  })
  .superRefine((data, ctx) => {
    validateApprovalTemplatePatchCertifications(data.certifications, ctx, 'validation.invalid_selection')
  })

export type TransferPaymentApprovalTemplateStep = z.infer<typeof TransferPaymentApprovalTemplateStepSchema>
export type TransferPaymentApprovalTemplateStepItem = Omit<WithId<TransferPaymentApprovalTemplateStep>, 'certifications'> & {
  certifications: TransferPaymentApprovalTemplateCertificationItem[]
}

const TransferPaymentStreamApprovalTemplateBaseSchema = z.object({
  egcs_cn_description_en: RequiredString(),
  egcs_cn_description_fr: RequiredString(),
  egcs_cn_name_en: RequiredString(),
  egcs_cn_name_fr: RequiredString(),
  steps: z.array(TransferPaymentApprovalTemplateStepSchema).default([])
})

export const TransferPaymentStreamApprovalTemplateSchema = TransferPaymentStreamApprovalTemplateBaseSchema.superRefine((data, ctx) => {
  validateApprovalTemplateStepSequences(data, ctx, 'validation.invalid_selection')
})

export const TransferPaymentStreamApprovalTemplatePatchSchema = TransferPaymentStreamApprovalTemplateBaseSchema
  .partial()
  .extend({
    steps: z.array(TransferPaymentApprovalTemplateStepPatchSchema).optional(),
    _deleted: z.boolean().optional()
  })
  .superRefine((data, ctx) => {
    validateApprovalTemplateStepSequences(data, ctx, 'validation.invalid_selection')
  })

export type TransferPaymentStreamApprovalTemplate = z.infer<typeof TransferPaymentStreamApprovalTemplateSchema>
export type TransferPaymentStreamApprovalTemplatePatch = z.infer<typeof TransferPaymentStreamApprovalTemplatePatchSchema>
export type TransferPaymentStreamApprovalTemplateItem = Omit<WithId<TransferPaymentStreamApprovalTemplate>, 'steps'> & {
  steps: TransferPaymentApprovalTemplateStepItem[]
}
export const TransferPaymentStreamApprovalSetupSchema = TransferPaymentStreamApprovalTemplateSchema
export const TransferPaymentStreamApprovalSetupPatchSchema = TransferPaymentStreamApprovalTemplatePatchSchema
export type TransferPaymentStreamApprovalSetup = TransferPaymentStreamApprovalTemplate
export type TransferPaymentStreamApprovalSetupPatch = TransferPaymentStreamApprovalTemplatePatch
export type TransferPaymentStreamApprovalSetupItem = TransferPaymentStreamApprovalTemplateItem

export const TransferPaymentStreamReviewSetupMemberSchema = z.object({
  egcs_cn_reviewschema: RequiredId(),
  egcs_cn_reviewtype: z.enum(REVIEW_TYPE_ENUM).optional(),
  egcs_cn_order: z.coerce.number({ error: 'validation.required' }).int(),
  egcs_cn_approvaltemplate: RequiredId().optional(),
  egcs_cn_failonchecklistfailure: z.boolean().default(false),
  egcs_cn_failurethreshold: z.preprocess(
    value => value === '' ? null : value,
    RequiredNumeric(10, 2).nullable()
  ).optional(),
  egcs_cn_disablecustomoutcomes: z.boolean().optional(),
  egcs_cn_disablealignment: z.boolean().optional(),
  egcs_cn_disablereviewers: z.boolean().optional(),
  egcs_cn_name_en: z.string().optional(),
  egcs_cn_name_fr: z.string().optional(),
  egcs_cn_outcomename_en: z.string().optional(),
  egcs_cn_outcomename_fr: z.string().optional(),
  publicationVersion: z.coerce.number().optional(),
  publicationState: z.enum(SYSTEM_LIFECYCLE.publication.states).optional()
})
export const TransferPaymentStreamReviewSetupMemberCreateSchema = TransferPaymentStreamReviewSetupMemberSchema.omit({
  egcs_cn_reviewtype: true,
  egcs_cn_name_en: true,
  egcs_cn_name_fr: true,
  egcs_cn_outcomename_en: true,
  egcs_cn_outcomename_fr: true,
  publicationVersion: true,
  publicationState: true
})
export const TransferPaymentStreamReviewSetupSchemaCreateSchema = z.object({
  egcs_cn_reviewtype: z.enum(REVIEW_TYPE_ENUM, { error: 'validation.required' }),
  egcs_cn_order: z.coerce.number({ error: 'validation.required' }).int(),
  egcs_cn_approvaltemplate: RequiredId().optional()
})
export const TransferPaymentStreamRecommendationSetupSchemaCreateSchema = z.object({
  egcs_cn_order: z.coerce.number({ error: 'validation.required' }).int().min(1),
  egcs_cn_approvaltemplate: RequiredId().optional(),
  egcs_cn_failonnotrecommended: z.boolean().default(false)
})
export const TransferPaymentStreamReviewSetupMemberPatchSchema = TransferPaymentStreamReviewSetupMemberSchema.partial().strict()

/**
 * Adds a consistent invalid-selection issue to the provided schema path.
 *
 * @param ctx - Active Zod refinement context.
 * @param path - Schema path for the validation issue.
 */
const addInvalidSelectionIssue = (ctx: z.RefinementCtx, path: (string | number)[]) => {
  ctx.addIssue({
    code: 'custom',
    message: 'validation.invalid_selection',
    path
  })
}

/**
 * Reuses duplicate-detection logic across transfer-payment collections.
 *
 * @param items - Collection to validate.
 * @param getKey - Produces a duplicate-detection key for each item.
 * @param getPath - Maps the duplicate item index to the schema path.
 * @param ctx - Active Zod refinement context.
 */
const validateUniqueByKey = <T>(
  items: T[],
  getKey: (item: T) => string,
  getPath: (index: number) => (string | number)[],
  ctx: z.RefinementCtx
) => {
  const seen = new Set<string>()
  for (const [index, item] of items.entries()) {
    const key = getKey(item)
    if (seen.has(key)) {
      addInvalidSelectionIssue(ctx, getPath(index))
      continue
    }
    seen.add(key)
  }
}

/**
 * Runs duplicate detection against active items only.
 *
 * @param items - Collection to validate.
 * @param isActive - Returns whether the item participates in uniqueness checks.
 * @param getKey - Produces a duplicate-detection key for each item.
 * @param getPath - Maps the duplicate item index to the schema path.
 * @param ctx - Active Zod refinement context.
 */
const validateActiveUniqueByKey = <T>(
  items: T[],
  isActive: (item: T) => boolean,
  getKey: (item: T) => string,
  getPath: (index: number) => (string | number)[],
  ctx: z.RefinementCtx
) => {
  const seen = new Set<string>()
  for (const [index, item] of items.entries()) {
    if (!isActive(item)) {
      continue
    }

    const key = getKey(item)
    if (seen.has(key)) {
      addInvalidSelectionIssue(ctx, getPath(index))
      continue
    }

    seen.add(key)
  }
}

/**
 * Builds the duplicate-detection key for setup names within an entity type.
 *
 * @param item - Setup row being validated.
 * @returns Normalized setup name key.
 */
const getTransferPaymentSetupNameKey = (item: TransferPaymentSetupNameItem) => [
  item.egcs_cn_entitytype,
  normalizeBilingual(item.egcs_cn_name_en),
  normalizeBilingual(item.egcs_cn_name_fr)
].join('|')

/**
 * Validates active setup rows for duplicate names.
 *
 * @param items - Setup rows to validate.
 * @param pathName - Wizard payload collection path.
 * @param ctx - Active Zod refinement context.
 */
const validateActiveUniqueSetupNames = <T extends TransferPaymentSetupNameItem>(
  items: T[],
  pathName: 'reviewSetups' | 'recommendationSetups',
  ctx: z.RefinementCtx
) => {
  validateActiveUniqueByKey(
    items,
    () => true,
    getTransferPaymentSetupNameKey,
    index => [pathName, index, 'egcs_cn_name_en'],
    ctx
  )
}

/**
 * Ensures review setup members have unique review schemas and unique execution order.
 *
 * @param members - Review setup members to validate.
 * @param ctx - Active Zod refinement context.
 * @param buildPath - Maps a member index and field name to the schema path.
 */
const validateUniqueReviewSetupMembers = (
  members: TransferPaymentStreamReviewSetupMember[],
  ctx: z.RefinementCtx,
  buildPath: (memberIndex: number, fieldName: 'egcs_cn_reviewschema' | 'egcs_cn_order') => (string | number)[]
) => {
  validateUniqueByKey(
    members,
    member => String(member.egcs_cn_reviewschema),
    memberIndex => buildPath(memberIndex, 'egcs_cn_reviewschema'),
    ctx
  )

  validateUniqueByKey(
    members,
    member => String(member.egcs_cn_order),
    memberIndex => buildPath(memberIndex, 'egcs_cn_order'),
    ctx
  )
}

export type TransferPaymentStreamReviewSetupMember = z.infer<typeof TransferPaymentStreamReviewSetupMemberSchema>
export type TransferPaymentStreamReviewSetupMemberItem = WithId<TransferPaymentStreamReviewSetupMember>

const TransferPaymentReviewSetupBaseFields = {
  egcs_cn_entitytype: TransferPaymentReviewSetupEntityTypeSchema,
  egcs_cn_name_en: RequiredString(),
  egcs_cn_name_fr: RequiredString(),
  egcs_cn_description_en: RequiredString(),
  egcs_cn_description_fr: RequiredString(),
  egcs_cn_order: z.coerce.number({ error: 'validation.required' }).int(),
  egcs_cn_sequential: z.boolean({ error: 'validation.required' }),
  egcs_cn_approvaltemplate: RequiredId().optional()
}

const TransferPaymentStreamReviewSetupBaseSchema = z.object({
  ...TransferPaymentReviewSetupBaseFields,
  members: z.array(TransferPaymentStreamReviewSetupMemberSchema)
})

export const TransferPaymentStreamReviewSetupSchema = TransferPaymentStreamReviewSetupBaseSchema.superRefine((data, ctx) => {
  validateUniqueReviewSetupMembers(
    data.members,
    ctx,
    (memberIndex, fieldName) => ['members', memberIndex, fieldName]
  )
})

export type TransferPaymentStreamReviewSetup = z.infer<typeof TransferPaymentStreamReviewSetupSchema>
export type TransferPaymentStreamReviewSetupItem = WithId<TransferPaymentStreamReviewSetup>

export const TransferPaymentStreamReviewSetupCreateSchema = TransferPaymentStreamReviewSetupSchema

export const TransferPaymentStreamReviewSetupPatchSchema = TransferPaymentStreamReviewSetupBaseSchema
  .partial()
  .extend({
    members: z.array(TransferPaymentStreamReviewSetupMemberSchema).optional(),
    _deleted: z.boolean().optional()
  })
  .superRefine((data, ctx) => {
    if (!data.members) {
      return
    }

    validateUniqueReviewSetupMembers(
      data.members,
      ctx,
      (memberIndex, fieldName) => ['members', memberIndex, fieldName]
    )
  })

const TransferPaymentAssessmentSetBaseSchema = z.object(TransferPaymentReviewSetupBaseFields)

export const TransferPaymentAssessmentSetSchema = TransferPaymentAssessmentSetBaseSchema
export const TransferPaymentAssessmentSetCreateSchema = TransferPaymentAssessmentSetSchema
export const TransferPaymentAssessmentSetPatchSchema = TransferPaymentAssessmentSetBaseSchema.partial().extend({
  _deleted: z.boolean().optional()
})

export type TransferPaymentAssessmentSet = z.infer<typeof TransferPaymentAssessmentSetSchema>
export type TransferPaymentAssessmentSetItem = WithId<TransferPaymentAssessmentSet> & {
  assessment_count?: number
}
export type TransferPaymentAssessmentSetRecord = TransferPaymentAssessmentSetItem

const TransferPaymentAssessmentSetItemBaseSchema = z.object({
  egcs_cn_reviewschema: RequiredId(),
  egcs_cn_order: z.coerce.number({ error: 'validation.required' }).int(),
  egcs_cn_approvaltemplate: RequiredId().optional()
})

export const TransferPaymentAssessmentSetItemSchema = TransferPaymentAssessmentSetItemBaseSchema
export const TransferPaymentAssessmentSetItemCreateSchema = TransferPaymentAssessmentSetItemSchema
export const TransferPaymentAssessmentSetItemPatchSchema = TransferPaymentAssessmentSetItemBaseSchema.partial().extend({
  _deleted: z.boolean().optional()
})

export type TransferPaymentAssessmentSetMember = z.infer<typeof TransferPaymentAssessmentSetItemSchema>
export type TransferPaymentAssessmentSetItemRecord = WithId<TransferPaymentAssessmentSetMember>

const TransferPaymentStreamRecommendationSetupMemberBaseSchema = z.object({
  egcs_cn_recommendationschema: RequiredId(),
  egcs_cn_order: z.coerce.number({ error: 'validation.required' }).int(),
  egcs_cn_approvaltemplate: RequiredId().optional(),
  egcs_cn_failonnotrecommended: z.boolean()
})
export const TransferPaymentStreamRecommendationSetupMemberSchema = TransferPaymentStreamRecommendationSetupMemberBaseSchema.extend({
  egcs_cn_failonnotrecommended: z.boolean().default(false)
})
export const TransferPaymentStreamRecommendationSetupMemberCreateSchema = TransferPaymentStreamRecommendationSetupMemberSchema
export const TransferPaymentStreamRecommendationSetupMemberPatchSchema = TransferPaymentStreamRecommendationSetupMemberBaseSchema.partial()

export type TransferPaymentStreamRecommendationSetupMember = z.infer<typeof TransferPaymentStreamRecommendationSetupMemberSchema>
export type TransferPaymentStreamRecommendationSetupMemberItem = WithId<TransferPaymentStreamRecommendationSetupMember> & {
  egcs_cn_name_en?: string
  egcs_cn_name_fr?: string
  publicationState?: PublicationState
  publicationVersion?: number
}

const TransferPaymentStreamRecommendationSetupBaseSchema = z.object({
  egcs_cn_name_en: RequiredString(),
  egcs_cn_name_fr: RequiredString(),
  egcs_cn_description_en: RequiredString(),
  egcs_cn_description_fr: RequiredString(),
  egcs_cn_approvaltemplate: RequiredId().optional(),
  members: z.array(TransferPaymentStreamRecommendationSetupMemberSchema)
})

export const TransferPaymentStreamRecommendationSetupSchema = TransferPaymentStreamRecommendationSetupBaseSchema.superRefine((data, ctx) => {
  validateUniqueByKey(
    data.members,
    member => String(member.egcs_cn_recommendationschema),
    memberIndex => ['members', memberIndex, 'egcs_cn_recommendationschema'],
    ctx
  )
  validateUniqueByKey(
    data.members,
    member => String(member.egcs_cn_order),
    memberIndex => ['members', memberIndex, 'egcs_cn_order'],
    ctx
  )
})

export type TransferPaymentStreamRecommendationSetup = z.infer<typeof TransferPaymentStreamRecommendationSetupSchema>
export type TransferPaymentStreamRecommendationSetupItem = Omit<WithId<TransferPaymentStreamRecommendationSetup>, 'members'> & {
  publicationState?: PublicationState
  publicationVersion?: number
  hasUnpublishedChanges?: boolean
  members: TransferPaymentStreamRecommendationSetupMemberItem[]
}

export const TransferPaymentStreamRecommendationSetupCreateSchema = TransferPaymentStreamRecommendationSetupSchema
export const TransferPaymentStreamRecommendationSetupPatchSchema = TransferPaymentStreamRecommendationSetupBaseSchema.partial().extend({
  _deleted: z.boolean().optional()
}).superRefine((data, ctx) => {
  if (!data.members) return
  validateUniqueByKey(
    data.members,
    member => String(member.egcs_cn_recommendationschema),
    memberIndex => ['members', memberIndex, 'egcs_cn_recommendationschema'],
    ctx
  )
  validateUniqueByKey(
    data.members,
    member => String(member.egcs_cn_order),
    memberIndex => ['members', memberIndex, 'egcs_cn_order'],
    ctx
  )
})

export const TransferPaymentStreamWizardReviewSetupMemberSchema = TransferPaymentStreamReviewSetupMemberSchema.extend({
  tempId: RequiredString()
})

export type TransferPaymentStreamWizardReviewSetupMember = z.infer<typeof TransferPaymentStreamWizardReviewSetupMemberSchema>

export const TransferPaymentStreamWizardReviewSetupSchema = TransferPaymentStreamReviewSetupBaseSchema.extend({
  tempId: RequiredString(),
  members: z.array(TransferPaymentStreamWizardReviewSetupMemberSchema)
}).superRefine((data, ctx) => {
  validateUniqueReviewSetupMembers(
    data.members,
    ctx,
    (memberIndex, fieldName) => ['members', memberIndex, fieldName]
  )
})

export type TransferPaymentStreamWizardReviewSetup = z.infer<typeof TransferPaymentStreamWizardReviewSetupSchema>

export const TransferPaymentStreamWizardRecommendationSetupSchema = TransferPaymentStreamRecommendationSetupBaseSchema.extend({
  tempId: RequiredString(),
  members: z.array(TransferPaymentStreamRecommendationSetupMemberSchema.extend({ tempId: RequiredString() }))
}).superRefine((data, ctx) => {
  validateUniqueByKey(
    data.members,
    member => String(member.egcs_cn_recommendationschema),
    memberIndex => ['members', memberIndex, 'egcs_cn_recommendationschema'],
    ctx
  )
  validateUniqueByKey(
    data.members,
    member => String(member.egcs_cn_order),
    memberIndex => ['members', memberIndex, 'egcs_cn_order'],
    ctx
  )
})

export type TransferPaymentStreamWizardRecommendationSetup = z.infer<
  typeof TransferPaymentStreamWizardRecommendationSetupSchema
>

export const TransferPaymentStreamPolymorphicWizardSchema = z.object({
  stream: TransferPaymentStreamSchema,
  holdbackBases: z.array(TransferPaymentStreamWizardHoldbackBasisSchema).default([]),
  budgets: z.array(TransferPaymentStreamWizardBudgetSchema),
  eligibleRecipients: z.array(TransferPaymentStreamWizardEligibleRecipientSchema),
  costCategoryLineItems: z.array(TransferPaymentStreamWizardCostCategoryLineItemSchema),
  amendmentTypes: z.array(TransferPaymentStreamWizardAmendmentTypeSchema),
  amendmentSubtypes: z.array(TransferPaymentStreamWizardAmendmentSubtypeSchema),
  agreementSubtypes: z.array(TransferPaymentStreamWizardAgreementSubtypeSchema),
  chartOfAccounts: z.array(TransferPaymentStreamWizardChartOfAccountSchema).default([]),
  commitmentTypes: z.array(TransferPaymentStreamWizardCommitmentTypeSchema).default([]),
  monitorTypes: z.array(TransferPaymentStreamWizardMonitorTypeSchema),
  areasOfExpertise: z.array(TransferPaymentStreamWizardAreaOfExpertiseSchema),
  financialLimit: TransferPaymentStreamWizardFinancialLimitSchema.nullable().optional().default(null),
  reviewSetups: z.array(TransferPaymentStreamWizardReviewSetupSchema).default([]),
  recommendationSetups: z.array(TransferPaymentStreamWizardRecommendationSetupSchema).default([])
}).superRefine((data, ctx) => {
  validateUniqueByKey(
    data.budgets,
    item => String(item.egcs_tp_transferpaymentbudget),
    index => ['budgets', index, 'egcs_tp_transferpaymentbudget'],
    ctx
  )

  const streamBudgetTempIds = new Set(data.budgets.map(item => item.tempId))
  for (const [index, chartOfAccount] of data.chartOfAccounts.entries()) {
    if (!streamBudgetTempIds.has(chartOfAccount.tempStreamBudgetId)) {
      addInvalidSelectionIssue(ctx, ['chartOfAccounts', index, 'tempStreamBudgetId'])
    }
  }

  validateUniqueByKey(
    data.eligibleRecipients,
    item => String(item.egcs_tp_applicantrecipientsubtype),
    index => ['eligibleRecipients', index, 'egcs_tp_applicantrecipientsubtype'],
    ctx
  )

  validateUniqueByKey(
    data.costCategoryLineItems,
    item => String(item.egcs_tp_organizationcostcategory),
    index => ['costCategoryLineItems', index, 'egcs_tp_organizationcostcategory'],
    ctx
  )

  validateUniqueByKey(
    data.amendmentTypes,
    item =>
      [item.egcs_tp_amended, normalizeBilingual(item.egcs_tp_name_en), normalizeBilingual(item.egcs_tp_name_fr)].join(
        '|'
      ),
    index => ['amendmentTypes', index, 'egcs_tp_name_en'],
    ctx
  )

  const amendmentTypeIds = new Set(data.amendmentTypes.map(item => item.tempId))
  for (const [index, subtype] of data.amendmentSubtypes.entries()) {
    if (subtype.tempAmendmentTypeIds.some(id => !amendmentTypeIds.has(id))) {
      addInvalidSelectionIssue(ctx, ['amendmentSubtypes', index, 'tempAmendmentTypeIds'])
    }
  }

  validateUniqueByKey(
    data.amendmentSubtypes,
    item =>
      [
        normalizeBilingual(item.egcs_tp_name_en),
        normalizeBilingual(item.egcs_tp_name_fr)
      ].join('|'),
    index => ['amendmentSubtypes', index, 'egcs_tp_name_en'],
    ctx
  )

  validateUniqueByKey(
    data.agreementSubtypes,
    item => String(item.egcs_tp_agreementtype),
    index => ['agreementSubtypes', index, 'egcs_tp_agreementtype'],
    ctx
  )

  validateUniqueByKey(
    data.commitmentTypes,
    item => normalizeBilingual(item.egcs_tp_name_en),
    index => ['commitmentTypes', index, 'egcs_tp_name_en'],
    ctx
  )
  validateUniqueByKey(
    data.commitmentTypes,
    item => normalizeBilingual(item.egcs_tp_name_fr),
    index => ['commitmentTypes', index, 'egcs_tp_name_fr'],
    ctx
  )

  validateUniqueByKey(
    data.monitorTypes,
    item => [normalizeBilingual(item.egcs_tp_name_en), normalizeBilingual(item.egcs_tp_name_fr)].join('|'),
    index => ['monitorTypes', index, 'egcs_tp_name_en'],
    ctx
  )

  validateUniqueByKey(
    data.areasOfExpertise,
    item => [normalizeBilingual(item.egcs_tp_name_en), normalizeBilingual(item.egcs_tp_name_fr)].join('|'),
    index => ['areasOfExpertise', index, 'egcs_tp_name_en'],
    ctx
  )

  validateActiveUniqueByKey(
    data.reviewSetups,
    () => true,
    item => [
      item.egcs_cn_entitytype,
      item.egcs_cn_order
    ].join('|'),
    index => ['reviewSetups', index, 'egcs_cn_order'],
    ctx
  )

  validateActiveUniqueSetupNames(data.reviewSetups, 'reviewSetups', ctx)
  validateActiveUniqueSetupNames(data.recommendationSetups, 'recommendationSetups', ctx)
})

export type TransferPaymentStreamPolymorphicWizard = z.infer<typeof TransferPaymentStreamPolymorphicWizardSchema>
