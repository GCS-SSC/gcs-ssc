/* eslint-disable jsdoc/require-jsdoc -- Shared workflow authoring catalogs and immutable labels. */
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AgreementProfileCondition } from '~~/shared/types/schemas/agreement-custom-fields'
import { listAgreementProponentTypes } from './agreement-proponent-type'

export const profileConditionLabels = {
  agreement_subtype: { name_en: 'Agreement subtype', name_fr: 'Sous-type d’entente' },
  holdback_basis: { name_en: 'Holdback basis', name_fr: 'Base de retenue' },
  further_distribution: { name_en: 'Further distribution', name_fr: 'Redistribution' },
  proponent_type: { name_en: 'Agreement–Proponent relationship type', name_fr: 'Type de relation entre l’entente et le promoteur' }
}
export const readWorkflowProfileChoices = async (db: Kysely<Database>, streamId: string) => {
  const subtypes = await db.selectFrom('Transfer_Payment_Agreement_Subtype as s')
    .innerJoin('Agency_Agreement_Type as t', 't.id', 's.egcs_tp_agreementtype')
    .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 's.egcs_tp_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile as p', 'p.id', 'stream.egcs_tp_transferpaymentprofile')
    .where('s.egcs_tp_transferpaymentstream', '=', streamId)
    .whereRef('t.egcs_ay_organizationagency', '=', 'p.egcs_tp_agency')
    .where('s._deleted', '=', false).where('t._deleted', '=', false)
    .select(['s.id', 't.egcs_ay_name_en as name_en', 't.egcs_ay_name_fr as name_fr']).orderBy('s.id').forShare(['s', 't']).execute()
  const bases = await db.selectFrom('Transfer_Payment_Stream_Holdback_Basis as b')
    .innerJoin('Agency_Holdback_Basis as t', 't.id', 'b.egcs_tp_agencyholdback')
    .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'b.egcs_tp_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile as p', 'p.id', 'stream.egcs_tp_transferpaymentprofile')
    .where('b.egcs_tp_transferpaymentstream', '=', streamId)
    .whereRef('t.egcs_ay_organizationagency', '=', 'p.egcs_tp_agency')
    .where('b._deleted', '=', false).where('t._deleted', '=', false)
    .select(['b.id', 'b.egcs_tp_name_en as name_en', 'b.egcs_tp_name_fr as name_fr']).orderBy('b.id').forShare(['b', 't']).execute()
  const proponents = await listAgreementProponentTypes(db, streamId, { lockForAuthoring: true })
  return {
    agreement_subtype: subtypes.map(row => ({ ...row, id: String(row.id) })),
    holdback_basis: bases.map(row => ({ ...row, id: String(row.id) })),
    proponent_type: proponents.map(row => ({ id: row.id, name_en: row.egcs_ay_name_en, name_fr: row.egcs_ay_name_fr }))
  }
}
export const resolveWorkflowProfileCondition = (condition: AgreementProfileCondition, choices: Awaited<ReturnType<typeof readWorkflowProfileChoices>>) => {
  const options = condition.source === 'further_distribution'
    ? [{ id: String(condition.value), name_en: condition.value ? 'Yes' : 'No', name_fr: condition.value ? 'Oui' : 'Non' }]
    : condition.optionIds.map(id => {
        const option = choices[condition.source].find(item => item.id === id)
        if (!option) throw new Error('Workflow profile selection is unavailable')
        return option
      })
  return { ...condition, ...profileConditionLabels[condition.source], options }
}
