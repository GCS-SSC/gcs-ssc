/* eslint-disable jsdoc/require-jsdoc -- Stream Clause route actions share the same scope and projections. */
import { getRouterParam, type H3Event } from 'h3'
import { sql } from 'kysely'
import { z } from 'zod'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { PublishedAgencyClauseSchema } from '~~/shared/types/schemas/agency-clause'
import { StreamClauseLinkSchema } from '~~/shared/types/schemas/stream-clause'
import { badRequest, notFound, throwApiError } from './api-errors'
import { getValidatedQueryI18n, readValidatedBodyI18n } from './api-validate'
import { getDatabaseConstraintName } from './database-constraint-errors'
import { escapeLikePattern } from './sql-like'
import { authorizeTransferPaymentStreamResource } from './transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamRead, executeFreshAuthorizedTransferPaymentStreamWrite } from './transfer-payment-write-transaction'

const LookupQuerySchema = PaginationSchema.extend({
  ids: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema).min(1).max(100)]).optional()
}).strict()

const publishedNameEn = sql<string>`${sql.ref('version.egcs_cn_definition')} ->> 'nameEn'`
const publishedNameFr = sql<string>`${sql.ref('version.egcs_cn_definition')} ->> 'nameFr'`

type Action = 'read' | 'lookup' | 'create' | 'delete'

export const streamClauseRoute = async (event: H3Event, action: Action) => {
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')

  const db = event.context.$db
  const stream = await authorizeTransferPaymentStreamResource(event, action === 'read' ? 'read' : 'update', profileId, streamId)
  if (!stream) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')

  if (action === 'read') {
    return await executeFreshAuthorizedTransferPaymentStreamRead(event, db, profileId, stream.agencyId, streamId, async (trx, fresh) => {
      const items = await trx.selectFrom('Transfer_Payment_Stream_Clause as link')
        .innerJoin('Agency_Clause as clause', 'clause.id', 'link.egcs_tp_clause')
        .innerJoin('Common_Publication as publication', 'publication.id', 'clause.id')
        .innerJoin('Common_Publication_Version as version', 'version.id', 'publication.egcs_cn_currentversion')
        .select([
          'link.id', 'link.egcs_tp_clause', 'clause.egcs_ay_active', 'publication.egcs_cn_state as publicationState',
          'version.egcs_cn_definition as definition'
        ])
        .where('link.egcs_tp_transferpaymentstream', '=', streamId)
        .where('link._deleted', '=', false)
        .where('clause.egcs_ay_organizationagency', '=', fresh.agencyId)
        .orderBy(publishedNameEn).orderBy('link.id')
        .execute()
      return { items: items.map(({ definition, ...link }) => {
        const published = PublishedAgencyClauseSchema.parse(definition)
        return {
          ...link,
          egcs_ay_name_en: published.nameEn,
          egcs_ay_name_fr: published.nameFr,
          egcs_ay_languageindependentcode: published.code,
          rows: published.rows.map(row => ({
            egcs_ay_clause_en: row.textEn,
            egcs_ay_clause_fr: row.textFr,
            egcs_ay_displayorder: row.displayOrder
          }))
        }
      }) }
    })
  }

  if (action === 'lookup') {
    const { page, limit, search, ids } = await getValidatedQueryI18n(event, LookupQuerySchema)
    const selectedIds = Array.isArray(ids) ? ids : ids ? [ids] : []
    return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, profileId, stream.agencyId, streamId, 'update', async (trx, fresh) => {
      let query = trx.selectFrom('Agency_Clause as clause')
        .innerJoin('Common_Publication as publication', 'publication.id', 'clause.id')
        .innerJoin('Common_Publication_Version as version', 'version.id', 'publication.egcs_cn_currentversion')
        .where('clause.egcs_ay_organizationagency', '=', fresh.agencyId)
        .where('clause.egcs_ay_active', '=', true)
        .where('clause._deleted', '=', false)
        .where('publication.egcs_cn_state', '=', 'published')
        .where('publication._deleted', '=', false)
        .where(({ not, exists, selectFrom }) => not(exists(selectFrom('Transfer_Payment_Stream_Clause as link')
          .select('link.id')
          .whereRef('link.egcs_tp_clause', '=', 'clause.id')
          .where('link.egcs_tp_transferpaymentstream', '=', streamId)
          .where('link._deleted', '=', false))))
      if (selectedIds.length) query = query.where('clause.id', 'in', selectedIds)
      if (search) {
        const pattern = `%${escapeLikePattern(search)}%`
        query = query.where(eb => eb.or([eb(publishedNameEn, 'ilike', pattern), eb(publishedNameFr, 'ilike', pattern)]))
      }
      const items = await query.select([
        'clause.id', publishedNameEn.as('egcs_ay_name_en'), publishedNameFr.as('egcs_ay_name_fr')
      ]).orderBy('egcs_ay_name_en').orderBy('clause.id').limit(limit).offset((page - 1) * limit).execute()
      const count = await query.select(eb => eb.fn.count('clause.id').as('total')).executeTakeFirstOrThrow()
      return { items, total: Number(count.total), page, limit }
    })
  }

  if (action === 'create') {
    const body = await readValidatedBodyI18n(event, StreamClauseLinkSchema)
    try {
      return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, profileId, stream.agencyId, streamId, 'update', async trx => {
        return await trx.insertInto('Transfer_Payment_Stream_Clause')
          .values({ egcs_tp_transferpaymentstream: streamId, egcs_tp_clause: body.egcs_tp_clause })
          .returning(['id', 'egcs_tp_clause']).executeTakeFirstOrThrow()
      })
    } catch (error: unknown) {
      const constraint = getDatabaseConstraintName(error)
      if (constraint === 'tp_chk_streamclausepublishedagency') {
        return await badRequest(event, 'CLAUSE_NOT_AVAILABLE', 'apiErrors.transfer_payment.stream_clause_unavailable')
      }
      if (constraint === 'tp_idx_streamclause_livepair') {
        return await throwApiError(event, { statusCode: 409, code: 'CLAUSE_ALREADY_LINKED', key: 'apiErrors.transfer_payment.stream_clause_already_linked' })
      }
      throw error
    }
  }

  const linkId = getRouterParam(event, 'linkId')
  if (!PositivePostgresBigintIdSchema.safeParse(linkId).success || !linkId) {
    return await notFound(event, 'CLAUSE_LINK_NOT_FOUND', 'apiErrors.request.not_found')
  }
  return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, profileId, stream.agencyId, streamId, 'update', async trx => {
    const removed = await trx.updateTable('Transfer_Payment_Stream_Clause').set({ _deleted: true })
      .where('id', '=', linkId).where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false)
      .returning('id').executeTakeFirst()
    if (!removed) return await notFound(event, 'CLAUSE_LINK_NOT_FOUND', 'apiErrors.request.not_found')
    return { success: true }
  })
}
