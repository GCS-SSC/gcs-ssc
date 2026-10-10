/* eslint-disable jsdoc/require-jsdoc -- Coding lines inherit the AR's exact assignment and protected transaction. */
import type { H3Event } from 'h3'
import { sql, type Kysely } from 'kysely'
import type { Database, JsonValue } from '~~/shared/types/database'
import type { AccountReceivableLineCreate, AccountReceivableLinePatch } from '~~/shared/types/schemas/account-receivable'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { formatAccountingDimensions } from '~~/shared/utils/accounting-dimensions'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'
import { z } from 'zod'
import { moneyFromCents, moneyToCents, sumMoney, parseMoney } from '~~/shared/utils/money'
import { authorizeAccountReceivable, assertAccountReceivableEditable, readAccountReceivableLines, readAccountReceivableCoding, allocateRetainedAccountReceivableCoding, validateAccountReceivableBasis, fiscalCapacity, freshCoding } from './account-receivable'
import { executeFreshAccountReceivableWrite } from './account-receivable-context'
import { accountReceivableError, readAccountReceivableSources } from './account-receivable-source'
import { readAccountReceivableAccount } from './account-receivable-configuration'
import { databaseMoneyValue, parseDatabaseMoney } from './database-money'

const ZERO = parseMoney('0.00')
export const readAccountReceivableAuthoringSources = async (db: Kysely<Database>, id: string) => {
  const debt = await db.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll().where('id', '=', id).where('_deleted', '=', false).executeTakeFirstOrThrow()
  if (debt.egcs_fc_linkedreceivable) {
    const coding = await readAccountReceivableCoding(db, String(debt.egcs_fc_linkedreceivable))
    return (await readAccountReceivableLines(db, String(debt.egcs_fc_linkedreceivable))).map((line, index) => {
      const dimensions = z.array(TransferPaymentStreamChartOfAccountDimensionSchema).parse(line.egcs_fc_accountreceivableaccountingdimensions)
      return { ...line, id: String(line.id), egcs_fc_originalline: String(line.id),
        label_en: `${index + 1} · ${line.egcs_fc_sourcekey} · ${formatAccountingDimensions(dimensions, 'en')}`,
        label_fr: `${index + 1} · ${line.egcs_fc_sourcekey} · ${formatAccountingDimensions(dimensions, 'fr')}`,
        coding: coding.filter(row => String(row.egcs_fc_receivableline) === String(line.id)) }
    })
  }
  const sources = await readAccountReceivableSources(db, { agreementId: String(debt.egcs_fc_fundingagreement), applicantRecipientId: String(debt.egcs_fc_applicantrecipient),
    agencyFiscalYearId: String(debt.egcs_fc_agencyfiscalyear), currency: debt.egcs_fc_currency, claimRelated: debt.egcs_fc_claimrelated, advancePaymentRelated: debt.egcs_fc_advancepaymentrelated })
  return sources.map(source => ({ ...source, egcs_fc_sourcekey: source.id, egcs_fc_originalline: undefined as string | undefined }))
}

export const writeAccountReceivableLine = async (event: H3Event, id: string, input: AccountReceivableLineCreate | AccountReceivableLinePatch, lineId?: string, options: { removeCoding?: boolean; recodeTo?: string } = {}) => {
  const context = await authorizeAccountReceivable(event, id, 'update')
  if (lineId !== undefined && !isPositivePostgresBigintText(lineId)) return await accountReceivableError(event, 'AR_LINE_SET_STALE')
  const initial = await event.context.$db.selectFrom('Funding_Case_Agreement_Account_Receivable').select('egcs_fc_linkedreceivable').where('id', '=', id).executeTakeFirstOrThrow()
  return await executeFreshAccountReceivableWrite(event, { ...context, agreementIds: [context.agreementId] }, async trx => {
    const debt = await assertAccountReceivableEditable(event, trx, id)
    let saved = lineId ? (await readAccountReceivableLines(trx, id)).find(line => String(line.id) === lineId) : undefined
    if (lineId && !saved) return await accountReceivableError(event, 'AR_LINE_SET_STALE')
    if (options.removeCoding || options.recodeTo) {
      if (!saved || !debt.egcs_fc_linkedreceivable || !saved.egcs_fc_accountreceivablechartofaccount) return await accountReceivableError(event, 'AR_SOURCE_UNAVAILABLE')
      const current = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable_Line as line')
        .innerJoin('Funding_Case_Agreement_Account_Receivable as owner', 'owner.id', 'line.egcs_fc_receivable')
        .select(sql<string>`COALESCE(sum(line.egcs_fc_amount),0)::text`.as('amount'))
        .where('owner.egcs_fc_outcome', '=', 'posted').where('owner._deleted', '=', false).where('line._deleted', '=', false)
        .where('line.egcs_fc_accountreceivablechartofaccount', '=', saved.egcs_fc_accountreceivablechartofaccount)
        .where(eb => eb.or([eb('line.id', '=', String(saved!.egcs_fc_originalline)), eb('line.egcs_fc_originalline', '=', String(saved!.egcs_fc_originalline))])).executeTakeFirstOrThrow()
      const other = (await readAccountReceivableLines(trx, id)).filter(line => line.id !== saved!.id && line.egcs_fc_originalline === saved!.egcs_fc_originalline && line.egcs_fc_accountreceivablechartofaccount === saved!.egcs_fc_accountreceivablechartofaccount)
      if (options.recodeTo) {
        if (options.recodeTo === saved.egcs_fc_accountreceivablechartofaccount || (await readAccountReceivableLines(trx, id)).length >= 500) return await accountReceivableError(event, 'AR_INVALID_BASIS')
        const movedAmount = sumMoney([parseDatabaseMoney(current.amount), saved.egcs_fc_amount, ...other.map(line => line.egcs_fc_amount)])
        if (moneyToCents(movedAmount) <= BigInt(0)) return await accountReceivableError(event, 'AR_INVALID_BASIS')
        const partitions = (await readAccountReceivableCoding(trx, id)).filter(row => row.egcs_fc_receivableline === saved!.id)
        let account
        let allocated: ReturnType<typeof allocateRetainedAccountReceivableCoding>
        try {
          account = await readAccountReceivableAccount(trx, { id: options.recodeTo, agencyId: context.agencyId,
            streamId: context.streamId, agencyFiscalYearId: String(debt.egcs_fc_agencyfiscalyear), currency: debt.egcs_fc_currency })
          allocated = allocateRetainedAccountReceivableCoding(movedAmount, partitions.map(row => ({ id: row.id, basis: row.egcs_fc_paidbasis, capacity: row.egcs_fc_paidbasis })))
        } catch (error) { return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_ACCOUNT_UNAVAILABLE') }
        const { id: _lineId, ...retainedLine } = saved
        const replacement = await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Line').values({ ...retainedLine,
          egcs_fc_amount: databaseMoneyValue(movedAmount), egcs_fc_sourceamount: databaseMoneyValue(saved.egcs_fc_sourceamount),
          egcs_fc_accountreceivablechartofaccount: String(account.id), egcs_fc_evidence: sql<JsonValue>`${JSON.stringify(saved.egcs_fc_evidence)}::jsonb`,
          egcs_fc_accountreceivableaccountingdimensions: sql<JsonValue>`${JSON.stringify(account.egcs_ay_accountingdimensions)}::jsonb`
        }).returning('id').executeTakeFirstOrThrow()
        for (const partition of partitions) {
          const { id: _codingId, ...retainedCoding } = partition
          await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Coding').values({ ...retainedCoding,
            egcs_fc_receivableline: String(replacement.id), egcs_fc_amount: databaseMoneyValue(allocated.find(split => split.id === partition.id)!.amount),
            egcs_fc_paidbasis: databaseMoneyValue(partition.egcs_fc_paidbasis), egcs_fc_sharedpaidbasis: databaseMoneyValue(partition.egcs_fc_sharedpaidbasis),
            egcs_fc_accountingdimensions: sql<JsonValue>`${JSON.stringify(partition.egcs_fc_accountingdimensions)}::jsonb`
          }).execute()
        }
      }
      input = { egcs_fc_accountreceivablechartofaccount: saved.egcs_fc_accountreceivablechartofaccount,
        egcs_fc_amount: moneyFromCents(-moneyToCents(sumMoney([parseDatabaseMoney(current.amount), ...other.map(line => line.egcs_fc_amount)]))) }
    }
    if (!saved) {
      const create = input as AccountReceivableLineCreate
      if ((await readAccountReceivableLines(trx, id)).length >= 500) return await accountReceivableError(event, 'AR_INVALID_BASIS')
      if (!debt.egcs_fc_linkedreceivable && create.egcs_fc_originalline) return await accountReceivableError(event, 'AR_SOURCE_UNAVAILABLE')
      const sources = await readAccountReceivableAuthoringSources(trx, id)
      const source = sources.find(row => debt.egcs_fc_linkedreceivable
        ? row.egcs_fc_originalline === create.egcs_fc_originalline && row.egcs_fc_sourcekey === create.egcs_fc_sourcekey
        : row.id === create.egcs_fc_sourcekey)
      if (!source) return await accountReceivableError(event, 'AR_SOURCE_UNAVAILABLE')
      const original = debt.egcs_fc_linkedreceivable ? (await readAccountReceivableLines(trx, String(debt.egcs_fc_linkedreceivable))).find(line => String(line.id) === create.egcs_fc_originalline) : undefined
      if (debt.egcs_fc_linkedreceivable && !original) return await accountReceivableError(event, 'AR_SOURCE_UNAVAILABLE')
      const { id: _sourceId, label_en: _en, label_fr: _fr, coding, ...retained } = source
      const debtor = await trx.selectFrom('Applicant_Recipient_Profile').select(['egcs_ar_legalname_en', 'egcs_ar_operatingname_en', 'egcs_ar_legalname_fr', 'egcs_ar_operatingname_fr']).where('id', '=', String(debt.egcs_fc_applicantrecipient)).executeTakeFirstOrThrow()
      const year = await trx.selectFrom('Agency_Fiscal_Year').select('egcs_ay_fiscalyeardisplay').where('id', '=', String(debt.egcs_fc_agencyfiscalyear)).executeTakeFirstOrThrow()
      const values = original
        ? { egcs_fc_originalline: String(original.id), egcs_fc_claim: original.egcs_fc_claim, egcs_fc_claimline: original.egcs_fc_claimline, egcs_fc_reconcileline: original.egcs_fc_reconcileline, egcs_fc_payment: original.egcs_fc_payment,
            egcs_fc_periodstart: original.egcs_fc_periodstart, egcs_fc_periodend: original.egcs_fc_periodend, egcs_fc_sourceamount: databaseMoneyValue(original.egcs_fc_sourceamount), egcs_fc_evidence: sql<JsonValue>`${JSON.stringify(original.egcs_fc_evidence)}::jsonb`,
            egcs_fc_accountreceivablechartofaccount: original.egcs_fc_accountreceivablechartofaccount, egcs_fc_accountreceivableaccountingdimensions: sql<JsonValue>`${JSON.stringify(original.egcs_fc_accountreceivableaccountingdimensions)}::jsonb` }
        : { egcs_fc_claim: retained.egcs_fc_claim, egcs_fc_claimline: retained.egcs_fc_claimline, egcs_fc_reconcileline: retained.egcs_fc_reconcileline, egcs_fc_payment: retained.egcs_fc_payment,
            egcs_fc_periodstart: retained.egcs_fc_periodstart, egcs_fc_periodend: retained.egcs_fc_periodend, egcs_fc_sourceamount: databaseMoneyValue(retained.egcs_fc_sourceamount), egcs_fc_evidence: sql<JsonValue>`${JSON.stringify({ source: retained.egcs_fc_evidence, egcs_fc_debtorname_en: debtor.egcs_ar_legalname_en ?? debtor.egcs_ar_operatingname_en ?? '', egcs_fc_debtorname_fr: debtor.egcs_ar_legalname_fr ?? debtor.egcs_ar_operatingname_fr ?? '', egcs_fc_fiscalyeardisplay: year.egcs_ay_fiscalyeardisplay })}::jsonb` }
      const inserted = await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Line').values({ ...values, egcs_fc_receivable: id, egcs_fc_fundingagreement: context.agreementId,
        egcs_fc_sourcekey: create.egcs_fc_sourcekey, egcs_fc_amount: databaseMoneyValue(ZERO) }).returning('id').executeTakeFirstOrThrow()
      for (const partition of coding) await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Coding').values({ egcs_fc_receivable: id, egcs_fc_receivableline: String(inserted.id), egcs_fc_fundingagreement: context.agreementId,
        egcs_fc_commitmentline: partition.egcs_fc_commitmentline, egcs_fc_chartofaccount: partition.egcs_fc_chartofaccount, egcs_fc_agencychartofaccount: partition.egcs_fc_agencychartofaccount,
        egcs_fc_agencyfiscalyear: partition.egcs_fc_agencyfiscalyear, egcs_fc_periodstart: partition.egcs_fc_periodstart, egcs_fc_periodend: partition.egcs_fc_periodend,
        egcs_fc_paidbasis: databaseMoneyValue(partition.egcs_fc_paidbasis), egcs_fc_sharedpaidbasis: databaseMoneyValue(partition.egcs_fc_sharedpaidbasis), egcs_fc_amount: databaseMoneyValue(ZERO),
        egcs_fc_accountingdimensions: sql<JsonValue>`${JSON.stringify(partition.egcs_fc_accountingdimensions)}::jsonb` }).execute()
      saved = (await readAccountReceivableLines(trx, id)).find(line => String(line.id) === String(inserted.id))!
    }

    try {
      const refreshedSources = debt.egcs_fc_linkedreceivable
        ? await readAccountReceivableSources(trx, { agreementId: context.agreementId,
            applicantRecipientId: context.applicantRecipientId, agencyFiscalYearId: String(debt.egcs_fc_agencyfiscalyear), currency: debt.egcs_fc_currency,
            claimRelated: debt.egcs_fc_claimrelated, advancePaymentRelated: debt.egcs_fc_advancepaymentrelated })
        : null
      if (refreshedSources) {
        const snapshot = fiscalCapacity(refreshedSources, debt.egcs_fc_advancepaymentrelated)
        await trx.updateTable('Funding_Case_Agreement_Account_Receivable').set({ egcs_fc_fiscaloutstanding: snapshot === null ? null : databaseMoneyValue(snapshot) }).where('id', '=', id).execute()
      }
      const account = input.egcs_fc_accountreceivablechartofaccount
        ? await readAccountReceivableAccount(trx, { id: input.egcs_fc_accountreceivablechartofaccount,
            agencyId: context.agencyId, streamId: context.streamId, agencyFiscalYearId: String(debt.egcs_fc_agencyfiscalyear), currency: debt.egcs_fc_currency })
        : null
      const partitions = (await readAccountReceivableCoding(trx, id)).filter(row => String(row.egcs_fc_receivableline) === String(saved.id))
      const allocated = allocateRetainedAccountReceivableCoding(input.egcs_fc_amount, partitions.map(row => ({ id: String(row.id), basis: row.egcs_fc_paidbasis, capacity: row.egcs_fc_paidbasis })))
      await trx.updateTable('Funding_Case_Agreement_Account_Receivable_Line').set({ egcs_fc_amount: databaseMoneyValue(input.egcs_fc_amount), egcs_fc_accountreceivablechartofaccount: account ? String(account.id) : null,
        egcs_fc_accountreceivableaccountingdimensions: sql<JsonValue>`${JSON.stringify(account && String(account.id) === saved.egcs_fc_accountreceivablechartofaccount ? saved.egcs_fc_accountreceivableaccountingdimensions : account?.egcs_ay_accountingdimensions ?? [])}::jsonb` }).where('id', '=', String(saved.id)).execute()
      for (const split of allocated) await trx.updateTable('Funding_Case_Agreement_Account_Receivable_Coding').set({ egcs_fc_amount: databaseMoneyValue(split.amount), ...(refreshedSources ? { egcs_fc_sharedpaidbasis: databaseMoneyValue(freshCoding(refreshedSources, saved.egcs_fc_sourcekey, partitions.find(row => String(row.id) === split.id)!)?.egcs_fc_sharedpaidbasis ?? ZERO) } : {}) }).where('id', '=', split.id).execute()
      await validateAccountReceivableBasis(trx, id)
    } catch (error) { return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_INVALID_BASIS') }
    return { id: String(saved.id) }
  }, { target: { entityType: context.entityType, entityId: id }, sourceRead: !lineId && !initial.egcs_fc_linkedreceivable })
}

export const deleteAccountReceivableLine = async (event: H3Event, id: string, lineId: string) => {
  const context = await authorizeAccountReceivable(event, id, 'delete')
  if (!isPositivePostgresBigintText(lineId)) return await accountReceivableError(event, 'AR_LINE_SET_STALE')
  return await executeFreshAccountReceivableWrite(event, { ...context, agreementIds: [context.agreementId] }, async trx => {
    await assertAccountReceivableEditable(event, trx, id)
    const row = await trx.updateTable('Funding_Case_Agreement_Account_Receivable_Line').set({ _deleted: true }).where('id', '=', lineId).where('egcs_fc_receivable', '=', id).where('_deleted', '=', false).returning('id').executeTakeFirst()
    if (!row) return await accountReceivableError(event, 'AR_LINE_SET_STALE')
    await trx.updateTable('Funding_Case_Agreement_Account_Receivable_Coding').set({ _deleted: true }).where('egcs_fc_receivableline', '=', lineId).where('egcs_fc_receivable', '=', id).execute()
    try {
      const { validateAccountReceivableClaimReductionBasis } = await import('./account-receivable-claim-reductions')
      await validateAccountReceivableClaimReductionBasis(trx, id)
    } catch (error) { return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_CLAIM_REDUCTION_SOURCE_REQUIRED') }
    if ((await readAccountReceivableLines(trx, id)).length) {
      try {
        await validateAccountReceivableBasis(trx, id)
      } catch (error) {
        return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_INVALID_BASIS')
      }
    }
    return { success: true }
  }, { action: 'delete', target: { entityType: context.entityType, entityId: id } })
}
