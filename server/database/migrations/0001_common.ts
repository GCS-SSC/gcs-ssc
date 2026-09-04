import type { Kysely, SqlBool } from 'kysely'
import { sql } from 'kysely'
import type { Database } from '../../../shared/types/database'
import {
  AMENDED_TYPE_ENUM,
  AGREEMENT_APPLICANT_RECIPIENT_TYPE_ENUM,
  AGREEMENT_TYPE_ENUM,
  APPLICANT_RECIPIENT_TYPE_ENUM,
  COUNTRIES_ENUM,
  CURRENCY_CODES_ENUM,
  DECISION_TYPES_ENUM,
  FOLLOW_UP_STATUS_ENUM,
  JURISDICTION_ENUM,
  LANGUAGE_PREFERENCE_ENUM,
  PAYMENT_TYPE_ENUM
} from '../../../shared/constants/enums.js'

const VERSION_TYPE = sql`numeric(10,2)`
const COORDINATE_TYPE = sql`numeric(10,7)`

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS citext`.execute(db)
  await sql`CREATE TYPE Agreement_Applicant_Recipient_Type AS ENUM (${sql.join(AGREEMENT_APPLICANT_RECIPIENT_TYPE_ENUM.map(val => sql.lit(val)))})`.execute(
    db
  )
  await sql`CREATE TYPE Decision_Type AS ENUM (${sql.join(DECISION_TYPES_ENUM.map(val => sql.lit(val)))})`.execute(db)
  await sql`CREATE TYPE Amended_Type AS ENUM (${sql.join(AMENDED_TYPE_ENUM.map(val => sql.lit(val)))})`.execute(db)
  await sql`CREATE TYPE Agreement_Type AS ENUM (${sql.join(AGREEMENT_TYPE_ENUM.map(val => sql.lit(val)))})`.execute(db)
  await sql`CREATE TYPE Applicant_Recipient_Type AS ENUM (${sql.join(APPLICANT_RECIPIENT_TYPE_ENUM.map(val => sql.lit(val)))})`.execute(
    db
  )
  await sql`CREATE TYPE Payment_Type AS ENUM (${sql.join(PAYMENT_TYPE_ENUM.map(val => sql.lit(val)))})`.execute(db)
  await sql`CREATE TYPE Follow_Up_Status AS ENUM (${sql.join(FOLLOW_UP_STATUS_ENUM.map(val => sql.lit(val)))})`.execute(
    db
  )
  await sql`CREATE TYPE Language_Preference AS ENUM (${sql.join(LANGUAGE_PREFERENCE_ENUM.map(val => sql.lit(val)))})`.execute(
    db
  )
  await sql`CREATE TYPE Jurisdiction AS ENUM (${sql.join(JURISDICTION_ENUM.map(val => sql.lit(val)))})`.execute(db)
  await sql`CREATE TYPE Currency_Codes AS ENUM (${sql.join(CURRENCY_CODES_ENUM.map(val => sql.lit(val)))})`.execute(db)
  await sql`CREATE TYPE Countries AS ENUM (${sql.join(COUNTRIES_ENUM.map(val => sql.lit(val)))})`.execute(db)

  await db.schema
    .createTable('Common_Contact')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_cn_title', 'varchar(255)')
    .addColumn('egcs_cn_name', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_cn_businessphone', 'bigint')
    .addColumn('egcs_cn_businessphoneextension', 'bigint')
    .addColumn('egcs_cn_generallanguagepreference', sql`Language_Preference`, col => col.notNull())
    .addColumn('egcs_cn_jobtitle_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_cn_jobtitle_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_cn_primaryaccount', 'boolean', col => col.notNull())
    .addColumn('egcs_cn_email', sql`citext`, col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createIndex('cn_idx_contactemail')
    .on('Common_Contact')
    .column('egcs_cn_email')
    .where(sql<SqlBool>`_deleted = false`)
    .unique()
    .execute()

  await db.schema
    .createTable('Common_Address')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_cn_federalridingid', 'integer', col => col.notNull())
    .addColumn('egcs_cn_addresscity', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_cn_addresscountry', sql`Countries`, col => col.notNull())
    .addColumn('egcs_cn_addresssubdivision', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_cn_gc_addressid', 'bigint')
    .addColumn('egcs_cn_latitude', COORDINATE_TYPE)
    .addColumn('egcs_cn_longitude', COORDINATE_TYPE)
    .addColumn('egcs_cn_mainphone', 'bigint', col => col.notNull())
    .addColumn('egcs_cn_mainphoneextension', 'smallint')
    .addColumn('egcs_cn_postalcodezipcode', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_cn_street1', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_cn_street2', 'varchar(255)')
    .addColumn('egcs_cn_street3', 'varchar(255)')
    .addCheckConstraint(
      'cn_chk_addressaddresscountryaddresssubdivision',
      sql`(egcs_cn_addresscountry = 'ca' AND egcs_cn_addresssubdivision::text = ANY(enum_range(NULL::Jurisdiction)::text[])) OR (egcs_cn_addresscountry <> 'ca')`
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await db.schema
    .createTable('Common_Approval_Template')
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_cn_description_en', 'text', col => col.notNull())
    .addColumn('egcs_cn_description_fr', 'text', col => col.notNull())
    .addColumn('egcs_cn_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_cn_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex('cn_idx_contactemail').execute()
  await db.schema.dropTable('Common_Approval_Template').execute()
  await db.schema.dropTable('Common_Address').execute()
  await db.schema.dropTable('Common_Contact').execute()

  await sql`DROP TYPE Countries`.execute(db)
  await sql`DROP TYPE Currency_Codes`.execute(db)
  await sql`DROP TYPE Jurisdiction`.execute(db)
  await sql`DROP TYPE Follow_Up_Status`.execute(db)
  await sql`DROP TYPE Language_Preference`.execute(db)
  await sql`DROP TYPE Payment_Type`.execute(db)
  await sql`DROP TYPE Applicant_Recipient_Type`.execute(db)
  await sql`DROP TYPE Agreement_Type`.execute(db)
  await sql`DROP TYPE Amended_Type`.execute(db)
  await sql`DROP TYPE Decision_Type`.execute(db)
  await sql`DROP TYPE Agreement_Applicant_Recipient_Type`.execute(db)
}
