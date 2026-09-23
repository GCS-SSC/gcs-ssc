/* eslint-disable jsdoc/require-jsdoc -- Agency Recommendation Set route implementations. */
import type { H3Event } from 'h3'
import { getRouterParam } from 'h3'
import { PaginationSchema, TransferPaymentStreamRecommendationSetupCreateSchema, TransferPaymentStreamRecommendationSetupPatchSchema, TransferPaymentStreamRecommendationSetupMemberCreateSchema, TransferPaymentStreamRecommendationSetupMemberPatchSchema, TransferPaymentStreamRecommendationSetupSchemaCreateSchema } from '~~/shared/types/schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { authorize, requireAuthContext } from './authorize'
import { withActiveAgencyMutationTransaction, withActiveAgencyReadTransaction } from './agency-auth'
import { readValidatedBodyI18n, getValidatedQueryI18n } from './api-validate'
import { badRequest, notFound, throwApiError } from './api-errors'
import { escapeLikePattern } from './sql-like'
import { isUniqueConstraintError } from './postgres-errors'
import { buildRecommendationPlanPublication, lockRecommendationSetupForMutation, readRecommendationSchemaPublicationMetadata, readRecommendationSetupPublicationMetadata, resolvePublicationActorId } from './recommendation-setup-versioning'
import { patchAgencyRecommendationSetup, validateRecommendationDependencies } from './transfer-payment-recommendation-setup-routes'
import { publishDefinition, retirePublication } from './system-publication'
import { isExpectedPublicationFailure } from './publication-errors'

const routeIds = async (event: H3Event, includeSet = false, includeItem = false) => {
  const agencyId = getRouterParam(event, 'id') ?? ''
  const setId = getRouterParam(event, 'recommendationSetId') ?? ''
  const itemId = getRouterParam(event, 'itemId') ?? ''
  if (!isPositivePostgresBigintText(agencyId)) await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  if (includeSet && !isPositivePostgresBigintText(setId)) await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')
  if (includeItem && !isPositivePostgresBigintText(itemId)) await notFound(event, 'RECOMMENDATION_SETUP_MEMBER_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
  return { agencyId, setId, itemId }
}

const authorizeAgency = async (event: H3Event, agencyId: string, action: 'read' | 'update' | 'delete') => {
  await authorize(event, 'agency', action, { type: 'agency', agencyId })
}

const lockSet = async (event: H3Event, db: H3Event['context']['$db'], agencyId: string, setId: string) => {
  const setup = await lockRecommendationSetupForMutation(db, setId, agencyId)
  if (!setup) return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')
  return setup
}

const ensureMutable = async (event: H3Event, state: string) => {
  if (state === 'retired') await throwApiError(event, { statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status' })
}

const duplicateError = async (event: H3Event, error: unknown): Promise<never> => {
  const constraint = error && typeof error === 'object' && 'constraint' in error ? String(error.constraint) : ''
  if (isUniqueConstraintError(error) && constraint === 'cn_idx_recommendationsetupsetorder') {
    return await badRequest(event, 'DUPLICATE_RECOMMENDATION_SETUP_ORDER', 'apiErrors.transfer_payment.duplicate_recommendation_setup_order')
  }
  if (isUniqueConstraintError(error) && constraint === 'cn_idx_recommendationsetupschema') {
    return await badRequest(event, 'DUPLICATE_RECOMMENDATION_SETUP_SCHEMA', 'apiErrors.transfer_payment.duplicate_recommendation_setup_schema')
  }
  throw error
}

export const listAgencyRecommendationSets = async (event: H3Event) => {
  const { agencyId } = await routeIds(event)
  await authorizeAgency(event, agencyId, 'read')
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    let query = trx.selectFrom('Common_Recommendation_Set_Setup')
      .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Recommendation_Set_Setup.id')
      .where('Common_Recommendation_Set_Setup.egcs_cn_agency', '=', agencyId)
      .where('Common_Recommendation_Set_Setup._deleted', '=', false)
      .where('Common_Publication._deleted', '=', false)
    if (search) {
      const value = escapeLikePattern(search)
      query = query.where(eb => eb.or([
        eb('Common_Recommendation_Set_Setup.egcs_cn_name_en', 'ilike', `%${value}%`),
        eb('Common_Recommendation_Set_Setup.egcs_cn_name_fr', 'ilike', `%${value}%`),
        eb('Common_Recommendation_Set_Setup.egcs_cn_description_en', 'ilike', `%${value}%`),
        eb('Common_Recommendation_Set_Setup.egcs_cn_description_fr', 'ilike', `%${value}%`)
      ]))
    }
    const [setups, count] = await Promise.all([
      query.selectAll('Common_Recommendation_Set_Setup').orderBy('Common_Recommendation_Set_Setup.id', 'asc').limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => [eb.fn.count('Common_Recommendation_Set_Setup.id').as('total'),
        eb.fn.count('Common_Recommendation_Set_Setup.id').filterWhere('Common_Publication.egcs_cn_state', '=', 'published').as('published')]).executeTakeFirst()
    ])
    const setIds = setups.map(setup => String(setup.id))
    const members = setIds.length === 0
      ? []
      : await trx.selectFrom('Common_Recommendation_Setup')
          .innerJoin('Common_Recommendation_Schema', 'Common_Recommendation_Schema.id', 'Common_Recommendation_Setup.egcs_cn_recommendationschema')
          .select(['Common_Recommendation_Setup.id', 'Common_Recommendation_Setup.egcs_cn_recommendationset', 'Common_Recommendation_Setup.egcs_cn_recommendationschema', 'Common_Recommendation_Setup.egcs_cn_order', 'Common_Recommendation_Setup.egcs_cn_approvaltemplate', 'Common_Recommendation_Setup.egcs_cn_failonnotrecommended', 'Common_Recommendation_Schema.egcs_cn_name_en', 'Common_Recommendation_Schema.egcs_cn_name_fr'])
          .where('Common_Recommendation_Setup.egcs_cn_recommendationset', 'in', setIds)
          .where('Common_Recommendation_Setup._deleted', '=', false)
          .where('Common_Recommendation_Schema._deleted', '=', false)
          .orderBy('Common_Recommendation_Setup.egcs_cn_order', 'asc').execute()
    const total = Number(count?.total ?? 0)
    return { items: await Promise.all(setups.map(async setup => ({ ...setup, id: String(setup.id),
      egcs_cn_agency: String(setup.egcs_cn_agency),
      egcs_cn_approvaltemplate: setup.egcs_cn_approvaltemplate ? String(setup.egcs_cn_approvaltemplate) : undefined,
      ...await readRecommendationSetupPublicationMetadata(trx, setup),
      members: await Promise.all(members.filter(member => String(member.egcs_cn_recommendationset) === String(setup.id)).map(async member => ({ ...member, id: String(member.id),
        egcs_cn_recommendationset: String(member.egcs_cn_recommendationset),
        egcs_cn_recommendationschema: String(member.egcs_cn_recommendationschema),
        egcs_cn_approvaltemplate: member.egcs_cn_approvaltemplate ? String(member.egcs_cn_approvaltemplate) : undefined,
        ...await readRecommendationSchemaPublicationMetadata(trx, String(member.egcs_cn_recommendationschema)) }))) }))),
    total, stats: { total, published: Number(count?.published ?? 0) }, page, limit }
  })
}

export const createAgencyRecommendationSet = async (event: H3Event) => {
  const { agencyId } = await routeIds(event)
  await authorizeAgency(event, agencyId, 'update')
  const body = await readValidatedBodyI18n(event, TransferPaymentStreamRecommendationSetupCreateSchema)
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    await validateRecommendationDependencies(event, trx, agencyId,
      body.members.map(member => String(member.egcs_cn_recommendationschema)),
      [body.egcs_cn_approvaltemplate, ...body.members.map(member => member.egcs_cn_approvaltemplate)])
    const created = await trx.insertInto('Common_Recommendation_Set_Setup').values({
      egcs_cn_agency: agencyId, egcs_cn_name_en: body.egcs_cn_name_en, egcs_cn_name_fr: body.egcs_cn_name_fr,
      egcs_cn_description_en: body.egcs_cn_description_en, egcs_cn_description_fr: body.egcs_cn_description_fr,
      egcs_cn_approvaltemplate: body.egcs_cn_approvaltemplate, _deleted: false
    }).returningAll().executeTakeFirstOrThrow()
    const members = body.members.length === 0
      ? []
      : await trx.insertInto('Common_Recommendation_Setup').values(body.members.map(member => ({
          egcs_cn_order: member.egcs_cn_order, egcs_cn_recommendationset: String(created.id),
          egcs_cn_approvaltemplate: member.egcs_cn_approvaltemplate, egcs_cn_recommendationschema: member.egcs_cn_recommendationschema,
          egcs_cn_failonnotrecommended: member.egcs_cn_failonnotrecommended, _deleted: false
        }))).returningAll().execute()
    return { ...created, id: String(created.id), publicationId: String(created.id), publicationState: 'draft' as const,
      publicationVersionId: null, publicationVersion: null, hasUnpublishedChanges: true,
      members: members.map(member => ({ ...member, id: String(member.id), egcs_cn_recommendationset: String(member.egcs_cn_recommendationset), egcs_cn_recommendationschema: String(member.egcs_cn_recommendationschema) })) }
  })
}

export const getAgencyRecommendationSet = async (event: H3Event) => {
  const { agencyId, setId } = await routeIds(event, true)
  await authorizeAgency(event, agencyId, 'read')
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const setup = await trx.selectFrom('Common_Recommendation_Set_Setup').selectAll()
      .where('id', '=', setId).where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
    if (!setup) return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')
    const members = await trx.selectFrom('Common_Recommendation_Setup')
      .innerJoin('Common_Recommendation_Schema', 'Common_Recommendation_Schema.id', 'Common_Recommendation_Setup.egcs_cn_recommendationschema')
      .select(['Common_Recommendation_Setup.id', 'Common_Recommendation_Setup.egcs_cn_recommendationschema', 'Common_Recommendation_Setup.egcs_cn_order', 'Common_Recommendation_Setup.egcs_cn_approvaltemplate', 'Common_Recommendation_Setup.egcs_cn_failonnotrecommended', 'Common_Recommendation_Schema.egcs_cn_name_en', 'Common_Recommendation_Schema.egcs_cn_name_fr'])
      .where('Common_Recommendation_Setup.egcs_cn_recommendationset', '=', setId)
      .where('Common_Recommendation_Setup._deleted', '=', false).where('Common_Recommendation_Schema._deleted', '=', false)
      .orderBy('Common_Recommendation_Setup.egcs_cn_order', 'asc').execute()
    return { ...setup, id: String(setup.id), egcs_cn_agency: String(setup.egcs_cn_agency),
      egcs_cn_approvaltemplate: setup.egcs_cn_approvaltemplate ? String(setup.egcs_cn_approvaltemplate) : undefined,
      ...await readRecommendationSetupPublicationMetadata(trx, setup),
      members: await Promise.all(members.map(async member => ({ ...member, id: String(member.id),
        egcs_cn_recommendationschema: String(member.egcs_cn_recommendationschema),
        ...(member.egcs_cn_approvaltemplate ? { egcs_cn_approvaltemplate: String(member.egcs_cn_approvaltemplate) } : {}),
        ...await readRecommendationSchemaPublicationMetadata(trx, String(member.egcs_cn_recommendationschema)) }))) }
  })
}

export const patchAgencyRecommendationSet = async (event: H3Event) => {
  const { agencyId, setId } = await routeIds(event, true)
  await authorizeAgency(event, agencyId, 'update')
  const body = await readValidatedBodyI18n(event, TransferPaymentStreamRecommendationSetupPatchSchema)
  if ('_deleted' in body && body._deleted !== undefined) {
    return await badRequest(event, 'INVALID_UPDATE', 'apiErrors.request.invalid_resource')
  }
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx =>
    await patchAgencyRecommendationSetup(event, trx, { agencyId, recommendationSetupId: setId, body }))
}

export const deleteAgencyRecommendationSet = async (event: H3Event) => {
  const { agencyId, setId } = await routeIds(event, true)
  await authorizeAgency(event, agencyId, 'update')
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const setup = await lockSet(event, trx, agencyId, setId)
    if (setup.publicationState !== 'draft') return await badRequest(event, 'RECOMMENDATION_SETUP_NOT_DRAFT', 'apiErrors.request.invalid_status')
    await trx.updateTable('Common_Recommendation_Setup').set({ _deleted: true }).where('egcs_cn_recommendationset', '=', setId).where('_deleted', '=', false).execute()
    await trx.updateTable('Common_Recommendation_Set_Setup').set({ _deleted: true }).where('id', '=', setId).where('egcs_cn_agency', '=', agencyId).execute()
    await trx.updateTable('Common_Publication').set({ _deleted: true }).where('id', '=', setId).where('egcs_cn_state', '=', 'draft').execute()
    return { success: true }
  })
}

export const publishAgencyRecommendationSet = async (event: H3Event) => {
  const { agencyId, setId } = await routeIds(event, true)
  const auth = await requireAuthContext(event)
  await authorizeAgency(event, agencyId, 'update')
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const setup = await lockSet(event, trx, agencyId, setId)
    const actorId = await resolvePublicationActorId(trx, auth.userId)
    if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const members = await trx.selectFrom('Common_Recommendation_Setup')
      .select(['egcs_cn_recommendationschema', 'egcs_cn_approvaltemplate'])
      .where('egcs_cn_recommendationset', '=', setId)
      .where('_deleted', '=', false)
      .orderBy('egcs_cn_order', 'asc')
      .forUpdate()
      .execute()
    await validateRecommendationDependencies(event, trx, agencyId,
      members.map(member => String(member.egcs_cn_recommendationschema)),
      [setup.egcs_cn_approvaltemplate, ...members.map(member => member.egcs_cn_approvaltemplate)])
    let plan
    try {
      plan = await buildRecommendationPlanPublication(trx, setup)
    } catch (error) {
      if (!isExpectedPublicationFailure(error)) throw error
      return await badRequest(event, 'RECOMMENDATION_SETUP_INVALID_PUBLICATION', 'apiErrors.request.invalid_resource')
    }
    const publication = await publishDefinition(trx, { publicationId: setId, kind: 'recommendation_set_setup',
      definition: plan.definition, actorId, references: plan.references })
    const { definition: _definition, hash: _hash, ...metadata } = publication
    return { ...setup, id: String(setup.id), egcs_cn_agency: String(setup.egcs_cn_agency), ...metadata }
  })
}

export const retireAgencyRecommendationSet = async (event: H3Event) => {
  const { agencyId, setId } = await routeIds(event, true)
  const auth = await requireAuthContext(event)
  await authorizeAgency(event, agencyId, 'update')
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    await lockSet(event, trx, agencyId, setId)
    const actorId = await resolvePublicationActorId(trx, auth.userId)
    if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    return await retirePublication(trx, { publicationId: setId, kind: 'recommendation_set_setup', actorId })
  })
}

export const createAgencyRecommendationMember = async (event: H3Event) => {
  const { agencyId, setId } = await routeIds(event, true)
  await authorizeAgency(event, agencyId, 'update')
  const body = await readValidatedBodyI18n(event, TransferPaymentStreamRecommendationSetupMemberCreateSchema)
  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      const setup = await lockSet(event, trx, agencyId, setId)
      await ensureMutable(event, setup.publicationState)
      await validateRecommendationDependencies(event, trx, agencyId, [String(body.egcs_cn_recommendationschema)], [body.egcs_cn_approvaltemplate])
      const member = await trx.insertInto('Common_Recommendation_Setup').values({ ...body, egcs_cn_recommendationset: setId, _deleted: false }).returningAll().executeTakeFirstOrThrow()
      return { ...member, id: String(member.id), egcs_cn_recommendationset: String(member.egcs_cn_recommendationset), egcs_cn_recommendationschema: String(member.egcs_cn_recommendationschema) }
    })
  } catch (error) { return await duplicateError(event, error) }
}

export const patchAgencyRecommendationMember = async (event: H3Event) => {
  const { agencyId, setId, itemId } = await routeIds(event, true, true)
  await authorizeAgency(event, agencyId, 'update')
  const body = await readValidatedBodyI18n(event, TransferPaymentStreamRecommendationSetupMemberPatchSchema)
  if (Object.keys(body).length === 0) return await badRequest(event, 'EMPTY_UPDATE', 'apiErrors.request.invalid_resource')
  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      const setup = await lockSet(event, trx, agencyId, setId)
      await ensureMutable(event, setup.publicationState)
      await validateRecommendationDependencies(event, trx, agencyId, body.egcs_cn_recommendationschema ? [String(body.egcs_cn_recommendationschema)] : [], [body.egcs_cn_approvaltemplate])
      const member = await trx.updateTable('Common_Recommendation_Setup').set(body).where('id', '=', itemId)
        .where('egcs_cn_recommendationset', '=', setId).where('_deleted', '=', false).returningAll().executeTakeFirst()
      if (!member) return await notFound(event, 'RECOMMENDATION_SETUP_MEMBER_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
      return { ...member, id: String(member.id), egcs_cn_recommendationset: String(member.egcs_cn_recommendationset), egcs_cn_recommendationschema: String(member.egcs_cn_recommendationschema) }
    })
  } catch (error) { return await duplicateError(event, error) }
}

export const deleteAgencyRecommendationMember = async (event: H3Event) => {
  const { agencyId, setId, itemId } = await routeIds(event, true, true)
  await authorizeAgency(event, agencyId, 'update')
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const setup = await lockSet(event, trx, agencyId, setId)
    await ensureMutable(event, setup.publicationState)
    const deleted = await trx.updateTable('Common_Recommendation_Setup').set({ _deleted: true }).where('id', '=', itemId)
      .where('egcs_cn_recommendationset', '=', setId).where('_deleted', '=', false).returning('id').executeTakeFirst()
    if (!deleted) return await notFound(event, 'RECOMMENDATION_SETUP_MEMBER_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_schema_not_found')
    const remaining = await trx.selectFrom('Common_Recommendation_Setup').select('id')
      .where('egcs_cn_recommendationset', '=', setId).where('_deleted', '=', false).orderBy('egcs_cn_order', 'asc').forUpdate().execute()
    for (const [index, member] of remaining.entries()) await trx.updateTable('Common_Recommendation_Setup').set({ egcs_cn_order: index + 1 }).where('id', '=', String(member.id)).execute()
    return { success: true }
  })
}

const EMPTY_RECOMMENDATION_DEFINITION = {
  sections: [{
    key: 'recommendation', label: { en: 'Recommendation', fr: 'Recommandation' }, subSections: [{
      key: 'decision', label: { en: 'Decision', fr: 'Décision' }, questions: [{
        key: 'result', type: 'radio' as const,
        question: { en: 'What is your recommendation?', fr: 'Quelle est votre recommandation?' },
        required: true, isResult: true, options: [
          { key: 'recommended', label: { en: 'Recommended', fr: 'Recommandé' }, outcome: 'recommended' as const },
          { key: 'not-recommended', label: { en: 'Not recommended', fr: 'Non recommandé' }, outcome: 'not_recommended' as const }
        ]
      }]
    }]
  }]
}

export const createAgencyRecommendationMemberSchema = async (event: H3Event) => {
  const { agencyId, setId } = await routeIds(event, true)
  await authorizeAgency(event, agencyId, 'update')
  const body = await readValidatedBodyI18n(event, TransferPaymentStreamRecommendationSetupSchemaCreateSchema)
  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      const setup = await lockSet(event, trx, agencyId, setId)
      await ensureMutable(event, setup.publicationState)
      await validateRecommendationDependencies(event, trx, agencyId, [], [body.egcs_cn_approvaltemplate])
      const duplicate = await trx.selectFrom('Common_Recommendation_Setup').select('id').where('egcs_cn_recommendationset', '=', setId)
        .where('egcs_cn_order', '=', body.egcs_cn_order).where('_deleted', '=', false).executeTakeFirst()
      if (duplicate) return await badRequest(event, 'DUPLICATE_RECOMMENDATION_SETUP_ORDER', 'apiErrors.transfer_payment.duplicate_recommendation_setup_order')
      const suffix = `${setId}-${body.egcs_cn_order}`
      const schema = await trx.insertInto('Common_Recommendation_Schema').values({ egcs_cn_agency: agencyId,
        egcs_cn_name_en: `Untitled recommendation ${suffix}`, egcs_cn_name_fr: `Recommandation sans titre ${suffix}`,
        egcs_cn_result: {}, egcs_cn_recommendationschema: EMPTY_RECOMMENDATION_DEFINITION, _deleted: false }).returning('id').executeTakeFirstOrThrow()
      await trx.insertInto('Common_Recommendation_Setup').values({ egcs_cn_order: body.egcs_cn_order, egcs_cn_recommendationset: setId,
        egcs_cn_approvaltemplate: body.egcs_cn_approvaltemplate, egcs_cn_recommendationschema: String(schema.id),
        egcs_cn_failonnotrecommended: body.egcs_cn_failonnotrecommended, _deleted: false }).execute()
      return { schemaId: String(schema.id), publicationId: String(schema.id), publicationState: 'draft' as const,
        publicationVersionId: null, publicationVersion: null, hasUnpublishedChanges: true }
    })
  } catch (error) { return await duplicateError(event, error) }
}
