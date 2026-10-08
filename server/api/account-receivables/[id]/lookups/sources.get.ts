import { z } from 'zod'
import { PaginationSchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeAccountReceivable } from '~~/server/utils/account-receivable'
import { readAccountReceivableAuthoringSources } from '~~/server/utils/account-receivable-lines'
import { requireAccountReceivableSourceRead } from '~~/server/utils/account-receivable-source'

const SourceLookupQuery = PaginationSchema.extend({ selectedIds: z.union([z.string({ error: 'validation.required' }).regex(/^(?:(?:claim|advance):)?[1-9]\d*$/, { error: 'validation.invalid_selection' }), z.array(z.string({ error: 'validation.required' }).regex(/^(?:(?:claim|advance):)?[1-9]\d*$/, { error: 'validation.invalid_selection' })).max(100, { error: 'validation.max_items' })]).transform(value => Array.isArray(value) ? value : [value]).optional() })

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const context = await authorizeAccountReceivable(event, id, 'update')
  const input = await getValidatedQueryI18n(event, SourceLookupQuery)
  const debt = await event.context.$db.selectFrom('Funding_Case_Agreement_Account_Receivable').select('egcs_fc_linkedreceivable').where('id', '=', id).executeTakeFirstOrThrow()
  if (!debt.egcs_fc_linkedreceivable) await requireAccountReceivableSourceRead(event, event.context.$db, context.agreementId)
  const sources = await readAccountReceivableAuthoringSources(event.context.$db, id)
  const selectedSources = input.selectedIds ? sources.filter(row => input.selectedIds!.includes(row.id)) : sources
  const rows = input.search ? selectedSources.filter(row => row.label_en.toLowerCase().includes(input.search!.toLowerCase()) || row.label_fr.toLowerCase().includes(input.search!.toLowerCase())) : selectedSources
  return { items: rows.slice((input.page - 1) * input.limit, input.page * input.limit).map(({ coding: _coding, ...row }) => row), total: rows.length, page: input.page, limit: input.limit }
})
