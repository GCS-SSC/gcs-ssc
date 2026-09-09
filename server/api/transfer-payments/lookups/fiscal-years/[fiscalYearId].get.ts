import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { getValidatedQueryI18n, parseI18n } from '~~/server/utils/api-validate'
import { notFound } from '~~/server/utils/api-errors'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import {
  transferPaymentFiscalYearLookupQuery,
  TransferPaymentFiscalYearLookupQuerySchema
} from '~~/server/utils/transfer-payment-fiscal-year-lookups'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const query = await getValidatedQueryI18n(event, TransferPaymentFiscalYearLookupQuerySchema)
  const fiscalYearId = await parseI18n(event, PositivePostgresBigintIdSchema, getRouterParam(event, 'fiscalYearId'))
  await authorize(event, 'transfer_payment', 'create', { type: 'agency', agencyId: query.agency_id })
  const fiscalYear = await transferPaymentFiscalYearLookupQuery(event.context.$db, query.agency_id)
    .where('Agency_Fiscal_Year.id', '=', fiscalYearId).executeTakeFirst()
  return fiscalYear
    ? { ...fiscalYear, id: String(fiscalYear.id) }
    : await notFound(event, 'FISCAL_YEAR_NOT_FOUND', 'apiErrors.agency.fiscal_year_not_found')
})
