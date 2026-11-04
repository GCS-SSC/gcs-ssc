import { defineEventHandler, getRouterParam } from 'h3'
import { PaginationSchema } from '~~/shared/types/schemas'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { agreementRelationshipQuery } from '~~/server/utils/agreement-relationship'
import { badRequest } from '~~/server/utils/api-errors'
import { escapeLikePattern } from '~~/server/utils/sql-like'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  return await executeFreshReadSnapshot(event, async (db, freshAuthContext) => {
    const context = await authorizeAgreementResource(event, 'read', agreementId, db, { freshAuth: true, freshAuthContext })
    if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
    let query = agreementRelationshipQuery(db, agreementId).where('program.egcs_tp_agency', '=', context.agencyId)
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      query = query.where(eb => eb.or([
        eb('relationship.egcs_fc_description', 'ilike', pattern),
        eb('related.egcs_fc_agreementnumber', 'ilike', pattern),
        eb('related.egcs_fc_title_en', 'ilike', pattern), eb('related.egcs_fc_title_fr', 'ilike', pattern),
        eb('program.egcs_tp_name_en', 'ilike', pattern), eb('program.egcs_tp_name_fr', 'ilike', pattern),
        eb('stream.egcs_tp_name_en', 'ilike', pattern), eb('stream.egcs_tp_name_fr', 'ilike', pattern),
        eb('type.egcs_ay_typename_en', 'ilike', pattern), eb('type.egcs_ay_typename_fr', 'ilike', pattern)
      ]))
    }
    const [items, count] = await Promise.all([
      query.select([
        'relationship.id', 'related.id as egcs_fc_relatedagreement', 'relationship.egcs_fc_relationshiptype',
        'relationship.egcs_fc_description',
        'related.egcs_fc_agreementnumber', 'related.egcs_fc_title_en', 'related.egcs_fc_title_fr',
        'program.egcs_tp_name_en as program_name_en', 'program.egcs_tp_name_fr as program_name_fr',
        'stream.egcs_tp_name_en as stream_name_en', 'stream.egcs_tp_name_fr as stream_name_fr',
        'type.egcs_ay_typename_en as relationship_type_name_en', 'type.egcs_ay_typename_fr as relationship_type_name_fr'
      ]).orderBy('relationship.id').limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => eb.fn.count('relationship.id').as('total')).executeTakeFirstOrThrow()
    ])
    const total = Number(count.total)
    return { items, total, page, limit, stats: { total, active: total } }
  })
})
