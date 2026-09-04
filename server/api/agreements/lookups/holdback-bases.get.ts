import { authorize } from '~~/server/utils/authorize'
import { authorizeAgreementStreamLookupRoute, prepareAgreementStreamLookupRoute } from '~~/server/utils/agreement-stream-lookup-routes'
import { buildListRouteResponse } from '~~/server/utils/list-route-response'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const lookup = await prepareAgreementStreamLookupRoute(event, db)
  if ('statusCode' in lookup) return lookup
  await authorize(event, 'agreement', lookup.permissionAction, async ({ context }) => await authorizeAgreementStreamLookupRoute(
    db, lookup.permissionAction, lookup.streamId, lookup.streamScope, lookup.agreementContext, context
  ))
  let query = db.selectFrom('Transfer_Payment_Stream_Holdback_Basis')
    .innerJoin('Agency_Holdback_Basis', 'Agency_Holdback_Basis.id', 'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_agencyholdback')
    .where('egcs_tp_transferpaymentstream', '=', lookup.streamId)
    .where('Transfer_Payment_Stream_Holdback_Basis._deleted', '=', false)
    .where('Agency_Holdback_Basis._deleted', '=', false)
  if (lookup.escapedSearch) query = query.where(eb => eb.or([
    eb('Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_en', 'ilike', `%${lookup.escapedSearch}%`),
    eb('Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_fr', 'ilike', `%${lookup.escapedSearch}%`)
  ]))
  const [items, count] = await Promise.all([
    query.select([
      'Transfer_Payment_Stream_Holdback_Basis.id', 'egcs_tp_transferpaymentstream', 'egcs_tp_agencyholdback',
      'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_en', 'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_fr',
      'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_en as label_en',
      'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_fr as label_fr',
      'Agency_Holdback_Basis.egcs_ay_languageindependentcode'
    ]).orderBy('Transfer_Payment_Stream_Holdback_Basis.id', 'asc').limit(lookup.limit).offset(lookup.offset).execute(),
    query.select(eb => eb.fn.count('Transfer_Payment_Stream_Holdback_Basis.id').as('total')).executeTakeFirst()
  ])
  return buildListRouteResponse(items, count, count, lookup.page, lookup.limit)
})
