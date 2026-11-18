import { defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { badRequest } from '~~/server/utils/api-errors'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementAmendmentExists } from '~~/server/utils/agreement-amendment'
import { readActivityCustomFieldDefinitions } from '~~/server/utils/agreement-custom-fields'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

const QuerySchema = z.object({
  permission_action: z.enum(['create', 'update', 'read']),
  amendment_id: PositivePostgresBigintIdSchema.optional()
})

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!PositivePostgresBigintIdSchema.safeParse(agreementId).success) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  return await executeFreshReadSnapshot(event, async (db, freshAuthContext) => {
    const { permission_action, amendment_id } = await getValidatedQueryI18n(event, QuerySchema)
    const context = await authorizeAgreementResource(event, permission_action, agreementId, db, {
      freshAuth: true,
      freshAuthContext,
      assignmentTarget: amendment_id ? { entityType: 'fundingcaseamendment', entityId: amendment_id } : undefined
    })
    if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    if (amendment_id && permission_action === 'read') {
      const amendment = await assertAgreementAmendmentExists(event, db, agreementId, amendment_id)
      if (!('id' in amendment)) return amendment
    }

    return { items: await readActivityCustomFieldDefinitions(db, context.streamId), sections: [] }
  })
})
