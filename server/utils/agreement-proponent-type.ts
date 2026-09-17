/* eslint-disable jsdoc/require-jsdoc -- Internal relationship policy helpers. */
import type { Kysely } from 'kysely'
import type { H3Event } from 'h3'
import { z } from 'zod'
import type { Database } from '~~/shared/types/database'
import { parseI18n } from './api-validate'

export const listAgreementProponentTypes = async (db: Kysely<Database>, streamId: string, options: { lockForAuthoring?: boolean } = {}) => {
  let query = db
    .selectFrom('Transfer_Payment_Stream_Eligible_Recipient as e')
    .innerJoin('Agency_Applicant_Recipient_Subtype as t', 't.id', 'e.egcs_tp_applicantrecipientsubtype')
    .innerJoin('Transfer_Payment_Stream as s', 's.id', 'e.egcs_tp_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile as p', 'p.id', 's.egcs_tp_transferpaymentprofile')
    .where('s.id', '=', streamId)
    .whereRef('t.egcs_ay_organizationagency', '=', 'p.egcs_tp_agency')
    .where('e._deleted', '=', false).where('t._deleted', '=', false)
    .select(['t.id', 't.egcs_ay_name_en', 't.egcs_ay_name_fr'])
    .orderBy('t.id')
  if (options.lockForAuthoring) query = query.forShare(['t'])
  return await query.execute().then(rows => rows.map(row => ({ ...row, id: String(row.id) })))
}

export const getAgreementProponentTypeSelection = async (db: Kysely<Database>, streamId: string, proponentId: string) => {
  const items = await listAgreementProponentTypes(db, streamId)
  const stream = await db.selectFrom('Transfer_Payment_Stream').select('egcs_tp_requireconsistentproponenttype')
    .where('id', '=', streamId).executeTakeFirstOrThrow()
  const previous = items.length
    ? await db.selectFrom('Funding_Case_Agreement_Applicant_Recipient as r')
        .innerJoin('Funding_Case_Agreement_Profile as a', 'a.id', 'r.egcs_fc_fundingagreement')
        .select('r.egcs_fc_applicantrecipientsubtype')
        .where('a.egcs_fc_transferpaymentstream', '=', streamId)
        .where('r.egcs_fc_applicantrecipient', '=', proponentId)
        .where('r._deleted', '=', false).where('a._deleted', '=', false)
        .where('r.egcs_fc_applicantrecipientsubtype', 'in', items.map(item => item.id))
        .orderBy('a.id', 'desc').orderBy('r.id', 'desc').executeTakeFirst()
    : undefined
  const previousType = previous?.egcs_fc_applicantrecipientsubtype ? String(previous.egcs_fc_applicantrecipientsubtype) : null
  const fixed = stream.egcs_tp_requireconsistentproponenttype ? previousType : null
  return { items, suggested: previousType ?? (items.length === 1 ? items[0]!.id : null), fixed }
}

export const assertAgreementProponentType = async (
  event: H3Event, db: Kysely<Database>, streamId: string,
  proponentId: string, subtypeId: string, path: (string | number)[] = ['egcs_fc_applicantrecipientsubtype'],
  options: { preserveSavedType?: boolean } = {}
) => {
  const selection = await getAgreementProponentTypeSelection(db, streamId, proponentId)
  await parseI18n(event, z.object({}).superRefine((_value, ctx) => {
    if (!selection.items.some(item => item.id === subtypeId)) {
      ctx.addIssue({ code: 'custom', message: 'validation.invalid_selection', path })
    } else if (!options.preserveSavedType && selection.fixed && selection.fixed !== subtypeId) {
      ctx.addIssue({ code: 'custom', message: 'validation.proponent_type_conflict', path })
    }
  }), {})
}

export const assertEligibleProponentTypeNotInUse = async (event: H3Event, db: Kysely<Database>, streamId: string, subtypeId: string) => {
  const reference = await db.selectFrom('Funding_Case_Agreement_Applicant_Recipient as r')
    .innerJoin('Funding_Case_Agreement_Profile as a', 'a.id', 'r.egcs_fc_fundingagreement')
    .select('r.id').where('a.egcs_fc_transferpaymentstream', '=', streamId)
    .where('r.egcs_fc_applicantrecipientsubtype', '=', subtypeId)
    .where('a._deleted', '=', false).where('r._deleted', '=', false).executeTakeFirst()
  await parseI18n(event, z.object({}).superRefine((_value, ctx) => {
    if (reference) ctx.addIssue({ code: 'custom', message: 'validation.proponent_type_in_use', path: ['egcs_tp_applicantrecipientsubtype'] })
  }), {})
}
