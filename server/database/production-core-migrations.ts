import type { Migration, MigrationProvider } from 'kysely'
import * as enums from './migrations/0010_enums'
import * as users from './migrations/0020_users'
import * as rbac from './migrations/0030_rbac'
import * as agency from './migrations/0040_agency'
import * as common from './migrations/0050_common'
import * as transfer_payment from './migrations/0060_transfer_payment'
import * as applicant_recipient from './migrations/0070_applicant_recipient'
import * as funding_opportunity from './migrations/0080_funding_opportunity'
import * as funding_case_agreement from './migrations/0090_funding_case_agreement'
import * as funding_case_intake from './migrations/0100_funding_case_intake'
import * as extensions from './migrations/0110_extensions'
import * as storage from './migrations/0120_storage'
import * as l1_queue from './migrations/0125_l1_queue'
import * as integrity from './migrations/0130_integrity'
import * as audit from './migrations/0140_audit'

export const productionCoreMigrations = {
  '0010_enums': enums,
  '0020_users': users,
  '0030_rbac': rbac,
  '0040_agency': agency,
  '0050_common': common,
  '0060_transfer_payment': transfer_payment,
  '0070_applicant_recipient': applicant_recipient,
  '0080_funding_opportunity': funding_opportunity,
  '0090_funding_case_agreement': funding_case_agreement,
  '0100_funding_case_intake': funding_case_intake,
  '0110_extensions': extensions,
  '0120_storage': storage,
  '0125_l1_queue': l1_queue,
  '0130_integrity': integrity,
  '0140_audit': audit
} satisfies Record<string, Migration>

export const productionCoreMigrationProvider: MigrationProvider = {
  getMigrations: async () => productionCoreMigrations
}
