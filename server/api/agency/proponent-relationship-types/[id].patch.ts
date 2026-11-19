import { defineEventHandler, getRouterParam } from 'h3'
import { AgencyProponentRelationshipTypePatchSchema, AgencyProponentRelationshipTypeSchema } from '~~/shared/types/schemas'
import { authorizeActiveAgencySubentity, withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'

const missing = {
  code: 'PROPONENT_RELATIONSHIP_TYPE_NOT_FOUND',
  key: 'apiErrors.agency.proponent_relationship_type_not_found'
}

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')

  const { agencyId } = await authorizeActiveAgencySubentity(event, 'Agency_Proponent_Relationship_Type', id, 'update', missing)
  const body = await readValidatedBodyI18n(event, AgencyProponentRelationshipTypePatchSchema)
  if (Object.keys(body).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }

  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const current = await trx.selectFrom('Agency_Proponent_Relationship_Type')
      .selectAll()
      .where('id', '=', id)
      .where('egcs_ay_organizationagency', '=', agencyId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
    if (!current) return await notFound(event, missing.code, missing.key)

    await parseI18n(event, AgencyProponentRelationshipTypeSchema, { ...current, ...body })
    return await trx.updateTable('Agency_Proponent_Relationship_Type')
      .set(body)
      .where('id', '=', current.id)
      .returningAll()
      .executeTakeFirstOrThrow()
  })
})
