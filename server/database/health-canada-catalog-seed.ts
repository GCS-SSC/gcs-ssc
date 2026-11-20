import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

const agencyId = '30021'
const streamId = '30118'

/**
 * Completes the Health Canada catalog and its Oral Health stream selections.
 * @param db The final demo seed transaction after restoring the snapshot.
 */
export const seedHealthCanadaCatalogs = async (db: Transaction<Database>): Promise<void> => {
  // The existing basis already calculates the final fiscal year and is selected on this stream.
  const finalYear = await db.updateTable('Agency_Holdback_Basis')
    .set({ egcs_ay_name_en: 'Final Year', egcs_ay_name_fr: 'Dernier exercice' })
    .where('egcs_ay_organizationagency', '=', agencyId)
    .where('egcs_ay_languageindependentcode', '=', 'holdback')
    .where('egcs_ay_holdbackbasis', '=', 'finalfiscal')
    .where('_deleted', '=', false)
    .returning('id').executeTakeFirstOrThrow()
  await db.selectFrom('Transfer_Payment_Stream_Holdback_Basis').select('id')
    .where('egcs_tp_transferpaymentstream', '=', streamId)
    .where('egcs_tp_agencyholdback', '=', finalYear.id)
    .where('_deleted', '=', false)
    .executeTakeFirstOrThrow()
  const fullValue = await db.insertInto('Agency_Holdback_Basis').values({
    egcs_ay_organizationagency: agencyId,
    egcs_ay_languageindependentcode: 'full_value',
    egcs_ay_holdbackbasis: 'fullagreement',
    egcs_ay_name_en: 'Full Value',
    egcs_ay_name_fr: 'Valeur totale'
  }).returning('id').executeTakeFirstOrThrow()
  await db.insertInto('Transfer_Payment_Stream_Holdback_Basis').values({
    egcs_tp_transferpaymentstream: streamId,
    egcs_tp_agencyholdback: fullValue.id
  }).execute()

  await db.insertInto('Agency_Proponent_Relationship_Type').values([
    {
      egcs_ay_organizationagency: agencyId,
      egcs_ay_code: 'parent',
      egcs_ay_name_en: 'Parent',
      egcs_ay_name_fr: 'Société mère',
      egcs_ay_inversecode: 'subsidiary',
      egcs_ay_inversename_en: 'Subsidiary',
      egcs_ay_inversename_fr: 'Filiale'
    },
    {
      egcs_ay_organizationagency: agencyId,
      egcs_ay_code: 'affiliate',
      egcs_ay_name_en: 'Affiliate',
      egcs_ay_name_fr: 'Société affiliée'
    }
  ]).execute()

  const amendmentTypes = await db.selectFrom('Transfer_Payment_Amendment_Type').select('id')
    .where('egcs_tp_transferpaymentstream', '=', streamId)
    .where('egcs_tp_amended', 'in', ['title', 'budget'])
    .where('egcs_tp_active', '=', true)
    .where('_deleted', '=', false)
    .execute()
  if (amendmentTypes.length !== 2) throw new Error('Health Canada title and financial amendment types are missing')
  const subtypes = await db.insertInto('Transfer_Payment_Amendment_Subtype').values([
    {
      egcs_tp_transferpaymentstream: streamId,
      egcs_tp_name_en: 'Major',
      egcs_tp_name_fr: 'Majeure',
      egcs_tp_description_en: 'A change that materially affects the agreement.',
      egcs_tp_description_fr: 'Une modification qui a un effet important sur l’entente.'
    },
    {
      egcs_tp_transferpaymentstream: streamId,
      egcs_tp_name_en: 'Minor',
      egcs_tp_name_fr: 'Mineure',
      egcs_tp_description_en: 'A limited change to the agreement.',
      egcs_tp_description_fr: 'Une modification de portée limitée à l’entente.'
    }
  ]).returning('id').execute()
  await db.insertInto('Transfer_Payment_Amendment_Subtype_Type').values(
    subtypes.flatMap(subtype => amendmentTypes.map(type => ({
      egcs_tp_amendmentsubtype: subtype.id,
      egcs_tp_amendmenttype: type.id
    })))
  ).execute()
}
