import { z } from 'zod'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { authorizeAgreementResource, canAccessAgreementStream, resolveAgreementStreamScopeContext } from '~~/server/utils/agreement'
import { canAccessApplicantRecipientIds } from '~~/server/utils/applicant-recipient-auth'
import { listAgreementFinancialIds } from '~~/server/utils/agreement-financial-ids'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { badRequest } from '~~/server/utils/api-errors'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

const QuerySchema = PaginationSchema.extend({
  stream_id: PositivePostgresBigintIdSchema.optional(),
  agreement_id: PositivePostgresBigintIdSchema.optional(),
  proponent_id: PositivePostgresBigintIdSchema,
  selected_id: PositivePostgresBigintIdSchema.optional(),
  child_id: PositivePostgresBigintIdSchema.optional(),
  permission_action: z.enum(['create', 'update']).default('create'),
  search: PaginationSchema.shape.search.refine(value => value === undefined || !value.includes('\u0000'), {
    error: 'validation.invalid_text_character'
  })
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
    const saved = query.agreement_id && query.child_id && query.selected_id
      ? await db.selectFrom('Funding_Case_Agreement_Applicant_Recipient')
          .where('id', '=', query.child_id).where('egcs_fc_fundingagreement', '=', query.agreement_id)
          .where('egcs_fc_applicantrecipient', '=', query.proponent_id)
          .where('egcs_fc_agencyfinancialid', '=', query.selected_id).where('_deleted', '=', false)
          .select('egcs_fc_agencyfinancialid').executeTakeFirst()
      : undefined
    return await listAgreementFinancialIds(db, streamId!, query.proponent_id, {
      page: query.page, limit: query.limit, search: query.search,
      savedId: saved?.egcs_fc_agencyfinancialid ?? undefined, selectedId: query.selected_id
    })
  })
})
