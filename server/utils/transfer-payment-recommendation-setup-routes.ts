import type { H3Event } from 'h3'
import type { Kysely, Updateable } from 'kysely'
import type { z } from 'zod'
import type { Database } from '~~/shared/types/database'
import type { TransferPaymentStreamRecommendationSetupPatchSchema } from '~~/shared/types/schemas'
import { badRequest, notFound, throwApiError } from './api-errors'
import { validateApprovalTemplateForScope, validateRecommendationSchemasForAgency } from './transfer-payment-polymorphic'
import { lockRecommendationSetupForMutation, readRecommendationSetupPublicationMetadata } from './recommendation-setup-versioning'

/* eslint-disable jsdoc/require-jsdoc -- Transaction helper has a typed internal contract. */

type PatchBody = z.infer<typeof TransferPaymentStreamRecommendationSetupPatchSchema>

interface PatchOptions {
  agencyId: string
  streamId: string
  recommendationSetupId: string
  body: PatchBody
}

export const patchTransferPaymentRecommendationSetup = async (
  event: H3Event,
  db: Kysely<Database>,
  options: PatchOptions
) => {
  const current = await lockRecommendationSetupForMutation(db, options.recommendationSetupId, options.streamId)
  if (!current) return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')
  if (current.publicationState === 'retired') {
    return await throwApiError(event, {
      statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
    })
  }

  if (options.body.members) {
    const schemaIds = options.body.members.map(member => String(member.egcs_cn_recommendationschema))
    if (!await validateRecommendationSchemasForAgency(db, options.agencyId, schemaIds)) {
      return await badRequest(event, 'RECOMMENDATION_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
    }
  }

  const approvalIds = [
    options.body.egcs_cn_approvaltemplate,
    ...(options.body.members ?? []).map(member => member.egcs_cn_approvaltemplate)
  ]
    .filter((value): value is string => Boolean(value))
  for (const approvalId of approvalIds) {
    if (!await validateApprovalTemplateForScope(db, options.streamId, String(approvalId))) {
      return await badRequest(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.transfer_payment.approval_template_not_found')
    }
  }

  const members = options.body.members
  const bodyFields: Record<string, unknown> = { ...options.body }
  delete bodyFields.members
  delete bodyFields._deleted
  const updated = Object.keys(bodyFields).length === 0
    ? current
    : await db.updateTable('Common_Recommendation_Set_Setup')
        .set(bodyFields as Updateable<Database['Common_Recommendation_Set_Setup']>)
        .where('id', '=', options.recommendationSetupId).where('_deleted', '=', false)
        .returningAll().executeTakeFirstOrThrow()

  let hydratedMembers
  if (members) {
    await db.updateTable('Common_Recommendation_Setup').set({ _deleted: true })
      .where('egcs_cn_recommendationset', '=', options.recommendationSetupId).where('_deleted', '=', false).execute()
    hydratedMembers = members.length === 0
      ? []
      : await db.insertInto('Common_Recommendation_Setup').values(members.map(member => ({
          egcs_cn_order: member.egcs_cn_order,
          egcs_cn_recommendationset: options.recommendationSetupId,
          egcs_cn_approvaltemplate: member.egcs_cn_approvaltemplate,
          egcs_cn_recommendationschema: member.egcs_cn_recommendationschema,
          egcs_cn_failonnotrecommended: member.egcs_cn_failonnotrecommended,
          _deleted: false
        }))).returningAll().execute()
  } else {
    hydratedMembers = await db.selectFrom('Common_Recommendation_Setup').selectAll()
      .where('egcs_cn_recommendationset', '=', options.recommendationSetupId).where('_deleted', '=', false)
      .orderBy('egcs_cn_order', 'asc').execute()
  }

  const metadata = await readRecommendationSetupPublicationMetadata(db, updated)
  return { ...updated, id: String(updated.id), egcs_cn_scopeid: String(updated.egcs_cn_scopeid), ...metadata, members: hydratedMembers.map(member => ({
    ...member,
    id: String(member.id),
    egcs_cn_recommendationset: String(member.egcs_cn_recommendationset),
    egcs_cn_recommendationschema: String(member.egcs_cn_recommendationschema)
  })) }
}
