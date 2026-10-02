import { z } from 'zod'
import { RequiredDateSchema } from './form-input'
import { NonNegativeMoneySchema } from './money'
import { PositivePostgresBigintIdSchema as DatabaseIdSchema } from './common'

export const JournalVoucherCreateSchema = z.object({
  egcs_fc_payment: DatabaseIdSchema,
  egcs_fc_replacementof: DatabaseIdSchema.optional(),
  egcs_fc_requesteddate: RequiredDateSchema,
  egcs_fc_narrative_en: z.string().max(10000).default(''),
  egcs_fc_narrative_fr: z.string().max(10000).default('')
}).strict()

export const JournalVoucherAllocationSchema = z.object({
  egcs_fc_commitmentline: DatabaseIdSchema,
  egcs_fc_chartofaccount: DatabaseIdSchema,
  egcs_fc_amount: NonNegativeMoneySchema
})

export const JournalVoucherEditSchema = JournalVoucherCreateSchema.omit({
  egcs_fc_payment: true, egcs_fc_replacementof: true
}).extend({ egcs_fc_allocations: z.array(JournalVoucherAllocationSchema).max(500) }).strict()

export const JournalVoucherReversalSchema = JournalVoucherCreateSchema.omit({
  egcs_fc_payment: true, egcs_fc_replacementof: true
}).strict()

export type JournalVoucherCreate = z.infer<typeof JournalVoucherCreateSchema>
export type JournalVoucherEdit = z.infer<typeof JournalVoucherEditSchema>
export type JournalVoucherAllocation = z.infer<typeof JournalVoucherAllocationSchema>
