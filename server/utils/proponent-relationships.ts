/* eslint-disable jsdoc/require-jsdoc -- Route helpers express the Proponent relationship boundary. */
import { getRouterParam, type H3Event } from 'h3'
import { z } from 'zod'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { ProponentRelationshipCreateSchema, ProponentRelationshipPatchSchema } from '~~/shared/types/schemas/proponent-relationship'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { badRequest, forbidden, notFound, throwApiError } from './api-errors'
import { getValidatedQueryI18n, readValidatedBodyI18n } from './api-validate'
import { canAccessApplicantRecipient, executeFreshAuthorizedApplicantRecipientWrite, resolveApplicantRecipientVisibility } from './applicant-recipient-auth'
import { authorize, requireAuthContext } from './authorize'
import { getDatabaseConstraintName } from './database-constraint-errors'
import { executeFreshReadSnapshot } from './fresh-read-snapshot'
import { escapeLikePattern } from './sql-like'

const lookupQuery = PaginationSchema.extend({
  agency_id: PositivePostgresBigintIdSchema,
  selected_ids: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema).max(100)]).optional()
})

const invalidRelationship = async (event: H3Event) => await badRequest(
  event, 'INVALID_PROPONENT_RELATIONSHIP', 'apiErrors.applicant_recipient.invalid_relationship'
)

const relationshipNotFound = async (event: H3Event) => await notFound(
  event, 'PROPONENT_RELATIONSHIP_NOT_FOUND', 'apiErrors.request.not_found'
)

const authorizeParent = async (event: H3Event, id: string, action: 'read' | 'create' | 'update') => {
  if (!isPositivePostgresBigintText(id)) return await relationshipNotFound(event)
  await authorize(event, 'applicant_recipient', action, async ({ context }) =>
    await canAccessApplicantRecipient(context, id, action, event.context.$db)
      ? { bypass: true }
      : { denied: true }
  )
  return await requireAuthContext(event)
}

const relationshipConflict = async (event: H3Event, error: unknown) => {
  if (getDatabaseConstraintName(error) === 'ar_uq_relationship_roles') {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'DUPLICATE_PROPONENT_RELATIONSHIP',
      key: 'apiErrors.applicant_recipient.duplicate_relationship'
    })
  }
  throw error
}

export const listProponentRelationships = async (event: H3Event) => {
  const id = getRouterParam(event, 'id') ?? ''
  return await executeFreshReadSnapshot(event, async db => {
    const auth = await authorizeParent(event, id, 'read')
    const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
    const visibility = await resolveApplicantRecipientVisibility(auth, 'read', db)
    const relationshipRows = db.selectFrom('Applicant_Recipient_Relationship as link')
      .innerJoin('Agency_Profile as agency', 'agency.id', 'link.egcs_ar_agency')
      .innerJoin('Agency_Proponent_Relationship_Type as type', 'type.id', 'link.egcs_ar_relationshiptype')
      .innerJoin('Applicant_Recipient_Profile as counterpart', join => join.on(eb => eb.or([
        eb.and([eb('link.egcs_ar_proponent', '=', id), eb('link.egcs_ar_relatedproponent', '=', eb.ref('counterpart.id'))]),
        eb.and([eb('link.egcs_ar_relatedproponent', '=', id), eb('link.egcs_ar_proponent', '=', eb.ref('counterpart.id'))])
      ])))
      .where('link._deleted', '=', false)
      .where('type._deleted', '=', false)
      .where('counterpart._deleted', '=', false)
      .select([
        'link.id', 'link.egcs_ar_agency', 'link.egcs_ar_relationshiptype',
        'counterpart.id as egcs_ar_relatedproponent',
        'counterpart.egcs_ar_legalname_en as related_proponent_legalname_en',
        'counterpart.egcs_ar_legalname_fr as related_proponent_legalname_fr',
        'agency.egcs_ay_name_en as agency_name_en', 'agency.egcs_ay_name_fr as agency_name_fr'
      ])
      .select(eb => {
        const reversed = eb.and([eb('link.egcs_ar_relatedproponent', '=', id), eb('type.egcs_ay_inversecode', 'is not', null)])
        return [
          reversed.as('egcs_ar_reversed'),
          eb.case().when(reversed).then(eb.fn.coalesce('type.egcs_ay_inversename_en', 'type.egcs_ay_name_en'))
            .else(eb.ref('type.egcs_ay_name_en')).end().as('relationship_name_en'),
          eb.case().when(reversed).then(eb.fn.coalesce('type.egcs_ay_inversename_fr', 'type.egcs_ay_name_fr'))
            .else(eb.ref('type.egcs_ay_name_fr')).end().as('relationship_name_fr'),
          eb.case().when(reversed).then(eb.fn.coalesce('type.egcs_ay_inversecode', 'type.egcs_ay_code'))
            .else(eb.ref('type.egcs_ay_code')).end().as('relationship_code')
        ]
      })
    let query = db.selectFrom(relationshipRows.as('relationship'))
    if (!visibility.hasGlobalAccess) query = query.where('egcs_ar_agency', 'in', visibility.agencyIds)
    if (search) {
      const term = `%${escapeLikePattern(search)}%`
      query = query.where(eb => eb.or([
        eb('related_proponent_legalname_en', 'ilike', term), eb('related_proponent_legalname_fr', 'ilike', term),
        eb('relationship_name_en', 'ilike', term), eb('relationship_name_fr', 'ilike', term),
        eb('agency_name_en', 'ilike', term), eb('agency_name_fr', 'ilike', term)
      ]))
    }
    const [rows, count] = await Promise.all([
      query.selectAll().orderBy('id').limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => eb.fn.countAll().as('total')).executeTakeFirst()
    ])
    const total = Number(count?.total ?? 0)
    const items = rows.map(row => ({
      ...row,
      can_update_role: auth.userAbilities.authorize('applicant_recipient', 'update', { type: 'agency', agencyId: row.egcs_ar_agency })
    }))
    return { items, total, stats: { total, active: total }, page, limit }
  })
}

export const lookupRelatedProponents = async (event: H3Event) => {
  const id = getRouterParam(event, 'id') ?? ''
  return await executeFreshReadSnapshot(event, async db => {
    const auth = await authorizeParent(event, id, 'create')
    const { page, limit, search, agency_id, selected_ids } = await getValidatedQueryI18n(event, lookupQuery)
    if (!auth.userAbilities.authorize('applicant_recipient', 'create', { type: 'agency', agencyId: agency_id })) {
      return await forbidden(event)
    }
    const agency = await db.selectFrom('Agency_Profile').select('id').where('id', '=', agency_id)
      .where('_deleted', '=', false).where('egcs_ay_active', '=', true).executeTakeFirst()
    if (!agency) return await invalidRelationship(event)
    let query = db.selectFrom('Applicant_Recipient_Profile').where('_deleted', '=', false)
      .where('egcs_ar_active', '=', true).where('id', '!=', id)
    if (selected_ids) query = query.where('id', 'in', Array.isArray(selected_ids) ? selected_ids : [selected_ids])
    if (search) {
      const term = `%${escapeLikePattern(search)}%`
      query = query.where(eb => eb.or([
        eb('egcs_ar_legalname_en', 'ilike', term), eb('egcs_ar_legalname_fr', 'ilike', term)
      ]))
    }
    const [items, count] = await Promise.all([
      query.select([
        'id', 'egcs_ar_legalname_en as label_en', 'egcs_ar_legalname_fr as label_fr'
      ]).orderBy('id').limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
    ])
    const total = Number(count?.total ?? 0)
    return { items, total, stats: { total, active: total }, page, limit }
  })
}

const requireRelationshipType = async (event: H3Event, db: Transaction<Database>, agencyId: string, typeId: string) => {
  const type = await db.selectFrom('Agency_Proponent_Relationship_Type').select('egcs_ay_inversecode')
    .where('id', '=', typeId).where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false)
    .forShare().executeTakeFirst()
  if (!type) return await invalidRelationship(event)
  return type
}

const getRelationshipEndpoints = (id: string, counterpartId: string, reversed: boolean) => ({
  egcs_ar_proponent: reversed ? counterpartId : id,
  egcs_ar_relatedproponent: reversed ? id : counterpartId
})

export const createProponentRelationship = async (event: H3Event) => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeParent(event, id, 'create')
  const {
    egcs_ar_agency: agencyId, egcs_ar_relatedproponent: otherProponentId,
    egcs_ar_relationshiptype: typeId, egcs_ar_reversed: reversed = false
  } = await readValidatedBodyI18n(event, ProponentRelationshipCreateSchema)
  if (id === otherProponentId) return await invalidRelationship(event)
  try {
    return await executeFreshAuthorizedApplicantRecipientWrite(event, event.context.$db, id, 'create', async (trx, auth) => {
      if (!auth.userAbilities.authorize('applicant_recipient', 'create', { type: 'agency', agencyId })) return await forbidden(event)
      const [agency, otherProponent] = await Promise.all([
        trx.selectFrom('Agency_Profile').select('id').where('id', '=', agencyId)
          .where('_deleted', '=', false).where('egcs_ay_active', '=', true).executeTakeFirst(),
        trx.selectFrom('Applicant_Recipient_Profile').select('id').where('id', '=', otherProponentId)
          .where('_deleted', '=', false).where('egcs_ar_active', '=', true).executeTakeFirst()
      ])
      if (!agency || !otherProponent || !await canAccessApplicantRecipient(auth, otherProponentId, 'read', trx)) {
        return await invalidRelationship(event)
      }
      const type = await requireRelationshipType(event, trx, agencyId, typeId)
      if (reversed && !type.egcs_ay_inversecode) return await invalidRelationship(event)
      return await trx.insertInto('Applicant_Recipient_Relationship').values({
        egcs_ar_agency: agencyId, egcs_ar_relationshiptype: typeId,
        ...getRelationshipEndpoints(id, otherProponentId, reversed)
      }).returning('id').executeTakeFirstOrThrow()
    }, { agencyId, otherProponentId })
  } catch (error) {
    return await relationshipConflict(event, error)
  }
}

const findRelationship = (db: Kysely<Database>, id: string, linkId: string) =>
  db.selectFrom('Applicant_Recipient_Relationship').selectAll()
    .where('id', '=', linkId).where('_deleted', '=', false)
    .where(eb => eb.or([eb('egcs_ar_proponent', '=', id), eb('egcs_ar_relatedproponent', '=', id)]))

export const mutateProponentRelationship = async (event: H3Event, action: 'update' | 'remove') => {
  const id = getRouterParam(event, 'id') ?? ''
  const initialAuth = await authorizeParent(event, id, 'update')
  const linkId = getRouterParam(event, 'childId') ?? ''
  if (!isPositivePostgresBigintText(linkId)) return await relationshipNotFound(event)
  const patch = action === 'update' ? await readValidatedBodyI18n(event, ProponentRelationshipPatchSchema) : null
  const db = event.context.$db
  const initialLink = await findRelationship(db, id, linkId).executeTakeFirst()
  if (!initialLink || !initialAuth.userAbilities.authorize('applicant_recipient', 'update', {
    type: 'agency', agencyId: initialLink.egcs_ar_agency
  })) return await relationshipNotFound(event)
  // The agency and unordered pair are immutable. Reload under lock to read the latest orientation.
  const otherProponentId = initialLink.egcs_ar_proponent === id ? initialLink.egcs_ar_relatedproponent : initialLink.egcs_ar_proponent
  try {
    return await executeFreshAuthorizedApplicantRecipientWrite(event, db, id, 'update', async (trx, auth) => {
      const link = await findRelationship(trx, id, linkId).forUpdate().executeTakeFirst()
      if (!link || !auth.userAbilities.authorize('applicant_recipient', 'update', {
        type: 'agency', agencyId: link.egcs_ar_agency
      })) return await relationshipNotFound(event)
      const query = trx.updateTable('Applicant_Recipient_Relationship').where('id', '=', linkId)
      if (!patch) {
        await query.set({ _deleted: true }).execute()
        return { success: true }
      }
      const typeId = patch.egcs_ar_relationshiptype ?? link.egcs_ar_relationshiptype
      const type = await requireRelationshipType(event, trx, link.egcs_ar_agency, typeId)
      if (patch.egcs_ar_reversed && !type.egcs_ay_inversecode) return await invalidRelationship(event)
      if (type.egcs_ay_inversecode && patch.egcs_ar_reversed === undefined && typeId !== link.egcs_ar_relationshiptype) {
        const previous = await requireRelationshipType(event, trx, link.egcs_ar_agency, link.egcs_ar_relationshiptype)
        if (!previous.egcs_ay_inversecode) {
          return await badRequest(event, 'PROPONENT_RELATIONSHIP_ROLE_REQUIRED', 'apiErrors.applicant_recipient.relationship_role_required')
        }
      }
      const reversed = Boolean(type.egcs_ay_inversecode) && (patch.egcs_ar_reversed ?? link.egcs_ar_relatedproponent === id)
      await query.set({
        egcs_ar_relationshiptype: typeId,
        ...getRelationshipEndpoints(id, otherProponentId, reversed)
      }).execute()
      return { success: true }
    }, { agencyId: initialLink.egcs_ar_agency, otherProponentId })
  } catch (error) {
    return await relationshipConflict(event, error)
  }
}
