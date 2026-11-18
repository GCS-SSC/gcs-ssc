/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- schema factories expose typed date contracts. */
import type { z } from 'zod'
import { FundingCaseAgreementActivityBaseSchema, FundingCaseAgreementActivityCreateSchema } from './funding-case-agreement'

export type AgreementActivityDuration = { startDate: Date; endDate: Date }

/** Adds inclusive Agreement duration checks to the existing required date fields. */
const validateActivityDuration = (
  dates: { egcs_fc_startdate: Date; egcs_fc_enddate: Date },
  duration: AgreementActivityDuration,
  ctx: z.RefinementCtx
) => {
  for (const field of ['egcs_fc_startdate', 'egcs_fc_enddate'] as const) {
    const day = Math.floor(dates[field].getTime() / 86400000)
    if (day < Math.floor(duration.startDate.getTime() / 86400000) || day > Math.floor(duration.endDate.getTime() / 86400000)) {
      ctx.addIssue({ code: 'custom', message: 'validation.activity_date_outside_agreement', path: [field] })
    }
  }
}

/** Validates effective persisted/patch date pairs against their owning duration. */
export const createAgreementActivityDateRangeSchema = (duration: AgreementActivityDuration) =>
  FundingCaseAgreementActivityBaseSchema.pick({ egcs_fc_startdate: true, egcs_fc_enddate: true })
    .refine(dates => dates.egcs_fc_startdate <= dates.egcs_fc_enddate, {
      message: 'validation.date_range', path: ['egcs_fc_enddate']
    })
    .superRefine((dates, ctx) => validateActivityDuration(dates, duration, ctx))

/** Keeps activity form requirements and date bounds on the same schema. */
export const createAgreementActivitySchema = (duration: AgreementActivityDuration) =>
  FundingCaseAgreementActivityCreateSchema.superRefine((dates, ctx) => validateActivityDuration(dates, duration, ctx))
