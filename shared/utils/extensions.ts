import type {
  GcsClientExtensionManifest,
  GcsExtensionEntityTabTarget,
  GcsExtensionHostCapability,
  GcsRegisteredFileStorageProviderDefinition,
  GcsRegisteredExtensionLifecycleEntityDefinition,
  GcsExtensionServerHandlerDefinition
} from '@gcs-ssc/extensions'

export const EXTENSION_ENTITY_AUTHORIZATION_SUBJECTS = {
  agreement: 'agreement',
  proponent: 'applicant_recipient',
  claim: 'agreement',
  monitor: 'agreement'
} as const satisfies Record<GcsExtensionEntityTabTarget, 'agreement' | 'applicant_recipient'>

/**
 * Returns the authorization domain that owns an extension entity target.
 *
 * @param target - Extension entity target to resolve.
 * @returns Canonical authorization subject for the target.
 */
export const getExtensionEntityAuthorizationSubject = (
  target: GcsExtensionEntityTabTarget
): 'agreement' | 'applicant_recipient' => EXTENSION_ENTITY_AUTHORIZATION_SUBJECTS[target]

export type GcsRegisteredExtensionServerHandler = Omit<GcsExtensionServerHandlerDefinition, 'path'> & {
  id: string
}

export interface GcsRegisteredExtensionMigration {
  id: string
  key: string
}

export interface GcsRegisteredExtensionRuntime {
  id: string
}

/**
 * Build-generated server metadata. Filesystem paths and build-only
 * contributions deliberately never cross this runtime boundary.
 */
export interface GcsRegisteredExtension extends GcsClientExtensionManifest {
  packageName: string
  requiredHostCapabilities: GcsExtensionHostCapability[]
  serverHandlers: GcsRegisteredExtensionServerHandler[]
  migrations: GcsRegisteredExtensionMigration[]
  entities?: GcsRegisteredExtensionLifecycleEntityDefinition[]
  runtime?: GcsRegisteredExtensionRuntime
  fileStorageProvider?: GcsRegisteredFileStorageProviderDefinition
}

export type {
  GcsExtensionAssetDefinition,
  GcsClientExtensionManifest,
  GcsExtensionComponentDefinition,
  GcsExtensionCreateActionDefinition,
  GcsExtensionCreateActionMode,
  GcsExtensionCreateOperation,
  GcsExtensionDefinition,
  GcsExtensionEntityTabDefinition,
  GcsExtensionEntityTabTarget,
  GcsExtensionHostCapability,
  GcsFileStorageMetadataContributionDefinition,
  GcsFileStorageProviderDefinition,
  GcsRegisteredFileStorageProviderDefinition,
  GcsResolvedFileStorageProviderDefinition,
  GcsExtensionJsonConfig,
  GcsExtensionLifecycleEntityDefinition,
  GcsExtensionMigrationDefinition,
  GcsExtensionPaymentAmountCalculatorDefinition,
  GcsExtensionRbacAction,
  GcsExtensionRbacRequirement,
  GcsExtensionRbacSubject,
  GcsExtensionRuntimeContext,
  GcsExtensionRuntimeHostContext,
  GcsExtensionRuntimeResolution,
  GcsExtensionRuntimeResolver,
  GcsExtensionRuntimeResolverDefinition,
  GcsLifecycleEntityAssignmentMode,
  GcsLifecycleEntityApprovalSubmissionCapability,
  GcsLifecycleEntityCompletionCapability,
  GcsLifecycleEntityOwnerKind,
  GcsLifecycleEntityStandardWorkflowCapability,
  GcsQualifiedExtensionEntityType,
  GcsRegisteredExtensionLifecycleEntityDefinition,
  GcsResolvedExtensionLifecycleEntityDefinition,
  GcsExtensionServerHandlerDefinition,
  GcsExtensionSlot,
  GcsExtensionSlotContext,
  GcsExtensionSlotDefinition,
  GcsTextareaExtensionContext,
  GcsTextareaKnownTargetKey,
  GcsTextareaTargetContext,
  GcsTextareaTargetDefinition,
  GcsTextareaTargetKey,
  GcsTextareaTargetLocale,
  GcsResolvedExtension,
  ExtensionEntityTabContext,
  ExtensionEntityOwnerType,
  ExtensionScope
} from '@gcs-ssc/extensions'

export { defineGcsExtension, GCS_EXTENSION_SDK_VERSION, GCS_TEXTAREA_TARGETS } from '@gcs-ssc/extensions'
