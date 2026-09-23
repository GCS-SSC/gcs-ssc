import type { H3Event } from 'h3'
import type { Kysely, Updateable } from 'kysely'
import type { z } from 'zod'
import type { Database } from '~~/shared/types/database'
import type { TransferPaymentStreamRecommendationSetupPatchSchema } from '~~/shared/types/schemas'
import { badRequest, notFound, throwApiError } from './api-errors'
import { validateRecommendationSchemasForAgency } from './transfer-payment-polymorphic'
import { lockRecommendationSetupForMutation, readRecommendationSetupPublicationMetadata } from './recommendation-setup-versioning'

/* eslint-disable jsdoc/require-jsdoc -- Transaction helpers have typed internal contracts. */

type PatchBody = z.infer<typeof TransferPaymentStreamRecommendationSetupPatchSchema>

export const validateRecommendationApprovalForAgency = async (
  db: Kysely<Database>, agencyId: string, templateId?: string | null
): Promise<boolean> => {
  if (!templateId) return true
  const template = await db.selectFrom('Common_Approval_Template')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Approval_Template.id')
    .select('Common_Approval_Template.id')
    .where('Common_Approval_Template.id', '=', templateId)
    .where('Common_Approval_Template.egcs_cn_agency', '=', agencyId)
    .where('Common_Approval_Template._deleted', '=', false)
    .where('Common_Publication._deleted', '=', false)
    .where('Common_Publication.egcs_cn_state', '=', 'published')
    .executeTakeFirst()
  return Boolean(template)
}

export const validateRecommendationDependencies = async (
  event: H3Event, db: Kysely<Database>, agencyId: string,
  schemaIds: string[], approvalIds: Array<string | null | undefined>
): Promise<void> => {
  if (!await validateRecommendationSchemasForAgency(db, agencyId, schemaIds, { forUpdate: true })) {
    await badRequest(event, 'RECOMMENDATION_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
  }
  for (const templateId of approvalIds) {
    if (!await validateRecommendationApprovalForAgency(db, agencyId, templateId)) {
      await badRequest(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.transfer_payment.approval_template_not_found')
    }
  }
}

export const patchAgencyRecommendationSetup = async (
  event: H3Event, db: Kysely<Database>,
  options: { agencyId: string, recommendationSetupId: string, body: PatchBody }
) => {
  const current = await lockRecommendationSetupForMutation(db, options.recommendationSetupId, options.agencyId)
  if (!current) return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')
  if (current.publicationState === 'retired') {
    return await throwApiError(event, {
      statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
    })
  }
  const members = options.body.members
  await validateRecommendationDependencies(
    event, db, options.agencyId,
    members?.map(member => String(member.egcs_cn_recommendationschema)) ?? [],
    [options.body.egcs_cn_approvaltemplate, ...(members ?? []).map(member => member.egcs_cn_approvaltemplate)]
  )
  const bodyFields: Record<string, unknown> = { ...options.body }
  delete bodyFields.members
  delete bodyFields._deleted
  const updated = Object.keys(bodyFields).length === 0
    ? current
    : await db.updateTable('Common_Recommendation_Set_Setup')
        .set(bodyFields as Updateable<Database['Common_Recommendation_Set_Setup']>)
        .where('id', '=', options.recommendationSetupId).where('egcs_cn_agency', '=', options.agencyId)
        .where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow()
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
  return { ...updated, id: String(updated.id), egcs_cn_agency: String(updated.egcs_cn_agency), ...metadata,
    members: hydratedMembers.map(member => ({ ...member, id: String(member.id),
      egcs_cn_recommendationset: String(member.egcs_cn_recommendationset),
      egcs_cn_recommendationschema: String(member.egcs_cn_recommendationschema) })) }
}
