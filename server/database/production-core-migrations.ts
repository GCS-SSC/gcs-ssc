import type { Migration, MigrationProvider } from 'kysely'
import * as commonMigration from './migrations/0001_common'
import * as usersMigration from './migrations/0002_users'
import * as rbacMigration from './migrations/0003_rbac'
import * as agencyMigration from './migrations/0004_agency'
import * as commonAgencyMigration from './migrations/0005_common_agency'
import * as transferPaymentMigration from './migrations/0006_transfer_payment'
import * as polymorphicCommonTransferPaymentMigration from './migrations/0007_polymorphic_common_tp'
import * as applicantRecipientMigration from './migrations/0008_applicant_recipient'
import * as fundingCaseAgreementMigration from './migrations/0009_funding_case_agreement'
import * as extensionsMigration from './migrations/0010_extensions'
import * as storageCleanupOutboxMigration from './migrations/0011_storage_cleanup_outbox'
import * as recommendationRevisionMigration from './migrations/0012_recommendation_revision'

import * as auditMigration from './migrations/0013_audit'

import * as programTermsLinksMigration from './migrations/0014_program_terms_links'

import * as costCategoryAvailabilityMigration from './migrations/0015_cost_category_availability'

import * as agencyAuditMigration from './migrations/0016_agency_audit'

import * as customFieldNamespacesMigration from './migrations/0017_custom_field_namespaces'

import * as agreementProponentTypeMigration from './migrations/0018_agreement_proponent_type'

import * as proponentTypeCleanupMigration from './migrations/9999_z_proponent_type_cleanup'

import * as workflowProfileConditionsMigration from './migrations/9999_zz_workflow_profile_conditions'

export const productionCoreMigrations = {
  '0001_common': commonMigration,
  '0002_users': usersMigration,
  '0003_rbac': rbacMigration,
  '0004_agency': agencyMigration,
  '0005_common_agency': commonAgencyMigration,
  '0006_transfer_payment': transferPaymentMigration,
  '0007_polymorphic_common_tp': polymorphicCommonTransferPaymentMigration,
  '0008_applicant_recipient': applicantRecipientMigration,
  '0009_funding_case_agreement': fundingCaseAgreementMigration,
  '0010_extensions': extensionsMigration,
  '0011_storage_cleanup_outbox': storageCleanupOutboxMigration,
  '0012_recommendation_revision': recommendationRevisionMigration,
  '0013_audit': auditMigration,
  '0014_program_terms_links': programTermsLinksMigration,
  '0015_cost_category_availability': costCategoryAvailabilityMigration,
  '0016_agency_audit': agencyAuditMigration,
  '0017_custom_field_namespaces': customFieldNamespacesMigration,
  '0018_agreement_proponent_type': agreementProponentTypeMigration,
  '9999_z_proponent_type_cleanup': proponentTypeCleanupMigration,
  '9999_zz_workflow_profile_conditions': workflowProfileConditionsMigration
} satisfies Record<string, Migration>

export const productionCoreMigrationProvider: MigrationProvider = {
  getMigrations: async () => productionCoreMigrations
}
