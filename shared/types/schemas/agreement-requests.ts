import { z } from 'zod'
import { AGREEMENT_REQUEST_ENTITY_TYPES, AGREEMENT_REQUEST_STATUSES } from '../agreement-requests'
import { PositivePostgresBigintIdSchema } from './common'

export const AgreementRequestEntityTypeSchema = z.enum(AGREEMENT_REQUEST_ENTITY_TYPES, { error: 'validation.invalid_selection' })

const text = (max: number) => z.string({ error: 'validation.required' })
  .trim().max(max, { error: 'validation.max_length' })
  .refine(value => !value.includes('\u0000'), { error: 'validation.invalid_selection' })

const requiredText = (max: number) => text(max).refine(value => value.length > 0, { error: 'validation.required' })

const correspondence = {
  clientRequestId: z.uuid({ error: 'validation.invalid_selection' }),
  correspondenceAt: z.iso.datetime({ offset: true, error: 'validation.request_correspondence_date' })
    .refine(value => !value.startsWith('0000-') && Date.parse(value) <= Date.now(), { error: 'validation.request_correspondence_date' })
}

export const AgreementRequestCreateSchema = z.strictObject({
  ...correspondence,
  internal: z.boolean({ error: 'validation.required' }).default(true),
  subject: requiredText(255),
  body: requiredText(20000)
})

export const AgreementRequestEntryCreateSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...correspondence,
    kind: z.enum(['question', 'note']),
    body: requiredText(20000)
  }),
  z.strictObject({
    ...correspondence,
    kind: z.literal('reply'),
    questionId: PositivePostgresBigintIdSchema,
    body: text(20000).default(''),
    contactName: requiredText(255),
    contactEmail: z.email({ error: 'validation.invalid_email' }).max(255, { error: 'validation.max_length' }).optional()
  })
])

export const AgreementRequestThreadEditSchema = z.union([
  z.strictObject({ status: z.enum(AGREEMENT_REQUEST_STATUSES, { error: 'validation.invalid_selection' }) }),
  z.strictObject({ internal: z.boolean({ error: 'validation.required' }) })
])

export const AgreementRequestEntryEditSchema = z.strictObject({
  editDigest: z.string({ error: 'validation.required' }).regex(/^[0-9a-f]{64}$/, { error: 'validation.invalid_selection' }),
  body: text(20000),
  correspondenceAt: correspondence.correspondenceAt,
  contactName: requiredText(255).optional(),
  contactEmail: z.email({ error: 'validation.invalid_email' }).max(255, { error: 'validation.max_length' }).optional()
})
