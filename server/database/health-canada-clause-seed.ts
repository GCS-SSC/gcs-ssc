import { sql, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { PublishedAgencyClauseSchema } from '~~/shared/types/schemas/agency-clause'
import { publishDefinition } from '../utils/system-publication'

const agencyId = '30021'
const streamId = '30118'

const clauses = [
  {
    code: 'annual_progress_reporting',
    nameEn: 'Annual progress reporting',
    nameFr: 'Rapport annuel sur les progrès',
    descriptionEn: 'Demonstration wording for reporting on funded activities.',
    descriptionFr: 'Texte de démonstration pour rendre compte des activités financées.',
    textEn: 'The Recipient will submit an annual report describing funded activities and progress toward the expected results.',
    textFr: 'Le bénéficiaire soumettra un rapport annuel décrivant les activités financées et les progrès réalisés vers les résultats attendus.'
  },
  {
    code: 'financial_records',
    nameEn: 'Financial records',
    nameFr: 'Registres financiers',
    descriptionEn: 'Demonstration wording for documenting eligible expenditures.',
    descriptionFr: 'Texte de démonstration pour documenter les dépenses admissibles.',
    textEn: 'The Recipient will keep financial records and supporting documents for expenditures claimed under this Agreement.',
    textFr: 'Le bénéficiaire conservera les registres financiers et les pièces justificatives des dépenses réclamées au titre de la présente entente.'
  }
]

/**
 * Publishes bilingual demo clauses for Health Canada and makes them available on its oral health Stream.
 * @param db The final demo seed transaction.
 */
export const seedHealthCanadaClauses = async (db: Transaction<Database>): Promise<void> => {
  const actor = await db.selectFrom('Common_User').select('id')
    .where('egcs_cn_email', '=', 'root@example.com').where('_deleted', '=', false).executeTakeFirstOrThrow()
  await sql`SET CONSTRAINTS trg_require_publication_transition DEFERRED`.execute(db)
  for (const { code, nameEn, nameFr, descriptionEn, descriptionFr, textEn, textFr } of clauses) {
    const clause = await db.insertInto('Agency_Clause').values({
      egcs_ay_organizationagency: agencyId,
      egcs_ay_languageindependentcode: code,
      egcs_ay_name_en: nameEn,
      egcs_ay_name_fr: nameFr,
      egcs_ay_description_en: descriptionEn,
      egcs_ay_description_fr: descriptionFr,
      egcs_ay_active: true
    }).returning('id').executeTakeFirstOrThrow()
    const displayOrder = 1
    await db.insertInto('Agency_Clause_Text').values({
      egcs_ay_clause: clause.id,
      egcs_ay_clause_en: textEn,
      egcs_ay_clause_fr: textFr,
      egcs_ay_displayorder: displayOrder
    }).execute()
    const definition = PublishedAgencyClauseSchema.parse({
      kind: 'agency_clause', clauseId: clause.id, agencyId, code, nameEn, nameFr, descriptionEn, descriptionFr,
      rows: [{ textEn, textFr, displayOrder }]
    })
    await publishDefinition(db, { publicationId: clause.id, kind: 'agency_clause', definition, actorId: actor.id })
    await db.insertInto('Transfer_Payment_Stream_Clause').values({
      egcs_tp_transferpaymentstream: streamId, egcs_tp_clause: clause.id
    }).execute()
  }
  await sql`SET CONSTRAINTS trg_require_publication_transition IMMEDIATE`.execute(db)
}
