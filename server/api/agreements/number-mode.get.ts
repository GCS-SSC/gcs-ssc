import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { authorize } from '~~/server/utils/authorize'
import { canAccessAgreementStream, resolveAgreementStreamScopeContext } from '~~/server/utils/agreement'
import { resolveAgreementNumberProvider } from '~~/server/utils/agreement-number-provider'

/** Resolves numbering presentation without allocating a number or exposing configuration. */
export default defineEventHandler(async event => {
  const { streamId } = await getValidatedQueryI18n(event, z.object({ streamId: PositivePostgresBigintIdSchema }))
  const db = event.context.$db
  const owner = await resolveAgreementStreamScopeContext(streamId, db, { requireAvailable: true })
  if (!owner) return await badRequest(event, 'INVALID_AGREEMENT_STREAM', 'apiErrors.agreement.invalid_stream')
  await authorize(event, 'agreement', 'create', async ({ context }) => {
    if (await canAccessAgreementStream(context, 'create', owner.scope, db)) return { bypass: true }
    return { scope: owner.scope }
  })
  return { mode: await resolveAgreementNumberProvider(event, db, owner.agencyId, streamId) ? 'generated' : 'manual' }
})
