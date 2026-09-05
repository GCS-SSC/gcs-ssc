/* eslint-disable jsdoc/require-jsdoc -- Existing schemas use descriptive exports and inferred metadata. */
import { z } from 'zod'
import { AgreementCustomFieldValuesSchema } from './agreement-custom-fields'
import type { Agreement_Type, Follow_Up_Status, Monitor_Action_Type, Monitor_Responsible_Party } from '~~/shared/types/database'
import type { StatusId } from '~~/shared/types/status'
import {
  CURRENCY_CODES_ENUM,
  FOLLOW_UP_STATUS_ENUM,
  MONITOR_ACTION_TYPE_ENUM,
  MONITOR_RESPONSIBLE_PARTY_ENUM,
  PAYMENT_TYPE_ENUM
} from '~~/shared/constants/enums'
import { PositivePostgresBigintIdSchema, type WithId } from './common'
import { CommonAddressCreateSchema, CommonAddressPatchSchema } from './admin-common'
import { isRepresentableByNumeric } from '~~/shared/utils/decimal'
import { isCanonicalNonNegativePostgresBigintText } from '~~/shared/utils/database-id'
import { MoneySchema, OptionalMoneySchema, PositiveMoneySchema } from './money'
import { addMoney, compareMoney, isCanonicalMoney, parseMoney, type Money } from '~~/shared/utils/money'

const RequiredString = () => z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' })
const OptionalBilingualName = () => z.preprocess(
  value => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().max(255, { error: 'validation.max_length' }).nullable().optional()
)
const RequiredBigintSelectionId = () => PositivePostgresBigintIdSchema
const NullableBigintSelectionId = () =>
  z.preprocess(
    value => value === '' ? null : value,
    z.union([RequiredBigintSelectionId(), z.null()], { error: 'validation.required' })
  )
const RequiredBigintLike = () =>
  z.union([
    z.string(),
    z.bigint().transform(value => String(value)),
    z.number().int().safe().transform(value => String(value))
  ], { error: 'validation.required' })
    .transform(value => value.trim())
    .refine(value => value.length > 0, { error: 'validation.required' })
    .refine(isCanonicalNonNegativePostgresBigintText, { error: 'validation.invalid_number' })
const OptionalDecimal = (precision: number, scale: number) => z.preprocess(
  value => value === '' || value === null || value === undefined ? undefined : value,
  z.coerce.number()
    .finite({ error: 'validation.invalid_number' })
    .nonnegative({ error: 'validation.invalid_number' })
    .refine(value => isRepresentableByNumeric(value, precision, scale), { error: 'validation.numeric_not_representable' })
    .nullable()
    .optional()
)
const ForbiddenBusinessStatusMutation = () => z.never({ error: 'validation.business_status_workflow_only' }).optional()

const addDuplicateSelectionIssues = (values: string[], ctx: z.RefinementCtx) => {
  const seenValues = new Set<string>()

  for (const [index, item] of values.entries()) {
    if (seenValues.has(item)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.duplicate',
        path: [index]
      })
    }

    seenValues.add(item)
  }
}

const RequiredUniqueBigintSelectionIdsSchema = () => z.array(RequiredBigintSelectionId(), { error: 'validation.required' })
  .min(1, { error: 'validation.required' })
  .superRefine(addDuplicateSelectionIssues)

export const FundingCaseAgreementProfileBaseSchema = z.object({
  egcs_fc_customfields: AgreementCustomFieldValuesSchema.optional(),
  egcs_fc_agreementnumber: RequiredString().max(15, { error: 'validation.max_length' }),
  egcs_fc_transferpaymentstream: RequiredBigintSelectionId(),
  egcs_fc_financialsystemnumber: RequiredBigintLike(),
  egcs_fc_title_en: RequiredString().max(255, { error: 'validation.max_length' }),
  egcs_fc_title_fr: RequiredString().max(255, { error: 'validation.max_length' }),
  egcs_fc_description_en: RequiredString(),
  egcs_fc_description_fr: RequiredString(),
  egcs_fc_agreementsubtype: RequiredBigintSelectionId(),
  egcs_fc_furtherdistribution: z.boolean(),
  egcs_fc_holdback: z.coerce.number({ error: 'validation.required' })
    .finite({ error: 'validation.invalid_number' })
    .min(0, { error: 'validation.invalid_number' })
    .max(100, { error: 'validation.invalid_number' })
    .refine(value => isRepresentableByNumeric(value, 5, 2), { error: 'validation.numeric_not_representable' }),
  egcs_fc_holdbackbasis: RequiredBigintSelectionId(),
  egcs_fc_riskscore: OptionalDecimal(8, 2),
  egcs_fc_authorizedassistancestartdate: z.coerce.date({ error: 'validation.required' }),
  egcs_fc_authorizedassistanceenddate: z.coerce.date({ error: 'validation.required' })
})

const FundingCaseAgreementExtensionPayloadSchema = z.object({
  extensions: z.record(z.string(), z.json()).optional()
})

export const FundingCaseAgreementProfileSchema = FundingCaseAgreementProfileBaseSchema.refine(
  data => data.egcs_fc_authorizedassistancestartdate <= data.egcs_fc_authorizedassistanceenddate,
  {
    message: 'validation.date_range',
    path: ['egcs_fc_authorizedassistanceenddate']
  }
)

export const FundingCaseAgreementCreateSchema = FundingCaseAgreementProfileBaseSchema.extend({
  applicant_recipient_ids: RequiredUniqueBigintSelectionIdsSchema(),
  extensions: FundingCaseAgreementExtensionPayloadSchema.shape.extensions
}).refine(
  data => data.egcs_fc_authorizedassistancestartdate <= data.egcs_fc_authorizedassistanceenddate,
  {
    message: 'validation.date_range',
    path: ['egcs_fc_authorizedassistanceenddate']
  }
)

export const FundingCaseAgreementProfilePatchSchema = FundingCaseAgreementProfileBaseSchema
  .extend({
    extensions: FundingCaseAgreementExtensionPayloadSchema.shape.extensions,
    egcs_fc_status: ForbiddenBusinessStatusMutation()
  })
  .partial()
  .superRefine(
    (data, ctx) => {
      if (
        data.egcs_fc_authorizedassistancestartdate
        && data.egcs_fc_authorizedassistanceenddate
        && data.egcs_fc_authorizedassistancestartdate > data.egcs_fc_authorizedassistanceenddate
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'validation.date_range',
          path: ['egcs_fc_authorizedassistanceenddate']
        })
      }
    }
  )

type FundingCaseAgreementProfileSchemaOutput = z.infer<typeof FundingCaseAgreementProfileSchema>
export type FundingCaseAgreementProfile = Omit<FundingCaseAgreementProfileSchemaOutput, 'egcs_fc_riskscore'> & {
  egcs_fc_riskscore?: number | null
}
export type FundingCaseAgreementCreate = z.infer<typeof FundingCaseAgreementCreateSchema>
export type FundingCaseAgreementProfileItem = WithId<FundingCaseAgreementProfile & {
  egcs_fc_agreementtype: Agreement_Type
}>
export type FundingCaseAgreementProfilePatch = z.infer<typeof FundingCaseAgreementProfilePatchSchema>

export const FundingCaseAgreementApplicantRecipientBaseSchema = z.object({
  egcs_fc_applicantrecipient: RequiredBigintSelectionId()
})

export const FundingCaseAgreementApplicantRecipientCreateSchema = FundingCaseAgreementApplicantRecipientBaseSchema
export const FundingCaseAgreementApplicantRecipientPatchSchema = FundingCaseAgreementApplicantRecipientBaseSchema.partial().superRefine(() => undefined)

export type FundingCaseAgreementApplicantRecipient = z.infer<typeof FundingCaseAgreementApplicantRecipientCreateSchema>
export type FundingCaseAgreementApplicantRecipientPatch = z.infer<typeof FundingCaseAgreementApplicantRecipientPatchSchema>
export type FundingCaseAgreementApplicantRecipientItem = WithId<FundingCaseAgreementApplicantRecipient>

export const FundingCaseAgreementAddressCreateSchema = z.intersection(
  CommonAddressCreateSchema,
  z.object({
    egcs_fc_addresstype: RequiredBigintSelectionId()
  })
)
export const FundingCaseAgreementAddressPatchSchema = z.intersection(
  CommonAddressPatchSchema,
  z.object({
    egcs_fc_addresstype: RequiredBigintSelectionId().optional()
  })
)
export type FundingCaseAgreementAddress = z.infer<typeof FundingCaseAgreementAddressCreateSchema>
export type FundingCaseAgreementAddressPatch = z.infer<typeof FundingCaseAgreementAddressPatchSchema>
export type FundingCaseAgreementAddressItem = WithId<FundingCaseAgreementAddress>

export const FundingCaseAgreementAmendmentBaseSchema = z.object({
  egcs_fc_name_en: OptionalBilingualName(),
  egcs_fc_name_fr: OptionalBilingualName(),
  amendment_type_ids: RequiredUniqueBigintSelectionIdsSchema(),
  amendment_subtype_ids: z.array(RequiredBigintSelectionId()).default([]),
  egcs_fc_proposedauthorizedassistancestartdate: z.coerce.date().nullable().optional(),
  egcs_fc_proposedauthorizedassistanceenddate: z.coerce.date().nullable().optional()
})

const validateAmendmentName = (
  data: Pick<z.infer<typeof FundingCaseAgreementAmendmentBaseSchema>, 'egcs_fc_name_en' | 'egcs_fc_name_fr'>,
  ctx: z.RefinementCtx
) => {
  if (!data.egcs_fc_name_en && !data.egcs_fc_name_fr) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'validation.bilingual_value_required', path: ['egcs_fc_name_en'] })
  }
}

const validateAmendmentDateRange = (
  data: Pick<z.infer<typeof FundingCaseAgreementAmendmentBaseSchema>, 'egcs_fc_proposedauthorizedassistancestartdate' | 'egcs_fc_proposedauthorizedassistanceenddate'>,
  ctx: z.RefinementCtx
) => {
  const startDate = data.egcs_fc_proposedauthorizedassistancestartdate
  const endDate = data.egcs_fc_proposedauthorizedassistanceenddate
  if (Boolean(startDate) !== Boolean(endDate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'validation.required',
      path: [startDate ? 'egcs_fc_proposedauthorizedassistanceenddate' : 'egcs_fc_proposedauthorizedassistancestartdate']
    })
  } else if (startDate && endDate && startDate > endDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'validation.date_range', path: ['egcs_fc_proposedauthorizedassistanceenddate'] })
  }
}

export const FundingCaseAgreementAmendmentCreateSchema = FundingCaseAgreementAmendmentBaseSchema.superRefine((data, ctx) => {
  validateAmendmentName(data, ctx)
  validateAmendmentDateRange(data, ctx)
})
export const FundingCaseAgreementAmendmentPatchSchema = FundingCaseAgreementAmendmentBaseSchema
  .partial()
  .extend({
    amendment_subtype_ids: z.array(RequiredBigintSelectionId()).optional(),
    egcs_fc_status: ForbiddenBusinessStatusMutation()
  })
  .superRefine((data, ctx) => {
    if (data.amendment_type_ids) {
      addDuplicateSelectionIssues(data.amendment_type_ids, ctx)
    }
    if ('egcs_fc_name_en' in data || 'egcs_fc_name_fr' in data) validateAmendmentName(data, ctx)
    validateAmendmentDateRange(data, ctx)
  })

export type FundingCaseAgreementAmendmentCreate = z.infer<typeof FundingCaseAgreementAmendmentCreateSchema>
export type FundingCaseAgreementAmendmentPatch = z.infer<typeof FundingCaseAgreementAmendmentPatchSchema>
export type FundingCaseAgreementAmendmentItem = WithId<{
  egcs_fc_fundingagreement: string
  egcs_fc_amendmentnumber: number
  egcs_fc_status: StatusId
  egcs_fc_name_en?: string | null
  egcs_fc_name_fr?: string | null
  egcs_fc_proposedauthorizedassistancestartdate?: Date | null
  egcs_fc_proposedauthorizedassistanceenddate?: Date | null
  amendment_type_ids: string[]
  amendment_subtype_ids: string[]
}>

export const FundingCaseAgreementActivityBaseSchema = z.object({
  egcs_fc_description_en: RequiredString(),
  egcs_fc_description_fr: RequiredString(),
  egcs_fc_startdate: z.coerce.date({ error: 'validation.required' }),
  egcs_fc_enddate: z.coerce.date({ error: 'validation.required' }),
  egcs_fc_expectedresults_en: RequiredString(),
  egcs_fc_expectedresults_fr: RequiredString(),
  egcs_fc_name_en: RequiredString().max(255, { error: 'validation.max_length' }),
  egcs_fc_name_fr: RequiredString().max(255, { error: 'validation.max_length' }),
  outcome_ids: RequiredUniqueBigintSelectionIdsSchema(),
  responsible_party_ids: RequiredUniqueBigintSelectionIdsSchema()
})

export const FundingCaseAgreementActivityCreateSchema = FundingCaseAgreementActivityBaseSchema.refine(
  data => data.egcs_fc_startdate <= data.egcs_fc_enddate,
  {
    message: 'validation.date_range',
    path: ['egcs_fc_enddate']
  }
)
export const FundingCaseAgreementActivityPatchSchema = FundingCaseAgreementActivityBaseSchema.partial().superRefine((data, ctx) => {
  if (
    data.egcs_fc_startdate
    && data.egcs_fc_enddate
    && data.egcs_fc_startdate > data.egcs_fc_enddate
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'validation.date_range',
      path: ['egcs_fc_enddate']
    })
  }
})

export type FundingCaseAgreementActivity = z.infer<typeof FundingCaseAgreementActivityCreateSchema>
export type FundingCaseAgreementActivityPatch = z.infer<typeof FundingCaseAgreementActivityPatchSchema>
export type FundingCaseAgreementActivityItem = WithId<Omit<FundingCaseAgreementActivity, 'outcome_ids' | 'responsible_party_ids'> & {
  egcs_fc_fundingagreement: string
}>

const RequiredNumberInput = () => z.union([z.string(), z.number()], { error: 'validation.required' })
  .transform(value => typeof value === 'number' ? value : value.trim())
  .refine(value => value !== '', { error: 'validation.required' })
  .transform(value => typeof value === 'number' ? value : Number(value))
const addBudgetLineItemFundingTotalsIssue = (
  ctx: z.RefinementCtx
) => {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'validation.total_amount_must_cover_funding',
    path: ['egcs_fc_totalamount']
  })
}

const validateBudgetLineItemFundingTotals = (
  data: Partial<{
    egcs_fc_totalamount: Money
    egcs_fc_programfunding: Money
    egcs_fc_otherfederalfunding?: Money
    egcs_fc_othergovfunding?: Money
    egcs_fc_otherfunding?: Money
  }>,
  ctx: z.RefinementCtx
) => {
  if (data.egcs_fc_totalamount === undefined || data.egcs_fc_programfunding === undefined) {
    return
  }

  const moneyValues = [
    data.egcs_fc_totalamount,
    data.egcs_fc_programfunding,
    data.egcs_fc_otherfederalfunding,
    data.egcs_fc_othergovfunding,
    data.egcs_fc_otherfunding
  ].filter(value => value !== undefined)
  if (!moneyValues.every(isCanonicalMoney)) return

  const zero = parseMoney('0')
  const totalFunding = addMoney(
    addMoney(data.egcs_fc_programfunding, data.egcs_fc_otherfederalfunding ?? zero),
    addMoney(data.egcs_fc_othergovfunding ?? zero, data.egcs_fc_otherfunding ?? zero)
  )

  if (compareMoney(data.egcs_fc_totalamount, totalFunding) < 0) {
    addBudgetLineItemFundingTotalsIssue(ctx)
  }
}

export const FundingCaseAgreementBudgetFiscalYearBaseSchema = z.object({
  egcs_fc_fiscalyear: RequiredBigintSelectionId()
})

export const FundingCaseAgreementBudgetFiscalYearCreateSchema = FundingCaseAgreementBudgetFiscalYearBaseSchema
export const FundingCaseAgreementBudgetFiscalYearPatchSchema = FundingCaseAgreementBudgetFiscalYearBaseSchema.partial().superRefine(() => undefined)

export type FundingCaseAgreementBudgetFiscalYear = z.infer<typeof FundingCaseAgreementBudgetFiscalYearCreateSchema>
export type FundingCaseAgreementBudgetFiscalYearPatch = z.infer<typeof FundingCaseAgreementBudgetFiscalYearPatchSchema>
export type FundingCaseAgreementBudgetFiscalYearItem = WithId<FundingCaseAgreementBudgetFiscalYear>

export const FundingCaseAgreementBudgetLineItemBaseSchema = z.object({
  egcs_fc_fundingagreementbudgetfiscalyear: RequiredBigintSelectionId(),
  egcs_fc_organizationcostcategory: RequiredBigintSelectionId(),
  egcs_fc_costsubsection: RequiredString().max(255, { error: 'validation.max_length' }),
  egcs_fc_description: RequiredString(),
  egcs_fc_totalamount: MoneySchema,
  egcs_fc_programfunding: MoneySchema,
  egcs_fc_otherfederalfunding: OptionalMoneySchema,
  egcs_fc_othergovfunding: OptionalMoneySchema,
  egcs_fc_otherfunding: OptionalMoneySchema,
  egcs_fc_currency: z.enum(CURRENCY_CODES_ENUM, { error: 'validation.required' })
})

export const FundingCaseAgreementBudgetLineItemFundingTotalsSchema = FundingCaseAgreementBudgetLineItemBaseSchema.pick({
  egcs_fc_totalamount: true,
  egcs_fc_programfunding: true,
  egcs_fc_otherfederalfunding: true,
  egcs_fc_othergovfunding: true,
  egcs_fc_otherfunding: true
}).superRefine(validateBudgetLineItemFundingTotals)

export const FundingCaseAgreementBudgetLineItemCreateSchema = FundingCaseAgreementBudgetLineItemBaseSchema.superRefine((data, ctx) => {
  validateBudgetLineItemFundingTotals(data, ctx)
})
export const FundingCaseAgreementBudgetLineItemPatchSchema = FundingCaseAgreementBudgetLineItemBaseSchema.partial().superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({ code: 'custom', message: 'validation.required' })
    return
  }
  validateBudgetLineItemFundingTotals(data, ctx)
})

export type FundingCaseAgreementBudgetLineItem = z.infer<typeof FundingCaseAgreementBudgetLineItemCreateSchema>
export type FundingCaseAgreementBudgetLineItemPatch = z.infer<typeof FundingCaseAgreementBudgetLineItemPatchSchema>
export type FundingCaseAgreementBudgetLineItemItem = WithId<FundingCaseAgreementBudgetLineItem>

const RequiredIntegerInRange = (min: number, max: number) => RequiredNumberInput()
  .refine(value => Number.isInteger(value), { error: 'validation.invalid_number' })
  .refine(value => value >= min && value <= max, { error: 'validation.invalid_number' })
const RequiredSmallint = () => RequiredIntegerInRange(1, 32767)
const RequiredForecastMonth = () => RequiredIntegerInRange(0, 11)
const RequiredForecastVersion = () => z.union([z.string(), z.number()], { error: 'validation.required' })
  .transform(value => typeof value === 'number' ? value : value.trim())
  .refine(value => value !== '', { error: 'validation.required' })
  .refine(value => Number.isInteger(typeof value === 'number' ? value : Number(value)), { error: 'validation.invalid_number' })
  .refine(value => (typeof value === 'number' ? value : Number(value)) >= 0, { error: 'validation.invalid_number' })
  .transform(value => String(value))

const OptionalText = () => z.preprocess(
  value => {
    if (value === null || value === undefined) {
      return null
    }

    if (typeof value === 'string' && value.trim() === '') {
      return null
    }

    return value
  },
  z.string().trim().nullable().optional()
)

export const FundingCaseAgreementCommitmentBaseSchema = z.object({
  egcs_fc_type: RequiredBigintSelectionId()
})

export const FundingCaseAgreementCommitmentCreateSchema = FundingCaseAgreementCommitmentBaseSchema
export const FundingCaseAgreementCommitmentPatchSchema = FundingCaseAgreementCommitmentBaseSchema.partial()
  .extend({ egcs_fc_status: ForbiddenBusinessStatusMutation() })
  .superRefine(() => undefined)

export type FundingCaseAgreementCommitment = z.infer<typeof FundingCaseAgreementCommitmentCreateSchema>
export type FundingCaseAgreementCommitmentPatch = z.infer<typeof FundingCaseAgreementCommitmentPatchSchema>
export type FundingCaseAgreementCommitmentItem = WithId<FundingCaseAgreementCommitment & {
  egcs_fc_fundingagreement: string
  egcs_fc_status: StatusId
  egcs_fc_financialsystemnumber?: string | null
  egcs_fc_active: boolean
}>

export const FundingCaseAgreementCommitmentLineBaseSchema = z.object({
  egcs_fc_commitment: RequiredBigintSelectionId(),
  egcs_fc_commitmentlinenumber: RequiredSmallint(),
  egcs_fc_transferpaymentstreamchartofaccount: RequiredBigintSelectionId(),
  egcs_fc_amount: MoneySchema
})

export const FundingCaseAgreementCommitmentLineCreateSchema = FundingCaseAgreementCommitmentLineBaseSchema
export const FundingCaseAgreementCommitmentLinePatchSchema = FundingCaseAgreementCommitmentLineBaseSchema.partial().superRefine(() => undefined)

export type FundingCaseAgreementCommitmentLine = z.infer<typeof FundingCaseAgreementCommitmentLineCreateSchema>
export type FundingCaseAgreementCommitmentLinePatch = z.infer<typeof FundingCaseAgreementCommitmentLinePatchSchema>
export type FundingCaseAgreementCommitmentLineItem = WithId<FundingCaseAgreementCommitmentLine>

export const FundingCaseAgreementForecastBaseSchema = z.object({
  egcs_fc_fiscalyear: RequiredBigintSelectionId()
})

export const FundingCaseAgreementForecastCreateSchema = FundingCaseAgreementForecastBaseSchema
export const FundingCaseAgreementForecastPatchSchema = FundingCaseAgreementForecastBaseSchema.partial()
  .extend({ egcs_fc_status: ForbiddenBusinessStatusMutation() })
  .superRefine(() => undefined)

export type FundingCaseAgreementForecast = z.infer<typeof FundingCaseAgreementForecastCreateSchema>
export type FundingCaseAgreementForecastPatch = z.infer<typeof FundingCaseAgreementForecastPatchSchema>
export type FundingCaseAgreementForecastItem = WithId<FundingCaseAgreementForecast & {
  egcs_fc_fundingagreement: string
  egcs_fc_status: StatusId
  egcs_fc_active: boolean
}>

export const FundingCaseAgreementForecastLineItemBaseSchema = z.object({
  egcs_fc_agreementforecast: RequiredBigintSelectionId(),
  egcs_fc_fundingagreementbudgetlineitem: RequiredBigintSelectionId(),
  egcs_fc_month: RequiredForecastMonth(),
  egcs_fc_amount: MoneySchema,
  egcs_fc_currency: z.enum(CURRENCY_CODES_ENUM, { error: 'validation.required' }),
  egcs_fc_version: RequiredForecastVersion()
})

export const FundingCaseAgreementForecastLineItemCreateSchema = FundingCaseAgreementForecastLineItemBaseSchema
export const FundingCaseAgreementForecastLineItemPatchSchema = FundingCaseAgreementForecastLineItemBaseSchema.partial().superRefine(() => undefined)

export type FundingCaseAgreementForecastLineItem = z.infer<typeof FundingCaseAgreementForecastLineItemCreateSchema>
export type FundingCaseAgreementForecastLineItemPatch = z.infer<typeof FundingCaseAgreementForecastLineItemPatchSchema>
export type FundingCaseAgreementForecastLineItemItem = WithId<FundingCaseAgreementForecastLineItem>

export const FundingCaseAgreementPaymentBaseSchema = z.object({
  egcs_fc_fundingagreementcommitment: RequiredBigintSelectionId(),
  egcs_fc_fiscalyear: RequiredBigintSelectionId(),
  egcs_fc_paymenttype: z.enum(PAYMENT_TYPE_ENUM, { error: 'validation.required' }),
  egcs_fc_periodstart: RequiredForecastMonth(),
  egcs_fc_periodend: RequiredForecastMonth(),
  egcs_fc_paymentamount: PositiveMoneySchema,
  egcs_fc_currency: z.enum(CURRENCY_CODES_ENUM, { error: 'validation.required' }),
  egcs_fc_comment: OptionalText()
})

const FundingCaseAgreementPaymentSharedInputSchema = FundingCaseAgreementPaymentBaseSchema.omit({
  egcs_fc_fundingagreementcommitment: true
})

const validatePeriodRange = (
  data: Partial<{
    egcs_fc_periodstart: number
    egcs_fc_periodend: number
  }>,
  ctx: z.RefinementCtx
) => {
  if (
    data.egcs_fc_periodstart !== undefined
    && data.egcs_fc_periodend !== undefined
    && data.egcs_fc_periodstart > data.egcs_fc_periodend
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'validation.date_range',
      path: ['egcs_fc_periodend']
    })
  }
}

export const FundingCaseAgreementPeriodRangeSchema = z.object({
  egcs_fc_periodstart: RequiredForecastMonth(),
  egcs_fc_periodend: RequiredForecastMonth()
}).superRefine(validatePeriodRange)

export const FundingCaseAgreementPaymentCreateSchema = FundingCaseAgreementPaymentSharedInputSchema.extend({
  egcs_fc_commitmenttype: RequiredBigintSelectionId(),
  extensions: z.record(z.string(), z.json()).optional()
}).refine(
  data => data.egcs_fc_periodstart <= data.egcs_fc_periodend,
  {
    message: 'validation.date_range',
    path: ['egcs_fc_periodend']
  }
)

export const FundingCaseAgreementPaymentPatchSchema = FundingCaseAgreementPaymentSharedInputSchema.extend({
  egcs_fc_commitmenttype: RequiredBigintSelectionId().optional(),
  egcs_fc_status: ForbiddenBusinessStatusMutation()
}).partial().superRefine(validatePeriodRange)

export type FundingCaseAgreementPayment = z.infer<typeof FundingCaseAgreementPaymentBaseSchema>
export type FundingCaseAgreementPaymentCreate = z.infer<typeof FundingCaseAgreementPaymentCreateSchema>
export type FundingCaseAgreementPaymentPatch = z.infer<typeof FundingCaseAgreementPaymentPatchSchema>
export type FundingCaseAgreementPaymentItem = WithId<FundingCaseAgreementPayment & {
  egcs_fc_status: StatusId
  egcs_fc_commitmenttype?: string
}>

export const FundingCaseAgreementPaymentLineBaseSchema = z.object({
  egcs_fc_fundingagreementpayment: RequiredBigintSelectionId(),
  egcs_fc_fundingagreementcommitmentline: RequiredBigintSelectionId(),
  egcs_fc_amount: PositiveMoneySchema
})

export const FundingCaseAgreementPaymentLineCreateSchema = FundingCaseAgreementPaymentLineBaseSchema
export const FundingCaseAgreementPaymentLinePatchSchema = FundingCaseAgreementPaymentLineBaseSchema.partial()
  .refine(value => Object.keys(value).length > 0, { error: 'validation.required' })

export type FundingCaseAgreementPaymentLine = z.infer<typeof FundingCaseAgreementPaymentLineCreateSchema>
export type FundingCaseAgreementPaymentLinePatch = z.infer<typeof FundingCaseAgreementPaymentLinePatchSchema>
export type FundingCaseAgreementPaymentLineItem = WithId<FundingCaseAgreementPaymentLine>

export const FundingCaseAgreementClaimBaseSchema = z.object({
  egcs_fc_fiscalyear: RequiredBigintSelectionId(),
  egcs_fc_isfinalforyear: z.boolean(),
  egcs_fc_periodstart: RequiredForecastMonth(),
  egcs_fc_periodend: RequiredForecastMonth(),
  egcs_fc_receiveddate: z.coerce.date({ error: 'validation.required' })
})

export const FundingCaseAgreementClaimCreateSchema = FundingCaseAgreementClaimBaseSchema.refine(
  data => data.egcs_fc_periodstart <= data.egcs_fc_periodend,
  {
    message: 'validation.date_range',
    path: ['egcs_fc_periodend']
  }
)

export const FundingCaseAgreementClaimPatchSchema = FundingCaseAgreementClaimBaseSchema.partial()
  .extend({ egcs_fc_status: ForbiddenBusinessStatusMutation() })
  .superRefine(validatePeriodRange)

export type FundingCaseAgreementClaim = z.infer<typeof FundingCaseAgreementClaimCreateSchema>
export type FundingCaseAgreementClaimPatch = z.infer<typeof FundingCaseAgreementClaimPatchSchema>
export type FundingCaseAgreementClaimItem = WithId<FundingCaseAgreementClaim & {
  egcs_fc_fundingagreement: string
  egcs_fc_status: StatusId
}>

export const FundingCaseAgreementClaimLineItemBaseSchema = z.object({
  egcs_fc_fundingagreementclaim: RequiredBigintSelectionId(),
  egcs_fc_fundingagreementbudgetlineitem: NullableBigintSelectionId(),
  egcs_fc_submittedcostcategory: z.string().trim().nullable().optional(),
  egcs_fc_submittedcostsubsection: z.string().trim().nullable().optional(),
  egcs_fc_submittedlineitem: z.string().trim().nullable().optional(),
  egcs_fc_description: RequiredString(),
  egcs_fc_amount: MoneySchema,
  egcs_fc_currency: z.enum(CURRENCY_CODES_ENUM, { error: 'validation.required' })
})

export const FundingCaseAgreementClaimLineItemCreateSchema = FundingCaseAgreementClaimLineItemBaseSchema
export const FundingCaseAgreementClaimLineItemPatchSchema = FundingCaseAgreementClaimLineItemBaseSchema.partial().superRefine(() => undefined)

export type FundingCaseAgreementClaimLineItem = z.infer<typeof FundingCaseAgreementClaimLineItemCreateSchema>
export type FundingCaseAgreementClaimLineItemPatch = z.infer<typeof FundingCaseAgreementClaimLineItemPatchSchema>
export type FundingCaseAgreementClaimLineItemItem = WithId<FundingCaseAgreementClaimLineItem>

export const FundingCaseAgreementClaimReconcileBaseSchema = z.object({
  egcs_fc_fundingagreementclaim: RequiredBigintSelectionId(),
  egcs_fc_isfinal: z.boolean()
})

export const FundingCaseAgreementClaimReconcileCreateSchema = FundingCaseAgreementClaimReconcileBaseSchema.strict()
export const FundingCaseAgreementClaimReconcilePatchSchema = FundingCaseAgreementClaimReconcileBaseSchema.partial()
  .extend({ egcs_fc_status: ForbiddenBusinessStatusMutation() })
  .strict()
  .superRefine(() => undefined)

export type FundingCaseAgreementClaimReconcile = z.infer<typeof FundingCaseAgreementClaimReconcileCreateSchema>
export type FundingCaseAgreementClaimReconcilePatch = z.infer<typeof FundingCaseAgreementClaimReconcilePatchSchema>
export type FundingCaseAgreementClaimReconcileItem = WithId<FundingCaseAgreementClaimReconcile & {
  egcs_fc_user: string
  egcs_fc_status: StatusId
  egcs_fc_isopen: boolean
}>

export const FundingCaseAgreementClaimReconcileLineItemBaseSchema = z.object({
  egcs_fc_fundingagreementclaimreconcile: RequiredBigintSelectionId(),
  egcs_fc_lineitem: RequiredBigintSelectionId(),
  egcs_fc_reconciled: MoneySchema,
  egcs_fc_sampled: OptionalMoneySchema,
  egcs_fc_rationale: OptionalText()
})

export const FundingCaseAgreementClaimReconcileLineItemCreateSchema = FundingCaseAgreementClaimReconcileLineItemBaseSchema
export const FundingCaseAgreementClaimReconcileLineItemPatchSchema = FundingCaseAgreementClaimReconcileLineItemBaseSchema.partial().superRefine(() => undefined)

export type FundingCaseAgreementClaimReconcileLineItem = z.infer<typeof FundingCaseAgreementClaimReconcileLineItemCreateSchema>
export type FundingCaseAgreementClaimReconcileLineItemPatch = z.infer<typeof FundingCaseAgreementClaimReconcileLineItemPatchSchema>
export type FundingCaseAgreementClaimReconcileLineItemItem = WithId<FundingCaseAgreementClaimReconcileLineItem>

export const FundingCaseAgreementClaimReconcileLineItemBulkSaveSchema = z.object({
  lines: z.array(z.object({
    claim_line_id: RequiredBigintSelectionId(),
    reconcile_line_id: PositivePostgresBigintIdSchema.nullable().optional(),
    egcs_fc_reconciled: MoneySchema,
    egcs_fc_sampled: OptionalMoneySchema,
    egcs_fc_rationale: OptionalText()
  }).strict()),
  egcs_fc_isfinal: z.boolean().optional()
}).strict().superRefine((value, ctx) => {
  const claimLineIds = value.lines.map(line => line.claim_line_id)
  if (new Set(claimLineIds).size !== claimLineIds.length) {
    ctx.addIssue({ code: 'custom', path: ['lines'], message: 'validation.duplicate' })
  }
  const reconcileLineIds = value.lines.flatMap(line => line.reconcile_line_id == null ? [] : [line.reconcile_line_id])
  if (new Set(reconcileLineIds).size !== reconcileLineIds.length) {
    ctx.addIssue({ code: 'custom', path: ['lines'], message: 'validation.duplicate' })
  }
})

export type FundingCaseAgreementClaimReconcileLineItemBulkSave = z.infer<typeof FundingCaseAgreementClaimReconcileLineItemBulkSaveSchema>

const OptionalDate = () => z.preprocess(
  value => {
    if (value === null || value === undefined || value === '') {
      return undefined
    }

    return value
  },
  z.coerce.date().optional()
)

export const FundingCaseAgreementMonitorBaseSchema = z.object({
  egcs_fc_type: RequiredBigintSelectionId(),
  egcs_fc_onsite: z.boolean(),
  egcs_fc_tentativefiscalyear: RequiredBigintSelectionId(),
  egcs_fc_tentativequarter: RequiredSmallint().refine(value => value >= 1 && value <= 4, { error: 'validation.invalid_number' })
})

export const FundingCaseAgreementMonitorCreateSchema = FundingCaseAgreementMonitorBaseSchema
export const FundingCaseAgreementMonitorPatchSchema = FundingCaseAgreementMonitorBaseSchema.partial()
  .extend({ egcs_fc_status: ForbiddenBusinessStatusMutation() })
  .refine(value => Object.keys(value).length > 0, { error: 'validation.required' })

export type FundingCaseAgreementMonitor = z.infer<typeof FundingCaseAgreementMonitorCreateSchema>
export type FundingCaseAgreementMonitorPatch = z.infer<typeof FundingCaseAgreementMonitorPatchSchema>
export type FundingCaseAgreementMonitorItem = WithId<FundingCaseAgreementMonitor & {
  egcs_fc_fundingagreement: string
  egcs_fc_status: StatusId
}>

export const FundingCaseAgreementMonitorPlanningBaseSchema = z.object({
  egcs_fc_fundingagreementmonitor: RequiredBigintSelectionId(),
  egcs_fc_objective: RequiredString()
})

export const FundingCaseAgreementMonitorPlanningCreateSchema = FundingCaseAgreementMonitorPlanningBaseSchema
export const FundingCaseAgreementMonitorPlanningPatchSchema = FundingCaseAgreementMonitorPlanningBaseSchema
  .omit({ egcs_fc_fundingagreementmonitor: true })
  .partial()
  .superRefine(() => undefined)

export type FundingCaseAgreementMonitorPlanning = z.infer<typeof FundingCaseAgreementMonitorPlanningCreateSchema>
export type FundingCaseAgreementMonitorPlanningPatch = z.infer<typeof FundingCaseAgreementMonitorPlanningPatchSchema>
export type FundingCaseAgreementMonitorPlanningItem = WithId<FundingCaseAgreementMonitorPlanning>

export const FundingCaseAgreementMonitorItemsBaseSchema = z.object({
  egcs_fc_fundingagreementmonitor: RequiredBigintSelectionId(),
  egcs_fc_item: RequiredString().max(255, { error: 'validation.max_length' }),
  egcs_fc_plannedstart: z.coerce.date({ error: 'validation.required' }),
  egcs_fc_plannedend: z.coerce.date({ error: 'validation.required' }),
  egcs_fc_detail: RequiredString(),
  egcs_fc_monitored: z.boolean(),
  egcs_fc_actualstart: OptionalDate(),
  egcs_fc_actualend: OptionalDate()
})

const validateMonitorItemDates = (
  data: Partial<{
    egcs_fc_plannedstart: Date
    egcs_fc_plannedend: Date
    egcs_fc_actualstart?: Date
    egcs_fc_actualend?: Date
    egcs_fc_monitored: boolean
  }>,
  ctx: z.RefinementCtx
) => {
  validateMonitorDateOrder(data.egcs_fc_plannedstart, data.egcs_fc_plannedend, 'egcs_fc_plannedend', ctx)
  validateMonitorDateOrder(data.egcs_fc_actualstart, data.egcs_fc_actualend, 'egcs_fc_actualend', ctx)
  validateMonitoredActualDates(data, ctx)
}

const validateMonitorDateOrder = (
  start: Date | undefined,
  end: Date | undefined,
  path: string,
  ctx: z.RefinementCtx
) => {
  if (start && end && start > end) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'validation.date_range',
      path: [path]
    })
  }
}

const addRequiredMonitorDateIssue = (path: string, ctx: z.RefinementCtx) => {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'validation.required',
    path: [path]
  })
}

const validateMonitoredActualDates = (
  data: Partial<{
    egcs_fc_actualstart?: Date
    egcs_fc_actualend?: Date
    egcs_fc_monitored: boolean
  }>,
  ctx: z.RefinementCtx
) => {
  if (data.egcs_fc_monitored !== true) {
    return
  }

  if (!data.egcs_fc_actualstart) {
    addRequiredMonitorDateIssue('egcs_fc_actualstart', ctx)
  }

  if (!data.egcs_fc_actualend) {
    addRequiredMonitorDateIssue('egcs_fc_actualend', ctx)
  }
}

export const FundingCaseAgreementMonitorItemsCreateSchema = FundingCaseAgreementMonitorItemsBaseSchema.superRefine(validateMonitorItemDates)
export const FundingCaseAgreementMonitorItemsPatchSchema = FundingCaseAgreementMonitorItemsBaseSchema
  .omit({ egcs_fc_fundingagreementmonitor: true })
  .partial()
  .superRefine(validateMonitorItemDates)

export type FundingCaseAgreementMonitorItems = z.infer<typeof FundingCaseAgreementMonitorItemsCreateSchema>
export type FundingCaseAgreementMonitorItemsPatch = z.infer<typeof FundingCaseAgreementMonitorItemsPatchSchema>
export type FundingCaseAgreementMonitorItemsItem = WithId<FundingCaseAgreementMonitorItems>

export const FundingCaseAgreementMonitorFindingBaseSchema = z.object({
  egcs_fc_fundingagreementmonitor: RequiredBigintSelectionId(),
  egcs_fc_findingname: RequiredString().max(255, { error: 'validation.max_length' }),
  egcs_fc_recommendationtype: z.enum(MONITOR_ACTION_TYPE_ENUM, { error: 'validation.required' }),
  egcs_fc_responsibleparty: z.enum(MONITOR_RESPONSIBLE_PARTY_ENUM, { error: 'validation.required' }),
  egcs_fc_detail: RequiredString()
})

export const FundingCaseAgreementMonitorFindingCreateSchema = FundingCaseAgreementMonitorFindingBaseSchema
export const FundingCaseAgreementMonitorFindingPatchSchema = FundingCaseAgreementMonitorFindingBaseSchema
  .omit({ egcs_fc_fundingagreementmonitor: true })
  .partial()
  .superRefine(() => undefined)

export type FundingCaseAgreementMonitorFinding = z.infer<typeof FundingCaseAgreementMonitorFindingCreateSchema>
export type FundingCaseAgreementMonitorFindingPatch = z.infer<typeof FundingCaseAgreementMonitorFindingPatchSchema>
export type FundingCaseAgreementMonitorFindingItem = WithId<FundingCaseAgreementMonitorFinding & {
  egcs_fc_recommendationtype: Monitor_Action_Type
  egcs_fc_responsibleparty: Monitor_Responsible_Party
}>

export const FundingCaseAgreementMonitorFollowupBaseSchema = z.object({
  egcs_fc_fundingagreementmonitor: RequiredBigintSelectionId(),
  egcs_fc_followupname: RequiredString().max(255, { error: 'validation.max_length' }),
  egcs_fc_responsibleparty: z.enum(MONITOR_RESPONSIBLE_PARTY_ENUM, { error: 'validation.required' }),
  egcs_fc_duedate: z.coerce.date({ error: 'validation.required' })
})

export const FundingCaseAgreementMonitorFollowupCreateSchema = FundingCaseAgreementMonitorFollowupBaseSchema
export const FundingCaseAgreementMonitorFollowupPatchSchema = FundingCaseAgreementMonitorFollowupBaseSchema
  .omit({ egcs_fc_fundingagreementmonitor: true })
  .partial()
  .superRefine(() => undefined)

export type FundingCaseAgreementMonitorFollowup = z.infer<typeof FundingCaseAgreementMonitorFollowupCreateSchema>
export type FundingCaseAgreementMonitorFollowupPatch = z.infer<typeof FundingCaseAgreementMonitorFollowupPatchSchema>
export type FundingCaseAgreementMonitorFollowupItem = WithId<FundingCaseAgreementMonitorFollowup & {
  egcs_fc_status: Follow_Up_Status
  egcs_fc_responsibleparty: Monitor_Responsible_Party
}>

export const FundingCaseAgreementMonitorFollowupUpdateBaseSchema = z.object({
  egcs_fc_fundingagreementmonitorfollowup: RequiredBigintSelectionId(),
  egcs_fc_update: RequiredString(),
  egcs_fc_status: z.enum(FOLLOW_UP_STATUS_ENUM, { error: 'validation.required' }),
  egcs_fc_updatedate: z.coerce.date({ error: 'validation.required' })
})

export const FundingCaseAgreementMonitorFollowupUpdateCreateSchema = FundingCaseAgreementMonitorFollowupUpdateBaseSchema
export const FundingCaseAgreementMonitorFollowupUpdatePatchSchema = FundingCaseAgreementMonitorFollowupUpdateBaseSchema
  .omit({ egcs_fc_fundingagreementmonitorfollowup: true })
  .partial()
  .superRefine(() => undefined)

export type FundingCaseAgreementMonitorFollowupUpdate = z.infer<typeof FundingCaseAgreementMonitorFollowupUpdateCreateSchema>
export type FundingCaseAgreementMonitorFollowupUpdatePatch = z.infer<typeof FundingCaseAgreementMonitorFollowupUpdatePatchSchema>
export type FundingCaseAgreementMonitorFollowupUpdateItem = WithId<FundingCaseAgreementMonitorFollowupUpdate>

export const FundingCaseAgreementMonitorPromisingPracticeBaseSchema = z.object({
  egcs_fc_fundingagreementmonitor: RequiredBigintSelectionId(),
  egcs_fc_practice: RequiredString()
})

export const FundingCaseAgreementMonitorPromisingPracticeCreateSchema = FundingCaseAgreementMonitorPromisingPracticeBaseSchema
export const FundingCaseAgreementMonitorPromisingPracticePatchSchema = FundingCaseAgreementMonitorPromisingPracticeBaseSchema
  .omit({ egcs_fc_fundingagreementmonitor: true })
  .partial()
  .superRefine(() => undefined)

export type FundingCaseAgreementMonitorPromisingPractice = z.infer<typeof FundingCaseAgreementMonitorPromisingPracticeCreateSchema>
export type FundingCaseAgreementMonitorPromisingPracticePatch = z.infer<typeof FundingCaseAgreementMonitorPromisingPracticePatchSchema>
export type FundingCaseAgreementMonitorPromisingPracticeItem = WithId<FundingCaseAgreementMonitorPromisingPractice>
