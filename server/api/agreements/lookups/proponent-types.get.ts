import { z } from 'zod'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { authorizeAgreementResource, canAccessAgreementStream, resolveAgreementStreamScopeContext } from '~~/server/utils/agreement'
import { canAccessApplicantRecipientIds } from '~~/server/utils/applicant-recipient-auth'
import { getAgreementProponentTypeSelection } from '~~/server/utils/agreement-proponent-type'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { badRequest } from '~~/server/utils/api-errors'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

const QuerySchema = z.object({
  stream_id: PositivePostgresBigintIdSchema.optional(),
  agreement_id: PositivePostgresBigintIdSchema.optional(),
  proponent_id: PositivePostgresBigintIdSchema,
  permission_action: z.enum(['create', 'update']).default('create')
})

export default defineEventHandler(async event => {
  const query = await getValidatedQueryI18n(event, QuerySchema)
  return await executeFreshReadSnapshot(event, async db => {
    let streamId = query.stream_id
    if (query.agreement_id) {
      const context = await authorizeAgreementResource(event, query.permission_action, query.agreement_id, db)
      if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
      streamId = context.streamId
    } else {
      const stream = streamId ? await resolveAgreementStreamScopeContext(streamId, db, { requireAvailable: true }) : null
      if (!stream) return await badRequest(event, 'INVALID_AGREEMENT_STREAM', 'apiErrors.agreement.invalid_stream')
      await authorize(event, 'agreement', 'create', async ({ context }) => {
        if (await canAccessAgreementStream(context, 'create', stream.scope, db)) return { bypass: true }
        return { scope: stream.scope }
      })
    }
    const auth = await requireAuthContext(event)
    if (!await canAccessApplicantRecipientIds(auth, [query.proponent_id], 'read', db)) {
      return await badRequest(event, 'INVALID_AGREEMENT_APPLICANT_RECIPIENT', 'apiErrors.agreement.invalid_applicant_recipient')
    }
    const selection = await getAgreementProponentTypeSelection(db, streamId!, query.proponent_id)
    return { ...selection, total: selection.items.length }
  })
})
