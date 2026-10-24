import { defineEventHandler, getRouterParam } from 'h3'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { listAgreementGeneratedDocuments } from '~~/server/utils/document-generation'

const readRoute = defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const closeoutId = getRouterParam(event, 'closeoutId')
  if (!agreementId || !closeoutId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (![agreementId, closeoutId].every(isPositivePostgresBigintText)) return await badRequest(event, 'INVALID_IDS', 'apiErrors.request.invalid')
  const db = event.context.$db
  const context = await authorizeAgreementResource(event, 'read', agreementId, db)
  if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const closeout = await db.selectFrom('Funding_Case_Agreement_Closeout').select('id')
    .where('id', '=', closeoutId).where('egcs_fc_fundingagreement', '=', agreementId)
    .where('_deleted', '=', false).executeTakeFirst()
  if (!closeout) return await notFound(event, 'AGREEMENT_CLOSEOUT_NOT_FOUND', 'apiErrors.agreement.closeout_not_found')
  const items = await listAgreementGeneratedDocuments(agreementId, db, closeoutId)
  return { items, total: items.length, stats: { total: items.length }, page: 1, limit: items.length || 25 }
})

export default defineEventHandler(async event =>
  await executeFreshReadSnapshot(event, async () => await readRoute(event)))
