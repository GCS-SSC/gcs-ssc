import { z } from 'zod'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import {
  canAccessAgreement,
  canAccessAgreementStream,
  resolveAgreementScopeContext,
  resolveAgreementStreamScopeContext
} from '~~/server/utils/agreement'
import { collectFundingHistorySimilarityWarnings } from '~~/server/utils/funding-history'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'

const BodySchema = z.object({
  streamId: PositivePostgresBigintIdSchema,
  agreementNumber: z.string().trim().min(1),
  excludeAgreementId: PositivePostgresBigintIdSchema.optional()
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  const context = await requireAuthContext(event)
  const body = await readValidatedBodyI18n(event, BodySchema)
  const streamContext = await resolveAgreementStreamScopeContext(body.streamId, db, {
    requireAvailable: !body.excludeAgreementId
  })
  if (!streamContext) return await badRequest(event, 'INVALID_AGREEMENT_STREAM', 'apiErrors.agreement.invalid_stream')

  if (body.excludeAgreementId) {
    const agreementContext = await resolveAgreementScopeContext(body.excludeAgreementId, db)
    if (!agreementContext) return await badRequest(event, 'INVALID_AGREEMENT', 'apiErrors.agreement.not_found')
    await authorize(event, 'agreement', 'update', async ({ context }) =>
      await canAccessAgreement(context, 'update', agreementContext.scope, db)
        ? { bypass: true }
        : { scope: agreementContext.scope }
    )
    if (agreementContext.streamId !== body.streamId) {
      return await badRequest(event, 'INVALID_AGREEMENT_STREAM', 'apiErrors.agreement.invalid_stream')
    }
  } else {
    await authorize(event, 'agreement', 'create', async ({ context }) =>
      await canAccessAgreementStream(context, 'create', streamContext.scope, db)
        ? { bypass: true }
        : { scope: streamContext.scope }
    )
  }
  return {
    warnings: await collectFundingHistorySimilarityWarnings(context, {
      egcs_ar_agencyname_en: streamContext.agencyNameEn,
      egcs_ar_agencyname_fr: streamContext.agencyNameFr,
      egcs_ar_programname_en: streamContext.programNameEn,
      egcs_ar_programname_fr: streamContext.programNameFr,
      egcs_ar_agreementnumber: body.agreementNumber
    }, db, { proposedSource: 'system', excludeAgreementId: body.excludeAgreementId })
  }
})
