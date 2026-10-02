import { authorizeJournalVoucher, readJournalVoucherAgreementCoding, readJournalVoucherCodingChoices, readJournalVoucherLines } from '~~/server/utils/journal-voucher'
import { formatAccountingDimension } from '~~/shared/utils/accounting-dimensions'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'
import type { JournalVoucherCodingChoice } from '~~/shared/types/journal-voucher'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const context = await authorizeJournalVoucher(event, id)
  const header = await event.context.$db.selectFrom('Funding_Case_Agreement_Journal_Voucher').select(['egcs_fc_agencyfiscalyear', 'egcs_fc_currency']).where('id', '=', id).executeTakeFirstOrThrow()
  const choices = await readJournalVoucherCodingChoices(event.context.$db, context, header.egcs_fc_agencyfiscalyear, header.egcs_fc_currency)
  const saved = await readJournalVoucherLines(event.context.$db, id)
  const agreementCoding = await readJournalVoucherAgreementCoding(event.context.$db, context.agreementId)
  const historical = saved.filter(line => line.egcs_fc_kind !== 'adjustment').map(line => ({ id: line.egcs_fc_chartofaccount,
    egcs_tp_agencychartofaccount: line.egcs_fc_agencychartofaccount, egcs_ay_accountingdimensions: line.egcs_fc_accountingdimensions }))
  const retained = new Map([...historical, ...choices.filter(choice => !historical.some(line => line.id === String(choice.id)))].map(choice => [String(choice.id), choice]))
  const items: JournalVoucherCodingChoice[] = [...retained.values()].map(choice => {
    const dimensions = TransferPaymentStreamChartOfAccountDimensionSchema.array().parse(choice.egcs_ay_accountingdimensions)
    return { id: String(choice.id), label_en: dimensions.map(dimension => formatAccountingDimension(dimension, 'en')).join(' · '),
      label_fr: dimensions.map(dimension => formatAccountingDimension(dimension, 'fr')).join(' · '),
      egcs_fc_accountingdimensions: dimensions,
      egcs_fc_agencychartofaccount: String(choice.egcs_tp_agencychartofaccount),
      egcs_fc_agreementcodingmatched: agreementCoding.has(String(choice.egcs_tp_agencychartofaccount)) }
  })
  return { items, total: items.length }
})
