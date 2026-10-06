import type { Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'
import * as rbac from './0030_rbac'
import * as agency from './0040_agency'
import * as common from './0050_common'
import * as transfer_payment from './0060_transfer_payment'
import * as applicant_recipient from './0070_applicant_recipient'
import * as funding_opportunity from './0080_funding_opportunity'
import * as funding_case_agreement from './0090_funding_case_agreement'
import * as funding_case_intake from './0100_funding_case_intake'
import * as extensions from './0110_extensions'
import * as storage from './0120_storage'

type Subject = {
  up: (db: Kysely<Database>) => Promise<void>
  installFunctions?: (db: Kysely<Database>) => Promise<void>
  installForeignKeys?: (db: Kysely<Database>) => Promise<void>
  installTriggers?: (db: Kysely<Database>) => Promise<void>
}

const subjects: Subject[] = [rbac, agency, common, transfer_payment, applicant_recipient, funding_opportunity, funding_case_agreement, funding_case_intake, extensions, storage]

/** Installs subject-owned relationships after every referenced table exists. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  for (const subject of subjects) {
    if (subject.installFunctions) await subject.installFunctions(db)
  }
  for (const subject of subjects) {
    if (subject.installForeignKeys) await subject.installForeignKeys(db)
  }
  for (const subject of subjects) {
    if (subject.installTriggers) await subject.installTriggers(db)
  }
}
