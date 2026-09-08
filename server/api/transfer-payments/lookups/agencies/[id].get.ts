import { requireAuthContext } from '~~/server/utils/authorize'
import { getValidatedQueryI18n, parseI18n } from '~~/server/utils/api-validate'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import {
  resolveTransferPaymentAgencyLookupIds,
  transferPaymentAgencyLookupQuery,
  TransferPaymentAgencyLookupQuerySchema
} from '~~/server/utils/transfer-payment-agency-lookups'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const query = await getValidatedQueryI18n(event, TransferPaymentAgencyLookupQuerySchema)
  const agencyId = await parseI18n(event, PositivePostgresBigintIdSchema, getRouterParam(event, 'id'))
  const agencyIds = await resolveTransferPaymentAgencyLookupIds(event, query, agencyId)
  const agency = await transferPaymentAgencyLookupQuery(event.context.$db, agencyIds)
    .where('id', '=', agencyId)
    .select(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr'])
    .executeTakeFirst()
  return agency ? { ...agency, id: String(agency.id) } : await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
})
