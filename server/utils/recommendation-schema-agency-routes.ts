/* eslint-disable jsdoc/require-jsdoc -- Agency Recommendation Schema route implementations. */
import type { H3Event } from 'h3'
import { getRouterParam } from 'h3'
import { PaginationSchema, CommonRecommendationSchemaCreateSchema, CommonRecommendationSchemaPatchSchema } from '~~/shared/types/schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { authorize, requireAuthContext } from './authorize'
import { withActiveAgencyReadTransaction, withActiveAgencyMutationTransaction } from './agency-auth'
import { getValidatedQueryI18n, readValidatedBodyI18n } from './api-validate'
import { badRequest, notFound, throwApiError } from './api-errors'
import { escapeLikePattern } from './sql-like'
import { buildRecommendationSchemaDefinition, resolvePublicationActorId } from './recommendation-setup-versioning'
import { publishDefinition, readPublicationMetadata, retirePublication } from './system-publication'

const createBodySchema = CommonRecommendationSchemaCreateSchema.omit({ egcs_cn_agency: true }).strict()
const patchBodySchema = CommonRecommendationSchemaPatchSchema.omit({ egcs_cn_agency: true, _deleted: true }).strict()

const ids = async (event: H3Event, detail = false) => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const schemaId = getRouterParam(event, 'schemaId') ?? ''
  if (!isPositivePostgresBigintText(agencyId)) await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  if (detail && !isPositivePostgresBigintText(schemaId)) await notFound(event, 'RECOMMENDATION_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
  return { agencyId, schemaId }
}

const lockSchema = async (event: H3Event, trx: H3Event['context']['$db'], agencyId: string, schemaId: string) => {
  const schema = await trx.selectFrom('Common_Recommendation_Schema')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Recommendation_Schema.id')
    .selectAll('Common_Recommendation_Schema')
    .select('Common_Publication.egcs_cn_state as publicationState')
    .where('Common_Recommendation_Schema.id', '=', schemaId)
    .where('Common_Recommendation_Schema.egcs_cn_agency', '=', agencyId)
    .where('Common_Recommendation_Schema._deleted', '=', false)
    .where('Common_Publication._deleted', '=', false)
    .forUpdate(['Common_Recommendation_Schema', 'Common_Publication'])
    .executeTakeFirst()
  if (!schema) return await notFound(event, 'RECOMMENDATION_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
  return schema
}

export const listAgencyRecommendationSchemas = async (event: H3Event) => {
  const { agencyId } = await ids(event)
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    let query = trx.selectFrom('Common_Recommendation_Schema')
      .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Recommendation_Schema.id')
      .leftJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
      .where('Common_Recommendation_Schema.egcs_cn_agency', '=', agencyId)
      .where('Common_Recommendation_Schema._deleted', '=', false)
      .where('Common_Publication._deleted', '=', false)
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      query = query.where(eb => eb.or([
        eb('Common_Recommendation_Schema.egcs_cn_name_en', 'ilike', pattern),
        eb('Common_Recommendation_Schema.egcs_cn_name_fr', 'ilike', pattern)
      ]))
    }
    const [items, count] = await Promise.all([
      query.selectAll('Common_Recommendation_Schema')
        .select(['Common_Publication.egcs_cn_state as publicationState', 'Common_Publication_Version.egcs_cn_version as publicationVersion'])
        .orderBy('Common_Recommendation_Schema.id', 'asc').limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => eb.fn.count('Common_Recommendation_Schema.id').as('total')).executeTakeFirst()
    ])
    const total = Number(count?.total ?? 0)
    return { items: items.map(item => ({ ...item, id: String(item.id), egcs_cn_agency: String(item.egcs_cn_agency) })),
      total, stats: { total }, page, limit }
  })
}

export const createAgencyRecommendationSchema = async (event: H3Event) => {
  const { agencyId } = await ids(event)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const body = await readValidatedBodyI18n(event, createBodySchema)
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const created = await trx.insertInto('Common_Recommendation_Schema')
      .values({ ...body, egcs_cn_agency: agencyId, _deleted: false })
      .returningAll().executeTakeFirstOrThrow()
    const metadata = await readPublicationMetadata(trx, String(created.id), buildRecommendationSchemaDefinition(created))
    return { ...created, id: String(created.id), egcs_cn_agency: String(created.egcs_cn_agency), ...metadata }
  })
}

export const getAgencyRecommendationSchema = async (event: H3Event) => {
  const { agencyId, schemaId } = await ids(event, true)
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const schema = await trx.selectFrom('Common_Recommendation_Schema').selectAll()
      .where('id', '=', schemaId).where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
    if (!schema) return await notFound(event, 'RECOMMENDATION_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
    return { ...schema, id: String(schema.id), egcs_cn_agency: String(schema.egcs_cn_agency),
      ...await readPublicationMetadata(trx, schemaId, buildRecommendationSchemaDefinition(schema)) }
  })
}

export const patchAgencyRecommendationSchema = async (event: H3Event) => {
  const { agencyId, schemaId } = await ids(event, true)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const body = await readValidatedBodyI18n(event, patchBodySchema)
  if (Object.keys(body).length === 0) return await badRequest(event, 'EMPTY_UPDATE', 'apiErrors.request.invalid_resource')
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const current = await lockSchema(event, trx, agencyId, schemaId)
    if (current.publicationState === 'retired') return await throwApiError(event, { statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status' })
    const updated = await trx.updateTable('Common_Recommendation_Schema').set(body)
      .where('id', '=', schemaId).where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false)
      .returningAll().executeTakeFirstOrThrow()
    return { ...updated, id: String(updated.id), egcs_cn_agency: String(updated.egcs_cn_agency),
      ...await readPublicationMetadata(trx, schemaId, buildRecommendationSchemaDefinition(updated)) }
  })
}

export const publishAgencyRecommendationSchema = async (event: H3Event) => {
  const { agencyId, schemaId } = await ids(event, true)
  const auth = await requireAuthContext(event)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const schema = await lockSchema(event, trx, agencyId, schemaId)
    const actorId = await resolvePublicationActorId(trx, auth.userId)
    if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const publication = await publishDefinition(trx, { publicationId: schemaId, kind: 'recommendation_schema',
      definition: buildRecommendationSchemaDefinition(schema), actorId })
    const { definition: _definition, hash: _hash, ...metadata } = publication
    return { ...schema, id: String(schema.id), egcs_cn_agency: String(schema.egcs_cn_agency), ...metadata }
  })
}

export const retireAgencyRecommendationSchema = async (event: H3Event) => {
  const { agencyId, schemaId } = await ids(event, true)
  const auth = await requireAuthContext(event)
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    await lockSchema(event, trx, agencyId, schemaId)
    const actorId = await resolvePublicationActorId(trx, auth.userId)
    if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    return await retirePublication(trx, { publicationId: schemaId, kind: 'recommendation_schema', actorId })
  })
}
