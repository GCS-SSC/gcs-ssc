import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { Database } from '../../../shared/types/database'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.createTable('Applicant_Recipient_Note')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_ar_applicantrecipient', 'bigint', col => col.notNull().references('Applicant_Recipient_Profile.id').onDelete('restrict'))
    .addColumn('egcs_ar_agency', 'bigint', col => col.notNull().references('Agency_Profile.id').onDelete('restrict'))
    .addColumn('egcs_ar_subject_en', 'varchar(255)')
    .addColumn('egcs_ar_subject_fr', 'varchar(255)')
    .addColumn('egcs_ar_body_en', 'text')
    .addColumn('egcs_ar_body_fr', 'text')
    .addColumn('egcs_ar_createdby', 'bigint', col => col.notNull().references('Common_User.id').onDelete('restrict'))
    .addColumn('egcs_ar_updatedby', 'bigint', col => col.notNull().references('Common_User.id').onDelete('restrict'))
    .addColumn('egcs_ar_createdat', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('egcs_ar_updatedat', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('_deleted', 'boolean', col => col.notNull().defaultTo(false))
    .addCheckConstraint('ar_chk_note_subject_language', sql`NULLIF(BTRIM(egcs_ar_subject_en), '') IS NOT NULL OR NULLIF(BTRIM(egcs_ar_subject_fr), '') IS NOT NULL`)
    .addCheckConstraint('ar_chk_note_body_language', sql`NULLIF(BTRIM(egcs_ar_body_en), '') IS NOT NULL OR NULLIF(BTRIM(egcs_ar_body_fr), '') IS NOT NULL`)
    .execute()
  await db.schema.createIndex('ar_idx_note_parent_agency').on('Applicant_Recipient_Note')
    .columns(['egcs_ar_applicantrecipient', 'egcs_ar_agency'])
    .execute()

  await db.schema.createTable('Funding_Case_Agreement_Note')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_fc_fundingagreement', 'bigint', col => col.notNull().references('Funding_Case_Agreement_Profile.id').onDelete('restrict'))
    .addColumn('egcs_fc_subject_en', 'varchar(255)')
    .addColumn('egcs_fc_subject_fr', 'varchar(255)')
    .addColumn('egcs_fc_body_en', 'text')
    .addColumn('egcs_fc_body_fr', 'text')
    .addColumn('egcs_fc_createdby', 'bigint', col => col.notNull().references('Common_User.id').onDelete('restrict'))
    .addColumn('egcs_fc_updatedby', 'bigint', col => col.notNull().references('Common_User.id').onDelete('restrict'))
    .addColumn('egcs_fc_createdat', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('egcs_fc_updatedat', 'timestamptz', col => col.notNull().defaultTo(sql`now()`))
    .addColumn('_deleted', 'boolean', col => col.notNull().defaultTo(false))
    .addCheckConstraint('fc_chk_note_subject_language', sql`NULLIF(BTRIM(egcs_fc_subject_en), '') IS NOT NULL OR NULLIF(BTRIM(egcs_fc_subject_fr), '') IS NOT NULL`)
    .addCheckConstraint('fc_chk_note_body_language', sql`NULLIF(BTRIM(egcs_fc_body_en), '') IS NOT NULL OR NULLIF(BTRIM(egcs_fc_body_fr), '') IS NOT NULL`)
    .execute()
  await db.schema.createIndex('fc_idx_note_parent').on('Funding_Case_Agreement_Note')
    .column('egcs_fc_fundingagreement').execute()
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  await db.schema.dropTable('Funding_Case_Agreement_Note').execute()
  await db.schema.dropTable('Applicant_Recipient_Note').execute()
}
