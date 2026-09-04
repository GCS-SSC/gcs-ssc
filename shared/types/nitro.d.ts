import type { Database } from '~~/shared/types/database.d.ts'
import type {
  GcsExtensionAgreementDeleteGuardHookPayload,
  GcsExtensionAgreementAccess,
  GcsExtensionAgreementLifecycleLockHookPayload,
  GcsExtensionAgreementStreamChangeGuardHookPayload,
  GcsExtensionAgreementPaymentMutationGuardHookPayload,
  GcsExtensionConfigurationGuardHookPayload,
  GcsExtensionCreateOperationHookPayload,
  GcsExtensionDisableGuardHookPayload,
  GcsExtensionStatusReferenceGuardHookPayload
} from '@gcs-ssc/extensions/server'
import type { Session } from 'better-auth'
import type { Kysely, Transaction } from 'kysely'
import type { H3Event } from 'h3'
import type { CompletionHookPayload } from '~~/shared/types/completion'
import type { AuthContext } from '~~/server/utils/authorize'
import type { StatusCatalogService } from '~~/server/utils/status-catalog'
import type {
  ApplicantRecipientProfilePatch,
  FundingCaseAgreementProfile,
  FundingCaseAgreementProfilePatch,
  FundingCaseAgreementProfileItem
} from '~~/shared/types/schemas'

declare module 'h3' {
  interface H3EventContext {
    $db: Kysely<Database>
    $statusCatalog: StatusCatalogService
    $authContext?: AuthContext
    $authorization: {
      resolveServerUser: () => Promise<Session | null>
    }
    $roleMap: Map<number, string[]>
    $adminRole: number | undefined
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    'common:completion:completed': (payload: CompletionHookPayload) => void | Promise<void>
    'gcs:extension:create-operation': (payload: GcsExtensionCreateOperationHookPayload) => void | Promise<void>
    'gcs:extension:disable-guard': (payload: GcsExtensionDisableGuardHookPayload) => void | Promise<void>
    'gcs:extension:configuration-guard': (
      payload: GcsExtensionConfigurationGuardHookPayload
    ) => void | Promise<void>
    'gcs:extension:status-reference-guard': (
      payload: GcsExtensionStatusReferenceGuardHookPayload
    ) => void | Promise<void>
    'gcs:extension:enable-guard': (payload: {
      extensionKey: string
      scope: 'agency' | 'stream'
      event: H3Event
      db: Transaction<Database>
      agencyId: string
      streamId?: string
    }) => void | Promise<void>
    'gcs:extension:agreement-lifecycle-lock': (
      payload: GcsExtensionAgreementLifecycleLockHookPayload
    ) => void | Promise<void>
    'gcs:extension:agreement-stream-change-guard': (
      payload: GcsExtensionAgreementStreamChangeGuardHookPayload
    ) => void | Promise<void>
    'gcs:extension:agreement-payment-mutation-guard': (
      payload: GcsExtensionAgreementPaymentMutationGuardHookPayload
    ) => void | Promise<void>
    'gcs:extension:agreement-delete-guard': (
      payload: GcsExtensionAgreementDeleteGuardHookPayload
    ) => void | Promise<void>
    'agreement:profile:created': (payload: {
      event: H3Event
      db: Transaction<Database>
      agreementId: string
      streamId: string
      rawBody: Record<string, unknown>
      validatedBody: FundingCaseAgreementProfile
      createdAgreement: FundingCaseAgreementProfileItem
    }) => void | Promise<void>
    'agreement:profile:updated': (payload: {
      event: H3Event
      db: Kysely<Database>
      agreementId: string
      streamId: string
      rawBody: Record<string, unknown>
      validatedBody: FundingCaseAgreementProfilePatch
      updatedAgreement: FundingCaseAgreementProfileItem
    }) => void | Promise<void>
    'applicantrecipient:profile:updated': (payload: {
      signal: AbortSignal
      event: H3Event
      db: Transaction<Database>
      agreementAccess: GcsExtensionAgreementAccess
      applicantRecipientId: string
      agencyId: string
      rawBody: Record<string, unknown>
      validatedBody: ApplicantRecipientProfilePatch
      updatedProfile: Record<string, unknown>
    }) => void | Promise<void>
  }
}
