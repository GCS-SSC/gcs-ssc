import type { Migration, MigrationProvider } from 'kysely'
import * as commonMigration from './migrations/0010_common'
import * as usersMigration from './migrations/0020_users'
import * as rbacMigration from './migrations/0030_rbac'
import * as agencyMigration from './migrations/0040_agency'
import * as commonAgencyMigration from './migrations/0050_common_agency'
import * as transferPaymentMigration from './migrations/0060_transfer_payment'
import * as polymorphicCommonTransferPaymentMigration from './migrations/0070_polymorphic_common_tp'
import * as applicantRecipientMigration from './migrations/0080_applicant_recipient'
import * as fundingCaseAgreementMigration from './migrations/0090_funding_case_agreement'
import * as extensionsMigration from './migrations/0100_extensions'
import * as storageCleanupOutboxMigration from './migrations/0110_storage_cleanup_outbox'
import * as auditMigration from './migrations/0120_audit'
import * as notesMigration from './migrations/0130_notes'
import * as administrativeGroupsMigration from './migrations/0140_administrative_groups'
import * as fundingOpportunityIntakeMigration from './migrations/0150_funding_opportunity_intake'
import * as fundingCaseExternalContractMigration from './migrations/0160_funding_case_external_contract'
import * as fundingCaseGroupAssignmentMigration from './migrations/0170_funding_case_group_assignment'
import * as fundingOpportunityStreamsMigration from './migrations/0180_funding_opportunity_streams'
import * as fundingOpportunityAttachmentTypesMigration from './migrations/0190_funding_opportunity_attachment_types'
import * as fundingOpportunityAgencyStatusMigration from './migrations/0200_funding_opportunity_agency_status'
import * as monitorLinksMigration from './migrations/0210_monitor_links'
import * as intakeRegistryIdentityMigration from './migrations/0230_intake_registry_identity'
import * as fundingSourcesMigration from './migrations/0220_funding_sources'

import * as journalVoucherMigration from './migrations/0250_journal_vouchers'

export const productionCoreMigrations = {
  '0010_common': commonMigration,
  '0020_users': usersMigration,
  '0030_rbac': rbacMigration,
  '0040_agency': agencyMigration,
  '0050_common_agency': commonAgencyMigration,
  '0060_transfer_payment': transferPaymentMigration,
  '0070_polymorphic_common_tp': polymorphicCommonTransferPaymentMigration,
  '0080_applicant_recipient': applicantRecipientMigration,
  '0090_funding_case_agreement': fundingCaseAgreementMigration,
  '0100_extensions': extensionsMigration,
  '0110_storage_cleanup_outbox': storageCleanupOutboxMigration,
  '0120_audit': auditMigration,
  '0130_notes': notesMigration,
  '0140_administrative_groups': administrativeGroupsMigration,
  '0150_funding_opportunity_intake': fundingOpportunityIntakeMigration,
  '0160_funding_case_external_contract': fundingCaseExternalContractMigration,
  '0170_funding_case_group_assignment': fundingCaseGroupAssignmentMigration,
  '0180_funding_opportunity_streams': fundingOpportunityStreamsMigration,
  '0190_funding_opportunity_attachment_types': fundingOpportunityAttachmentTypesMigration,
  '0200_funding_opportunity_agency_status': fundingOpportunityAgencyStatusMigration,
  '0210_monitor_links': monitorLinksMigration,
  '0220_funding_sources': fundingSourcesMigration,
  '0230_intake_registry_identity': intakeRegistryIdentityMigration,
  '0250_journal_vouchers': journalVoucherMigration
} satisfies Record<string, Migration>

export const productionCoreMigrationProvider: MigrationProvider = {
  getMigrations: async () => productionCoreMigrations
}
