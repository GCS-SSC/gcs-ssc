import { authorize } from '~~/server/utils/authorize'
import { authorizeAgreementStreamLookupRoute, prepareAgreementStreamLookupRoute } from '~~/server/utils/agreement-stream-lookup-routes'
import { buildListRouteResponse } from '~~/server/utils/list-route-response'
import { isAgreementRiskRatingWorkflowManaged } from '~~/server/utils/agreement-risk-rating'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const lookup = await prepareAgreementStreamLookupRoute(event, db)
  if ('statusCode' in lookup) return lookup

  await authorize(event, 'agreement', lookup.permissionAction, async ({ context }) => {
    return await authorizeAgreementStreamLookupRoute(
      db,
      lookup.permissionAction,
      lookup.streamId,
      lookup.streamScope,
      lookup.agreementContext,
      context
    )
  })

  let baseQuery = db
    .selectFrom('Transfer_Payment_Stream_Risk_Rating')
    .where('egcs_tp_transferpaymentstream', '=', lookup.streamId)
    .where('_deleted', '=', false)

  if (lookup.escapedSearch) {
    const scoreSearch = Number(lookup.escapedSearch)
    baseQuery = baseQuery.where(eb => eb.or([
      eb('egcs_tp_name_en', 'ilike', `%${lookup.escapedSearch}%`),
      eb('egcs_tp_name_fr', 'ilike', `%${lookup.escapedSearch}%`),
      ...(Number.isFinite(scoreSearch) ? [eb('egcs_tp_riskscore', '=', scoreSearch)] : [])
    ]))
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .select([
        'id',
        'egcs_tp_transferpaymentstream',
        'egcs_tp_riskscore',
        'egcs_tp_name_en',
        'egcs_tp_name_fr',
        'egcs_tp_name_en as label_en',
        'egcs_tp_name_fr as label_fr'
      ])
      .orderBy('egcs_tp_riskscore', 'asc')
      .orderBy('id', 'asc')
      .limit(lookup.limit)
      .offset(lookup.offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
  ])

  return {
    ...buildListRouteResponse(items, countResult, countResult, lookup.page, lookup.limit),
    workflow_managed: await isAgreementRiskRatingWorkflowManaged(db, lookup.streamId)
  }
})
