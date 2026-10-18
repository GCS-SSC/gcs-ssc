/* eslint-disable jsdoc/require-jsdoc -- Stream picker projections are covered by focused route tests. */
import type { H3Event } from 'h3'
import { z } from 'zod'
import { sql } from 'kysely'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { EntityTypeIdentitySchema } from '~~/shared/types/schemas/common'
import { authorizeTransferPaymentStreamResource } from './transfer-payment-route-authorization'
import { executeFreshReadSnapshot } from './fresh-read-snapshot'
import { getValidatedQueryI18n } from './api-validate'
import { badRequest, notFound } from './api-errors'
import { escapeLikePattern } from './sql-like'

const QuerySchema = PaginationSchema.extend({ entityType: EntityTypeIdentitySchema.optional(), ids: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema).min(1).max(100)]).optional() }).strict()

export const streamDefinitionLookup = async (event: H3Event, kind: 'custom-fields' | 'workflows' | 'review-sets') => {
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  return await executeFreshReadSnapshot(event, async db => {
    const access = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
    if (!access) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
    const { page, limit, search, entityType, ids } = await getValidatedQueryI18n(event, QuerySchema)
    const selectedIds = ids === undefined ? [] : Array.isArray(ids) ? ids : [ids]
    const pattern = search ? `%${escapeLikePattern(search)}%` : undefined
    if (kind === 'custom-fields') {
      let query = db.selectFrom('Agency_Custom_Field')
        .where('egcs_ay_agency', '=', access.agencyId).where('_deleted', '=', false)
      if (selectedIds.length) query = query.where('id', 'in', selectedIds)
      if (pattern) query = query.where(eb => eb.or([
        eb('egcs_ay_name_en', 'ilike', pattern), eb('egcs_ay_name_fr', 'ilike', pattern)
      ]))
      const [items, count] = await Promise.all([
        query.select(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr']).orderBy('id').limit(limit).offset((page - 1) * limit).execute(),
        query.select(eb => eb.fn.count('id').as('total')).executeTakeFirstOrThrow()
      ])
      return { items, total: Number(count.total), page, limit }
    }
    if (kind === 'workflows') {
      let query = db.selectFrom('Common_Workflow_Setup as setup')
        .innerJoin('Common_Publication as publication', 'publication.id', 'setup.id')
        .innerJoin('Common_Publication_Version as version', 'version.id', 'publication.egcs_cn_currentversion')
        .where('setup.egcs_cn_agency', '=', access.agencyId).where('setup._deleted', '=', false)
        .where('publication._deleted', '=', false).where('publication.egcs_cn_state', '=', 'published')
      if (selectedIds.length) query = query.where('setup.id', 'in', selectedIds)
      if (entityType) query = query.where(sql<string>`${sql.ref('version.egcs_cn_definition')} ->> 'entityType'`, '=', entityType)
      if (pattern) query = query.where(eb => eb.or([
        eb(sql<string>`${sql.ref('version.egcs_cn_definition')} ->> 'nameEn'`, 'ilike', pattern), eb(sql<string>`${sql.ref('version.egcs_cn_definition')} ->> 'nameFr'`, 'ilike', pattern)
      ]))
      const [items, count] = await Promise.all([
        query.select(['setup.id', sql<string>`${sql.ref('version.egcs_cn_definition')} ->> 'nameEn'`.as('egcs_cn_name_en'), sql<string>`${sql.ref('version.egcs_cn_definition')} ->> 'nameFr'`.as('egcs_cn_name_fr')]).orderBy('setup.id').limit(limit).offset((page - 1) * limit).execute(),
        query.select(eb => eb.fn.count('setup.id').as('total')).executeTakeFirstOrThrow()
      ])
      return { items, total: Number(count.total), page, limit }
    }
    let query = db.selectFrom('Common_Review_Set_Setup as setup')
      .innerJoin('Common_Publication as publication', 'publication.id', 'setup.id')
      .innerJoin('Common_Publication_Version as version', 'version.id', 'publication.egcs_cn_currentversion')
      .where('setup.egcs_cn_agency', '=', access.agencyId).where('setup._deleted', '=', false)
      .where('publication._deleted', '=', false).where('publication.egcs_cn_state', '=', 'published')
    if (selectedIds.length) query = query.where('setup.id', 'in', selectedIds)
    if (entityType) query = query.where(sql<string>`${sql.ref('version.egcs_cn_definition')} ->> 'entityType'`, '=', entityType)
    if (pattern) query = query.where(eb => eb.or([
      eb(sql<string>`${sql.ref('version.egcs_cn_definition')} -> 'name' ->> 'en'`, 'ilike', pattern), eb(sql<string>`${sql.ref('version.egcs_cn_definition')} -> 'name' ->> 'fr'`, 'ilike', pattern)
    ]))
    const [items, count] = await Promise.all([
      query.select(['setup.id', sql<string>`${sql.ref('version.egcs_cn_definition')} -> 'name' ->> 'en'`.as('egcs_cn_name_en'), sql<string>`${sql.ref('version.egcs_cn_definition')} -> 'name' ->> 'fr'`.as('egcs_cn_name_fr')]).orderBy('setup.id').limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => eb.fn.count('setup.id').as('total')).executeTakeFirstOrThrow()
    ])
    return { items, total: Number(count.total), page, limit }
  })
}
