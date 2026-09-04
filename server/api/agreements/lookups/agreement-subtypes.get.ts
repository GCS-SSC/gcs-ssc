import { authorize } from '~~/server/utils/authorize'
import { authorizeAgreementStreamLookupRoute, prepareAgreementStreamLookupRoute } from '~~/server/utils/agreement-stream-lookup-routes'
import { buildListRouteResponse } from '~~/server/utils/list-route-response'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

const readRoute = defineEventHandler(async event => {
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
    .selectFrom('Transfer_Payment_Agreement_Subtype')
    .innerJoin(
      'Agency_Agreement_Type',
      'Agency_Agreement_Type.id',
      'Transfer_Payment_Agreement_Subtype.egcs_tp_agreementtype'
    )
    .where('Transfer_Payment_Agreement_Subtype.egcs_tp_transferpaymentstream', '=', lookup.streamId)
    .where('Transfer_Payment_Agreement_Subtype._deleted', '=', false)
    .where('Agency_Agreement_Type._deleted', '=', false)

  if (lookup.escapedSearch) {
    baseQuery = baseQuery.where(eb => eb.or([
      eb('Transfer_Payment_Agreement_Subtype.id', '=', lookup.escapedSearch),
      eb('Agency_Agreement_Type.egcs_ay_name_en', 'ilike', `%${lookup.escapedSearch}%`),
      eb('Agency_Agreement_Type.egcs_ay_name_fr', 'ilike', `%${lookup.escapedSearch}%`)
    ]))
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .select([
        'Transfer_Payment_Agreement_Subtype.id as id',
        'Transfer_Payment_Agreement_Subtype.egcs_tp_transferpaymentstream as egcs_tp_transferpaymentstream',
        'Agency_Agreement_Type.egcs_ay_name_en as agreement_name_en',
        'Agency_Agreement_Type.egcs_ay_name_fr as agreement_name_fr',
        'Agency_Agreement_Type.egcs_ay_agreementtype as agreement_type',
        'Agency_Agreement_Type.egcs_ay_name_en as label_en',
        'Agency_Agreement_Type.egcs_ay_name_fr as label_fr'
      ])
      .orderBy('Transfer_Payment_Agreement_Subtype.id', 'asc')
      .limit(lookup.limit)
      .offset(lookup.offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Transfer_Payment_Agreement_Subtype.id').as('total')).executeTakeFirst()
  ])

  return buildListRouteResponse(items, countResult, countResult, lookup.page, lookup.limit)
})

export default defineEventHandler(async event =>
  await executeFreshReadSnapshot(event, async () => await readRoute(event)))
