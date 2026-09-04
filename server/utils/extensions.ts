/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Temporary coverage while extension runtime APIs receive complete documentation. */
import { createHash } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import {
  GCS_EXTENSION_AGREEMENT_DELETE_GUARD_HOOK,
  GCS_EXTENSION_AGREEMENT_LIFECYCLE_LOCK_HOOK,
  GCS_EXTENSION_AGREEMENT_STREAM_CHANGE_GUARD_HOOK,
  GCS_EXTENSION_AGREEMENT_PAYMENT_MUTATION_GUARD_HOOK,
  GCS_EXTENSION_CREATE_OPERATION_HOOK,
  GCS_EXTENSION_DISABLE_GUARD_HOOK,
  GCS_EXTENSION_CONFIGURATION_GUARD_HOOK,
  GCS_EXTENSION_STATUS_REFERENCE_GUARD_HOOK,
  getEncryptedExtensionSecret,
  isGcsExtensionUserError,
  lockGcsExtensionLifecycleScope,
  resolveExtensionStreamContext as resolveSdkExtensionStreamContext,
  type GcsExtensionLifecycleEntityAdapter,
  type GcsFileStorageMetadataValidator,
  type GcsFileStorageProviderAdapter,
  type GcsFileStorageProviderManagedMetadataAdapter,
  type GcsFileStorageSecretReader,
  type GcsExtensionAgreementLifecycleLockHookPayload,
  type GcsExtensionAgreementDeleteGuardHookPayload,
  type GcsExtensionCreateOperationHookPayload,
  type GcsExtensionAgreementStreamChangeGuardHookPayload,
  type GcsExtensionAgreementPaymentMutationGuardHookPayload,
  type GcsExtensionDisableGuardContext,
  type GcsExtensionConfigurationGuardHookPayload,
  type GcsExtensionStatusReferenceGuardHookPayload,
  type ExtensionStreamContext,
  type ExtensionStreamContextDatabaseClient
} from '@gcs-ssc/extensions/server'
import { Migrator, sql, type Kysely, type Migration, type MigrationProvider, type MigrationResult, type Selectable, type Transaction } from 'kysely'
import {
  getGcsExtensionByKey,
  getGcsExtensions,
  loadGcsExtensionModule
} from '#gcs-extensions/server-registry'
import { canAccessAgreement, resolveAgreementScopeContext } from './agreement'
import { canAccessApplicantRecipient } from './applicant-recipient-auth'
import { resolveRequestLocale } from './request-locale'
import { resolveAgreementClaimRuntimeContext } from './agreement-claim'
import { resolveAgreementMonitorRuntimeContext } from './agreement-monitor'
import { badRequest, throwApiError } from './api-errors'
import type { AuthContext } from './authorize'
import type { Database, JsonValue } from '~~/shared/types/database'
import type {
  GcsClientExtensionManifest,
  GcsExtensionCreateOperation,
  GcsExtensionEntityTabTarget,
  GcsExtensionJsonConfig,
  GcsExtensionRbacRequirement,
  GcsExtensionRuntimeContext,
  GcsExtensionRuntimeHostContext,
  GcsExtensionRuntimeResolution,
  GcsRegisteredExtension,
  GcsRegisteredExtensionLifecycleEntityDefinition,
  GcsRegisteredExtensionServerHandler
} from '~~/shared/utils/extensions'
import type { AbilityAction, AbilitySubject } from '~~/shared/utils/abilities'
import type { Scope } from '~~/shared/utils/scopes'
import { getExtensionEntityAuthorizationSubject } from '~~/shared/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

declare const useNitroApp: typeof import('nitropack/runtime').useNitroApp

/** Loads a stream with its transfer payment and agency identifiers for extension scoping. */
export const resolveExtensionStreamContext = async (
  db: Kysely<Database>,
  streamId: string
): Promise<ExtensionStreamContext | null> => isPositivePostgresBigintText(streamId)
  ? await resolveSdkExtensionStreamContext(
      db as unknown as ExtensionStreamContextDatabaseClient,
      streamId
    )
  : null

type ExtensionEntityOwnerType =
  | 'fundingcaseagreement'
  | 'applicantrecipient'
  | 'fundingcaseagreementclaim'
  | 'fundingcaseagreementmonitor'

export interface ExtensionEntityContext {
  target: GcsExtensionEntityTabTarget
  agencyId: string
  streamId?: string
  agreementId?: string
  applicantRecipientId?: string
  claimId?: string
  monitorId?: string
  ownerType: ExtensionEntityOwnerType
  ownerId: string
  scope: Scope
}

export interface ExtensionCreateOperationAgreementContext {
  agreementId: string
  agencyId: string
  streamId: string
  scope: Scope
}

type ExtensionServerHandlerModule = {
  default?: (event: unknown) => unknown
}

type ExtensionRuntimeResolverModule = {
  default?: (
    host: GcsExtensionRuntimeHostContext,
    context: GcsExtensionRuntimeContext
  ) => Promise<GcsExtensionRuntimeResolution | null | undefined> | GcsExtensionRuntimeResolution | null | undefined
}

type ExtensionMigrationModule = Migration & {
  default?: Migration
}

type ExtensionLifecycleEntityAdapterModule = {
  default?: GcsExtensionLifecycleEntityAdapter
}

type FileStorageAdapterModule = { default?: GcsFileStorageProviderAdapter }
type FileStorageMetadataValidatorModule = { default?: GcsFileStorageMetadataValidator }

export interface LoadedFileStorageProvider {
  extension: GcsRegisteredExtension
  adapter: GcsFileStorageProviderAdapter
  metadataValidator?: GcsFileStorageMetadataValidator
}

const FILE_STORAGE_ADAPTER_METHODS = ['writeObject', 'readObject', 'deleteObject'] as const

/** Loads and validates a registered provider's server-only modules. */
export const loadFileStorageProvider = async (
  extensionKey: string
): Promise<LoadedFileStorageProvider | null> => {
  const extension = getGcsExtensionByKey(extensionKey)
  const contribution = extension?.fileStorageProvider
  if (!extension || !contribution) return null
  const loaded = await loadGcsExtensionModule(contribution.adapter.id) as FileStorageAdapterModule
  const adapter = loaded.default
  if (!adapter || typeof adapter !== 'object') {
    throw new Error(`File storage adapter for "${extensionKey}" is unavailable`)
  }
  for (const method of FILE_STORAGE_ADAPTER_METHODS) {
    if (typeof adapter[method] !== 'function') {
      throw new Error(`File storage adapter for "${extensionKey}" must export ${method}()`)
    }
  }
  const metadata = contribution.metadata
  if (metadata?.persistence === 'provider' && metadata.mutability === 'editable') {
    const editableAdapter = adapter as Partial<GcsFileStorageProviderManagedMetadataAdapter>
    if (typeof editableAdapter.readProviderMetadata !== 'function' || typeof editableAdapter.updateProviderMetadata !== 'function') {
      throw new Error(
        `File storage adapter for "${extensionKey}" requires readProviderMetadata() and updateProviderMetadata()`
      )
    }
  }
  let metadataValidator: GcsFileStorageMetadataValidator | undefined
  if (metadata) {
    const validatorModule = await loadGcsExtensionModule(metadata.validator.id) as FileStorageMetadataValidatorModule
    if (typeof validatorModule.default !== 'function') {
      throw new Error(`File storage metadata validator for "${extensionKey}" is unavailable`)
    }
    metadataValidator = validatorModule.default
  }
  return { extension, adapter, metadataValidator }
}

/** Fails startup when persisted storage state references a provider package that is no longer installed. */
export const assertReferencedFileStorageProvidersRegistered = async (db: Kysely<Database>): Promise<void> => {
  const extensions = await getRegisteredExtensions()
  const installed = new Set(extensions.filter(item => item.fileStorageProvider).map(item => item.key))
  const [attachments, selections] = await Promise.all([
    db.selectFrom('Common_Attachment').select('egcs_cn_provider').distinct()
      .where('_deleted', '=', false).execute(),
    db.selectFrom('extensions.agency_storage_selection').select('provider_key').distinct()
      .where('_deleted', '=', false).execute()
  ])
  const referenced = new Set([
    ...attachments.map(item => item.egcs_cn_provider),
    ...selections.map(item => item.provider_key)
  ])
  const missing = [...referenced].filter(key => !installed.has(key)).sort()
  if (missing.length > 0) {
    throw new Error(`Referenced file storage providers are not installed: ${missing.join(', ')}`)
  }
}

/** Creates a server-only encrypted secret reader scoped to one provider and agency. */
export const createFileStorageSecretReader = (
  db: Kysely<Database> | Transaction<Database>,
  extensionKey: string,
  agencyId: string,
  rootKey: string
): GcsFileStorageSecretReader => ({
  get: async key => await getEncryptedExtensionSecret(db, {
    extensionKey,
    ownerType: 'agency',
    ownerId: agencyId,
    secretKey: key,
    rootKey
  })
})

export type LoadedExtensionLifecycleEntity = {
  extension: GcsRegisteredExtension
  definition: GcsRegisteredExtensionLifecycleEntityDefinition
  adapter: GcsExtensionLifecycleEntityAdapter
}

type PersistedExtensionEntityType = Selectable<Database['Common_Entity_Type']>

const LIFECYCLE_ENTITY_ADAPTER_METHODS = [
  'registerIdentity',
  'resolveOwner',
  'resolveScope',
  'resolveStatus',
  'lockEntity',
  'validateCompletion',
  'mutateStatus'
] as const satisfies readonly (keyof GcsExtensionLifecycleEntityAdapter)[]

const extensionEntityTypeValues = (
  extensionKey: string,
  entity: GcsRegisteredExtensionLifecycleEntityDefinition
): PersistedExtensionEntityType => ({
  egcs_cn_type: entity.type,
  egcs_cn_extensionkey: extensionKey,
  egcs_cn_localtype: entity.localType,
  egcs_cn_label_en: entity.label.en,
  egcs_cn_label_fr: entity.label.fr,
  egcs_cn_completion: entity.completion,
  egcs_cn_approvalsubmission: entity.approvalSubmission,
  egcs_cn_standardworkflow: entity.standardWorkflow,
  egcs_cn_riskrating: 'none',
  egcs_cn_supportsdirectreviews: entity.supportsDirectReviews,
  egcs_cn_ownerkind: entity.ownerKind,
  egcs_cn_assignmentmode: entity.assignmentMode,
  _deleted: false
})

const assertExtensionEntityTypeMatches = (
  persisted: PersistedExtensionEntityType,
  expected: PersistedExtensionEntityType
): void => {
  for (const field of Object.keys(expected) as Array<keyof PersistedExtensionEntityType>) {
    if (persisted[field] !== expected[field]) {
      throw new Error(
        `Lifecycle entity type "${expected.egcs_cn_type}" conflicts with its persisted declaration at "${field}"`
      )
    }
  }
}

const assertLifecycleEntityAdapter = async (
  entity: GcsRegisteredExtensionLifecycleEntityDefinition
): Promise<void> => {
  const loaded = await loadGcsExtensionModule(entity.adapter.id) as ExtensionLifecycleEntityAdapterModule
  const adapter = loaded.default
  if (!adapter || typeof adapter !== 'object') {
    throw new Error(`Lifecycle entity adapter for "${entity.type}" is unavailable`)
  }
  for (const method of LIFECYCLE_ENTITY_ADAPTER_METHODS) {
    if (typeof adapter[method] !== 'function') {
      throw new Error(`Lifecycle entity adapter for "${entity.type}" must export ${method}()`)
    }
  }
  if (adapter.onPositiveTerminus !== undefined && typeof adapter.onPositiveTerminus !== 'function') {
    throw new Error(`Lifecycle entity adapter for "${entity.type}" has invalid onPositiveTerminus`)
  }
}

/** Loads the exact installed adapter for a qualified lifecycle entity type. */
export const loadExtensionLifecycleEntity = async (
  entityType: string
): Promise<LoadedExtensionLifecycleEntity | null> => {
  for (const extension of await getRegisteredExtensions()) {
    const definition = (extension.entities ?? []).find(entity => entity.type === entityType)
    if (!definition) continue
    const loaded = await loadGcsExtensionModule(definition.adapter.id) as ExtensionLifecycleEntityAdapterModule
    const adapter = loaded.default
    if (!adapter) throw new Error(`Lifecycle entity adapter for "${entityType}" is unavailable`)
    for (const method of LIFECYCLE_ENTITY_ADAPTER_METHODS) {
      if (typeof adapter[method] !== 'function') {
        throw new Error(`Lifecycle entity adapter for "${entityType}" must export ${method}()`)
      }
    }
    return { extension, definition, adapter }
  }
  return null
}

const hasLifecycleEntityTypeRegistry = async (db: Kysely<Database>): Promise<boolean> => {
  const registryAvailability = await sql<{ available: boolean }>`
    SELECT to_regclass('"Common_Entity_Type"') IS NOT NULL AS available
  `.execute(db)
  return registryAvailability.rows[0]?.available === true
}

/** Rejects persisted extension types that no installed manifest still declares. */
export const assertInstalledExtensionLifecycleEntityTypes = async (
  db: Kysely<Database>,
  extensions: GcsRegisteredExtension[]
): Promise<void> => {
  if (!await hasLifecycleEntityTypeRegistry(db)) {
    return
  }

  const expectedByType = new Map<string, PersistedExtensionEntityType>()
  const expectedLocalTypes = new Set<string>()
  for (const extension of extensions) {
    for (const entity of extension.entities ?? []) {
      const localIdentity = `${extension.key}:${entity.localType}`
      if (expectedByType.has(entity.type) || expectedLocalTypes.has(localIdentity)) {
        throw new Error(`Duplicate installed lifecycle entity declaration "${entity.type}"`)
      }
      expectedByType.set(entity.type, extensionEntityTypeValues(extension.key, entity))
      expectedLocalTypes.add(localIdentity)
    }
  }

  const persistedRows = await db
    .selectFrom('Common_Entity_Type')
    .selectAll()
    .where('egcs_cn_extensionkey', 'is not', null)
    .where('_deleted', '=', false)
    .execute() as PersistedExtensionEntityType[]
  for (const persisted of persistedRows) {
    const expected = expectedByType.get(persisted.egcs_cn_type)
    if (!expected) {
      throw new Error(
        `Persisted lifecycle entity type "${persisted.egcs_cn_type}" is unavailable; extension keys and local types cannot be renamed or removed`
      )
    }
    assertExtensionEntityTypeMatches(persisted, expected)
  }
}

class ExplicitExtensionMigrationProvider implements MigrationProvider {
  constructor(private readonly migrations: Array<{ id: string; key: string }>) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const resolved: Record<string, Migration> = {}

    for (const migration of this.migrations) {
      const loaded = await loadGcsExtensionModule(migration.id) as ExtensionMigrationModule
      const migrationModule = loaded.default ?? loaded
      if (typeof migrationModule.up !== 'function') {
        throw new Error(`Extension migration "${migration.key}" must export an up function`)
      }
      resolved[migration.key] = migrationModule
    }

    return resolved
  }
}

const extensionMigrationTableSuffix = (extensionKey: string): string => {
  const sanitizedPrefix = extensionKey.replaceAll('-', '_').replace(/[^a-z0-9_]/g, '').slice(0, 28)
  const hash = createHash('sha256').update(extensionKey).digest('hex').slice(0, 8)
  return `${sanitizedPrefix}_${hash}`
}

/** Reads the build-generated registry of validated extension metadata. */
export const getRegisteredExtensions = async (): Promise<GcsRegisteredExtension[]> =>
  getGcsExtensions()

/** Returns a registered extension or raises a stable not-found API error. */
export const requireRegisteredExtension = async (
  extensionKey: string
): Promise<GcsRegisteredExtension> => {
  const extension = getGcsExtensionByKey(extensionKey)
  if (!extension) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Extension not found',
      data: {
        code: 'EXTENSION_NOT_FOUND',
        message: 'apiErrors.extensions.not_found'
      }
    })
  }
  return extension
}

/** Removes server-only contributions before exposing an extension manifest to the client. */
export const toClientExtensionManifest = (
  extension: GcsRegisteredExtension
): GcsClientExtensionManifest => ({
  key: extension.key,
  name: extension.name,
  description: extension.description,
  sdkVersion: extension.sdkVersion,
  admin: extension.admin,
  client: extension.client,
  fileStorageProvider: extension.fileStorageProvider
    ? {
        ...(extension.fileStorageProvider.metadata
          ? {
              metadata: {
                persistence: extension.fileStorageProvider.metadata.persistence,
                mutability: extension.fileStorageProvider.metadata.mutability,
                contractVersion: extension.fileStorageProvider.metadata.contractVersion,
                component: extension.fileStorageProvider.metadata.component
              }
            }
          : {})
      }
    : undefined
})

export type ClientExtensionManifest = ReturnType<typeof toClientExtensionManifest>

/** Strips a matching extension API prefix or adds the namespace-relative leading slash. */
export const normalizeExtensionRoute = (extensionKey: string, route: string): string => {
  if (route.startsWith(`/api/extensions/${extensionKey}`)) {
    const relativeRoute = route.slice(`/api/extensions/${extensionKey}`.length)
    return relativeRoute.length > 0 ? relativeRoute : '/'
  }

  return route.startsWith('/') ? route : `/${route}`
}

/** Matches a normalized extension route and extracts its dynamic parameters. */
export const matchExtensionRoute = (
  extensionKey: string,
  routePattern: string,
  requestPath: string
): Record<string, string> | null => {
  const patternSegments = normalizeExtensionRoute(extensionKey, routePattern).split('/').filter(Boolean)
  const requestSegments = requestPath.split('/').filter(Boolean)

  if (patternSegments.length !== requestSegments.length) {
    return null
  }

  const params: Record<string, string> = {}

  for (const [index, patternSegment] of patternSegments.entries()) {
    const requestSegment = requestSegments[index]
    if (!requestSegment) {
      return null
    }

    if (patternSegment.startsWith('[') && patternSegment.endsWith(']')) {
      params[patternSegment.slice(1, -1)] = requestSegment
      continue
    }

    if (patternSegment !== requestSegment) {
      return null
    }
  }

  return params
}

/** Finds the first extension handler matching an HTTP method and normalized route. */
export const resolveExtensionServerHandler = async (
  extensionKey: string,
  method: string,
  requestPath: string
): Promise<{
  extension: GcsRegisteredExtension
  routeDefinition: GcsRegisteredExtensionServerHandler
  handler: (event: unknown) => unknown
  params: Record<string, string>
} | null> => {
  const extension = await requireRegisteredExtension(extensionKey)
  const normalizedMethod = method.toLowerCase()

  for (const routeDefinition of extension.serverHandlers) {
    if ((routeDefinition.method ?? 'get') !== normalizedMethod) {
      continue
    }

    const params = matchExtensionRoute(extensionKey, routeDefinition.route, requestPath)
    if (!params) {
      continue
    }

    const loaded = await loadGcsExtensionModule(routeDefinition.id) as ExtensionServerHandlerModule
    if (typeof loaded.default !== 'function') {
      throw createError({
        statusCode: 500,
        statusMessage: 'Extension server handler is invalid'
      })
    }

    return {
      extension,
      routeDefinition,
      handler: loaded.default,
      params
    }
  }

  return null
}

const extendEntityScope = (scope: Scope, type: string, id: string): Scope => {
  if (scope.type !== 'entity') {
    return scope
  }

  return {
    ...scope,
    path: [
      ...scope.path,
      { type, id }
    ]
  }
}

/** Loads applicant-recipient ownership identifiers used by extension authorization. */
const resolveApplicantRecipientExtensionContext = async (
  db: Kysely<Database>,
  applicantRecipientId: string
): Promise<ExtensionEntityContext | null> => {
  if (!isPositivePostgresBigintText(applicantRecipientId)) return null
  const row = await db
    .selectFrom('Applicant_Recipient_Profile')
    .select(['id', 'egcs_ar_leadagency'])
    .where('id', '=', applicantRecipientId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (!row?.id || !row.egcs_ar_leadagency) {
    return null
  }

  const agencyId = String(row.egcs_ar_leadagency)
  const ownerId = String(row.id)

  return {
    target: 'proponent',
    agencyId,
    applicantRecipientId: ownerId,
    ownerType: 'applicantrecipient',
    ownerId,
    scope: {
      type: 'entity',
      agencyId,
      path: [{ type: 'applicantrecipient', id: ownerId }]
    }
  }
}

/** Maps a supported entity type and identifier to its agency and optional stream scope. */
export const resolveExtensionEntityContext = async (
  db: Kysely<Database>,
  target: GcsExtensionEntityTabTarget,
  entityId: string
): Promise<ExtensionEntityContext | null> => {
  if (target === 'agreement') {
    const context = await resolveAgreementScopeContext(entityId, db)
    if (!context) return null
    return {
      target,
      agencyId: context.agencyId,
      streamId: context.streamId,
      agreementId: context.agreementId,
      ownerType: 'fundingcaseagreement',
      ownerId: context.agreementId,
      scope: context.scope
    }
  }

  if (target === 'claim') {
    const claimContext = await resolveAgreementClaimRuntimeContext(db, entityId)
    if (!claimContext) return null
    const agreementContext = await resolveAgreementScopeContext(claimContext.agreementId, db)
    if (!agreementContext) return null
    return {
      target,
      agencyId: claimContext.agencyId,
      streamId: claimContext.streamId,
      agreementId: claimContext.agreementId,
      claimId: claimContext.claimId,
      ownerType: 'fundingcaseagreementclaim',
      ownerId: claimContext.claimId,
      scope: extendEntityScope(agreementContext.scope, 'fundingcaseagreementclaim', claimContext.claimId)
    }
  }

  if (target === 'monitor') {
    const monitorContext = await resolveAgreementMonitorRuntimeContext(db, entityId)
    if (!monitorContext) return null
    const agreementContext = await resolveAgreementScopeContext(monitorContext.agreementId, db)
    if (!agreementContext) return null
    return {
      target,
      agencyId: monitorContext.agencyId,
      streamId: monitorContext.streamId,
      agreementId: monitorContext.agreementId,
      monitorId: monitorContext.monitorId,
      ownerType: 'fundingcaseagreementmonitor',
      ownerId: monitorContext.monitorId,
      scope: extendEntityScope(agreementContext.scope, 'fundingcaseagreementmonitor', monitorContext.monitorId)
    }
  }

  return await resolveApplicantRecipientExtensionContext(db, entityId)
}

/** Checks entity access through the appropriate agreement or recipient authorization path. */
export const canAccessExtensionEntity = async (
  authContext: AuthContext,
  requirement: GcsExtensionRbacRequirement,
  entityContext: ExtensionEntityContext,
  db: Kysely<Database>
): Promise<boolean> => {
  const action = requirement.action as AbilityAction
  const subject = requirement.subject as AbilitySubject<typeof action>

  if (requirement.subject !== getExtensionEntityAuthorizationSubject(entityContext.target)) {
    return false
  }

  if (requirement.subject === 'agreement') {
    return await canAccessAgreement(authContext, action, entityContext.scope, db)
  }

  if (requirement.subject === 'applicant_recipient' && entityContext.target === 'proponent') {
    if (!entityContext.applicantRecipientId) {
      return false
    }

    return await canAccessApplicantRecipient(
      authContext,
      entityContext.applicantRecipientId,
      action,
      db
    )
  }

  return authContext.userAbilities.authorize(subject, action, entityContext.scope)
}

/** Returns only extension configuration visible for the entity's agency and stream. */
export const getExtensionConfigurationForEntity = async (
  db: Kysely<Database>,
  extensionKey: string,
  entityContext: ExtensionEntityContext
): Promise<GcsExtensionJsonConfig | null> => {
  const isAgencyEnabled = await isExtensionEnabledForAgency(db, extensionKey, entityContext.agencyId)
  if (!isAgencyEnabled) {
    return null
  }

  if (entityContext.target === 'proponent') {
    return {}
  }

  if (!entityContext.streamId) {
    return null
  }

  const streamConfiguration = await getExtensionStreamConfiguration(db, extensionKey, entityContext.streamId)
  if (!streamConfiguration.enabled) {
    return null
  }

  return streamConfiguration.config
}

/** Filters agreement-create extensions to those enabled for the selected stream. */
export const getEnabledExtensionsForAgreementCreateOperation = async (
  db: Kysely<Database>,
  agreementContext: ExtensionCreateOperationAgreementContext
): Promise<Array<{ extension: GcsRegisteredExtension; config: GcsExtensionJsonConfig }>> => {
  const extensions = await getRegisteredExtensions()
  const enabled = []

  for (const extension of extensions) {
    const config = await getExtensionConfigurationForEntity(db, extension.key, {
      target: 'agreement',
      agencyId: agreementContext.agencyId,
      streamId: agreementContext.streamId,
      agreementId: agreementContext.agreementId,
      ownerType: 'fundingcaseagreement',
      ownerId: agreementContext.agreementId,
      scope: agreementContext.scope
    })

    if (config) {
      enabled.push({ extension, config })
    }
  }

  return enabled
}

type ExtensionLocalizedMessage =
  | string
  | {
    en: string
    fr: string
  }

type ExtensionUserErrorDetail = {
  path: string
  message: ExtensionLocalizedMessage
  code?: string
}

const isLocalizedExtensionMessage = (message: unknown): message is { en: string; fr: string } =>
  Boolean(message)
  && typeof message === 'object'
  && typeof (message as { en?: unknown }).en === 'string'
  && typeof (message as { fr?: unknown }).fr === 'string'

const resolveEventLocale = (event: H3Event): 'en' | 'fr' => resolveRequestLocale(event)

const resolveExtensionLocalizedMessage = (
  event: H3Event,
  message: ExtensionLocalizedMessage | unknown,
  fallback: string
): string => {
  if (isLocalizedExtensionMessage(message)) {
    return message[resolveEventLocale(event)]
  }

  return typeof message === 'string' ? message : fallback
}

/** Selects a bilingual extension error message or preserves its literal fallback. */
export const resolveExtensionUserErrorMessage = (
  event: H3Event,
  error: { message: string; localizedMessage?: unknown }
): string => resolveExtensionLocalizedMessage(event, error.localizedMessage, error.message)

/** Selects localized messages for the top-level extension error detail list. */
export const resolveExtensionUserErrorDetails = (
  event: H3Event,
  details: unknown
) => {
  if (!Array.isArray(details)) {
    return undefined
  }

  return details.map((detail: ExtensionUserErrorDetail) => ({
    path: detail.path,
    code: detail.code,
    message: resolveExtensionLocalizedMessage(event, detail.message, '')
  }))
}

/** Localizes extension user errors while preserving unexpected failures. */
export const handleExtensionCreateOperationError = async (
  event: H3Event,
  error: unknown
): Promise<never> => {
  if (isGcsExtensionUserError(error)) {
    return await throwApiError(event, {
      statusCode: error.statusCode,
      code: error.code,
      message: resolveExtensionUserErrorMessage(event, error),
      details: resolveExtensionUserErrorDetails(event, error.details)
    })
  }

  throw error
}

/** Runs extension-owned agency or stream disable guards and localizes expected user errors. */
export const runExtensionDisableGuards = async (
  event: H3Event,
  db: Transaction<Database>,
  context: Omit<GcsExtensionDisableGuardContext, 'event' | 'db'>
): Promise<void> => {
  try {
    await useNitroApp().hooks.callHook(GCS_EXTENSION_DISABLE_GUARD_HOOK, {
      ...context,
      event,
      db: db as unknown as Transaction<unknown>
    })
  } catch (error: unknown) {
    await handleExtensionCreateOperationError(event, error)
  }
}

/** Runs extension-owned enable guards inside the locked host configuration transaction. */
export const runExtensionEnableGuards = async (
  event: H3Event,
  db: Transaction<Database>,
  context: {
    extensionKey: string
    scope: 'agency' | 'stream'
    agencyId: string
    streamId?: string
  }
): Promise<void> => {
  try {
    await useNitroApp().hooks.callHook('gcs:extension:enable-guard', {
      ...context,
      event,
      db
    })
  } catch (error: unknown) {
    await handleExtensionCreateOperationError(event, error)
  }
}

/** Runs extension-owned agreement stream reassignment guards in the host write transaction. */
export const runExtensionAgreementStreamChangeGuards = async (
  event: H3Event,
  db: Transaction<Database>,
  context: Omit<GcsExtensionAgreementStreamChangeGuardHookPayload, 'event' | 'db'>
): Promise<void> => {
  try {
    await useNitroApp().hooks.callHook(GCS_EXTENSION_AGREEMENT_STREAM_CHANGE_GUARD_HOOK, {
      ...context,
      event,
      db: db as unknown as Transaction<unknown>
    })
  } catch (error: unknown) {
    await handleExtensionCreateOperationError(event, error)
  }
}

/** Runs extension-owned payment mutation guards inside the host write transaction. */
export const runExtensionAgreementPaymentMutationGuards = async (
  event: H3Event,
  db: Transaction<Database>,
  context: Omit<GcsExtensionAgreementPaymentMutationGuardHookPayload, 'event' | 'db'>
): Promise<void> => {
  try {
    await useNitroApp().hooks.callHook(GCS_EXTENSION_AGREEMENT_PAYMENT_MUTATION_GUARD_HOOK, {
      ...context,
      event,
      db: db as unknown as Transaction<unknown>
    })
  } catch (error: unknown) {
    await handleExtensionCreateOperationError(event, error)
  }
}

/** Runs extension-owned agreement deletion guards inside the locked host deletion transaction. */
export const runExtensionAgreementDeleteGuards = async (
  event: H3Event,
  db: Transaction<Database>,
  context: Omit<GcsExtensionAgreementDeleteGuardHookPayload, 'event' | 'db'>
): Promise<void> => {
  try {
    await useNitroApp().hooks.callHook(GCS_EXTENSION_AGREEMENT_DELETE_GUARD_HOOK, {
      ...context,
      event,
      db: db as unknown as Transaction<unknown>
    })
  } catch (error: unknown) {
    await handleExtensionCreateOperationError(event, error)
  }
}

/** Runs extension-owned Agency status reference guards inside the locked status mutation transaction. */
export const runExtensionStatusReferenceGuards = async (
  event: H3Event,
  db: Transaction<Database>,
  context: Omit<GcsExtensionStatusReferenceGuardHookPayload, 'event' | 'db'>
): Promise<void> => {
  try {
    await useNitroApp().hooks.callHook(GCS_EXTENSION_STATUS_REFERENCE_GUARD_HOOK, {
      ...context,
      event,
      db: db as unknown as Transaction<unknown>
    })
  } catch (error: unknown) {
    await handleExtensionCreateOperationError(event, error)
  }
}

/** Runs extension-owned configuration validation inside the host configuration transaction. */
export const runExtensionConfigurationGuards = async (
  event: H3Event,
  db: Transaction<Database>,
  context: Omit<GcsExtensionConfigurationGuardHookPayload, 'event' | 'db'>
): Promise<void> => {
  try {
    await useNitroApp().hooks.callHook(GCS_EXTENSION_CONFIGURATION_GUARD_HOOK, {
      ...context,
      event,
      db: db as unknown as Transaction<unknown>
    })
  } catch (error: unknown) {
    await handleExtensionCreateOperationError(event, error)
  }
}

/** Serializes host configuration writes with extension-owned lifecycle work. */
export const lockExtensionLifecycleScope = async (
  db: Transaction<Database>,
  extensionKey: string,
  agencyId: string,
  streamId?: string
): Promise<void> => await lockGcsExtensionLifecycleScope(
  db as unknown as Transaction<unknown>,
  extensionKey,
  agencyId,
  streamId
)

/**
 * Acquires every registered extension lifecycle scope in deterministic extension and stream order.
 * Agreement mutations call this before taking their profile row lock so extension-generated work
 * and host writes share the global lifecycle-scope then agreement-row lock order.
 */
export const lockRegisteredExtensionAgreementScopes = async (
  db: Transaction<Database>,
  agencyId: string,
  streamIds: string[]
): Promise<void> => {
  const extensionKeys = (await getRegisteredExtensions())
    .map(extension => extension.key)
    .sort()
  const orderedStreamIds = [...new Set(streamIds)].sort()

  for (const extensionKey of extensionKeys) {
    await lockExtensionLifecycleScope(db, extensionKey, agencyId)
    for (const streamId of orderedStreamIds) {
      await lockExtensionLifecycleScope(db, extensionKey, agencyId, streamId)
    }
  }
}

/** Locks registered extension configuration scopes across multiple agencies in canonical order. */
export const lockRegisteredExtensionScopes = async (
  db: Transaction<Database>,
  scopes: Array<{ agencyId: string; streamIds: string[] }>
): Promise<void> => {
  const extensionKeys = (await getRegisteredExtensions()).map(extension => extension.key).sort()
  const orderedScopes = [...scopes]
    .map(scope => ({
      agencyId: String(scope.agencyId),
      streamIds: [...new Set(scope.streamIds.map(String))].sort()
    }))
    .sort((left, right) => left.agencyId.localeCompare(right.agencyId, 'en', { numeric: true }))

  for (const extensionKey of extensionKeys) {
    for (const scope of orderedScopes) {
      await lockExtensionLifecycleScope(db, extensionKey, scope.agencyId)
      for (const streamId of scope.streamIds) {
        await lockExtensionLifecycleScope(db, extensionKey, scope.agencyId, streamId)
      }
    }
  }
}

/** Locks registered extension scopes and runs enabled extension guards before a host scope is deleted. */
export const guardRegisteredExtensionScopeDeletion = async (
  event: H3Event,
  db: Transaction<Database>,
  context: {
    scope: 'agency' | 'stream'
    agencyId: string
    streamId?: string
  }
): Promise<void> => {
  const extensions = (await getRegisteredExtensions()).slice().sort((left, right) => left.key.localeCompare(right.key))

  for (const extension of extensions) {
    await lockExtensionLifecycleScope(db, extension.key, context.agencyId, context.streamId)
  }

  for (const extension of extensions) {
    const agencyEnabled = await isExtensionEnabledForAgency(db, extension.key, context.agencyId)
    if (!agencyEnabled) continue
    if (context.scope === 'stream') {
      if (!context.streamId) continue
      const streamConfiguration = await getExtensionStreamConfiguration(db, extension.key, context.streamId)
      if (!streamConfiguration.enabled) continue
    }

    await runExtensionDisableGuards(event, db, {
      extensionKey: extension.key,
      scope: context.scope,
      agencyId: context.agencyId,
      ...(context.streamId ? { streamId: context.streamId } : {})
    })
  }
}

/** Runs extension agreement locks after registered scope locks and before the host profile row lock. */
export const lockRegisteredExtensionAgreementLifecycle = async (
  event: H3Event,
  db: Transaction<Database>,
  context: Omit<GcsExtensionAgreementLifecycleLockHookPayload, 'event' | 'db'>
): Promise<void> => {
  await useNitroApp().hooks.callHook(GCS_EXTENSION_AGREEMENT_LIFECYCLE_LOCK_HOOK, {
    ...context,
    event,
    db: db as unknown as Transaction<unknown>
  })
}

/** Runs enabled agreement-create hooks and converts extension user errors to API responses. */
export const runExtensionCreateOperationHooks = async (
  event: H3Event,
  trx: Kysely<Database>,
  operation: GcsExtensionCreateOperation,
  agreementContext: ExtensionCreateOperationAgreementContext,
  validatedBody: Record<string, unknown>,
  createdRecord?: Record<string, unknown>
) => {
  const enabledExtensions = await getEnabledExtensionsForAgreementCreateOperation(trx, agreementContext)
  if (enabledExtensions.length === 0) {
    return null
  }

  const contexts = Object.fromEntries(enabledExtensions.map(({ extension, config }) => [
    extension.key,
    {
      operation,
      phase: createdRecord ? 'after-create' : 'before-create',
      event,
      db: trx,
      trx,
      agreementId: agreementContext.agreementId,
      agencyId: agreementContext.agencyId,
      streamId: agreementContext.streamId,
      scope: agreementContext.scope,
      config,
      validatedBody,
      ...(createdRecord ? { createdRecord } : {})
    }
  ])) as GcsExtensionCreateOperationHookPayload['contexts']

  const payload: GcsExtensionCreateOperationHookPayload = {
    operation,
    enabledExtensionKeys: new Set(enabledExtensions.map(({ extension }) => extension.key)),
    contexts,
    results: []
  }

  try {
    await useNitroApp().hooks.callHook(GCS_EXTENSION_CREATE_OPERATION_HOOK, payload)
  } catch (error: unknown) {
    return await handleExtensionCreateOperationError(event, error)
  }

  const handledResults = payload.results.filter(item => item.result.status === 'handled')
  if (handledResults.length > 1) {
    return await badRequest(
      event,
      'EXTENSION_CREATE_OPERATION_CONFLICT',
      'apiErrors.extensions.create_operation_conflict'
    )
  }

  const handledResult = handledResults[0]?.result
  return handledResult?.status === 'handled' ? handledResult.response : null
}

/** Loads and invokes an extension runtime resolver when one is configured. */
export const resolveExtensionRuntimeSlot = async (
  event: unknown,
  extension: GcsRegisteredExtension,
  context: GcsExtensionRuntimeContext
): Promise<GcsExtensionRuntimeResolution | null> => {
  if (!extension.runtime) {
    return null
  }

  const loaded = await loadGcsExtensionModule(extension.runtime.id) as ExtensionRuntimeResolverModule
  if (typeof loaded.default !== 'function') {
    throw createError({
      statusCode: 500,
      statusMessage: 'Extension runtime resolver is invalid'
    })
  }

  const runtimeHost: GcsExtensionRuntimeHostContext = {
    event,
    db: (event as { context?: { $db?: unknown } }).context?.$db
  }
  const auth = (event as { context?: { $authContext?: unknown } }).context?.$authContext
  if (auth) {
    runtimeHost.auth = auth
  }
  const resolved = await loaded.default(runtimeHost, context)
  if (!resolved?.enabled) {
    return null
  }

  return {
    enabled: true,
    config: resolved.config ?? {}
  }
}

/** Validates and registers immutable extension entity declarations before their migrations. */
export const synchronizeExtensionLifecycleEntityTypes = async (
  db: Kysely<Database>,
  extension: GcsRegisteredExtension
): Promise<void> => {
  const entities = extension.entities ?? []
  if (!await hasLifecycleEntityTypeRegistry(db)) {
    if (entities.length > 0) {
      throw new Error('Common_Entity_Type must exist before lifecycle entity registration')
    }
    return
  }

  const desiredTypes = new Set<string>()
  const desiredLocalTypes = new Set<string>()
  for (const entity of entities) {
    if (desiredTypes.has(entity.type) || desiredLocalTypes.has(entity.localType)) {
      throw new Error(`Duplicate lifecycle entity declaration "${entity.type}"`)
    }
    desiredTypes.add(entity.type)
    desiredLocalTypes.add(entity.localType)
    await assertLifecycleEntityAdapter(entity)
  }

  const persistedForExtension = await db
    .selectFrom('Common_Entity_Type')
    .selectAll()
    .where('egcs_cn_extensionkey', '=', extension.key)
    .where('_deleted', '=', false)
    .execute() as PersistedExtensionEntityType[]
  for (const persisted of persistedForExtension) {
    if (!desiredTypes.has(persisted.egcs_cn_type)) {
      throw new Error(
        `Persisted lifecycle entity type "${persisted.egcs_cn_type}" is unavailable; declarations cannot be renamed or removed`
      )
    }
  }

  const newDeclarations: PersistedExtensionEntityType[] = []
  for (const entity of entities) {
    const expected = extensionEntityTypeValues(extension.key, entity)
    const persisted = await db
      .selectFrom('Common_Entity_Type')
      .selectAll()
      .where('egcs_cn_type', '=', entity.type)
      .where('_deleted', '=', false)
      .executeTakeFirst() as PersistedExtensionEntityType | undefined
    if (persisted) {
      assertExtensionEntityTypeMatches(persisted, expected)
    } else {
      newDeclarations.push(expected)
    }
  }

  if (newDeclarations.length > 0) {
    await db
      .insertInto('Common_Entity_Type')
      .values(newDeclarations)
      .execute()
  }
}

/** Applies pending extension migrations in lexical order and records each applied key. */
export const runExtensionMigrations = async (
  db: Kysely<Database>,
  extension: GcsRegisteredExtension
): Promise<MigrationResult[]> => {
  await synchronizeExtensionLifecycleEntityTypes(db, extension)
  const migrations = extension.migrations ?? []
  if (migrations.length === 0) {
    return []
  }

  const migrationDb = db.isTransaction
    ? new Proxy(db, {
        get: (target, property) => {
          if (property === 'transaction') {
            return () => ({
              execute: async <T>(callback: (trx: Kysely<Database>) => Promise<T>): Promise<T> => await callback(target)
            })
          }
          const value = Reflect.get(target, property, target) as unknown
          return typeof value === 'function' ? value.bind(target) : value
        }
      })
    : db
  const tableSuffix = extensionMigrationTableSuffix(extension.key)
  const migrator = new Migrator({
    db: migrationDb,
    provider: new ExplicitExtensionMigrationProvider(migrations),
    migrationTableSchema: 'extensions',
    migrationTableName: `extension_migration_${tableSuffix}`,
    migrationLockTableName: `extension_migration_lock_${tableSuffix}`
  })
  const { error, results } = await migrator.migrateToLatest()

  if (error) {
    throw error
  }

  return results ?? []
}

/** Applies migrations only for extensions enabled for at least one agency. */
export const runEnabledExtensionMigrations = async (
  db: Kysely<Database>,
  extensions: GcsRegisteredExtension[]
): Promise<Array<{ extensionKey: string; results: MigrationResult[] }>> => {
  await assertInstalledExtensionLifecycleEntityTypes(db, extensions)
  const enabledRows = await db
    .selectFrom('extensions.agency_enablement as enablement')
    .innerJoin('Agency_Profile as agency', 'agency.id', 'enablement.agency_id')
    .select('enablement.extension_key')
    .where('enablement.enabled', '=', true)
    .where('enablement._deleted', '=', false)
    .where('agency._deleted', '=', false)
    .distinct()
    .execute()
  const enabledKeys = new Set(enabledRows.map(row => row.extension_key))
  const results: Array<{ extensionKey: string; results: MigrationResult[] }> = []

  for (const extension of extensions) {
    if (!enabledKeys.has(extension.key)) {
      continue
    }

    results.push({
      extensionKey: extension.key,
      results: await runExtensionMigrations(db, extension)
    })
  }

  return results
}

/** Loads a stream's active extension configuration, or the default disabled state. */
export const getExtensionStreamConfiguration = async (
  db: Kysely<Database>,
  extensionKey: string,
  streamId: string
): Promise<{ enabled: boolean; config: GcsExtensionJsonConfig }> => {
  const row = await db
    .selectFrom('extensions.stream_configuration')
    .select(['enabled', 'config'])
    .where('extension_key', '=', extensionKey)
    .where('stream_id', '=', streamId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  return {
    enabled: row?.enabled === true,
    config: (row?.config ?? {}) as GcsExtensionJsonConfig
  }
}

/** Checks whether an extension is enabled anywhere within an agency. */
export const isExtensionEnabledForAgency = async (
  db: Kysely<Database>,
  extensionKey: string,
  agencyId: string
): Promise<boolean> => {
  const row = await db
    .selectFrom('extensions.agency_enablement as enablement')
    .innerJoin('Agency_Profile as agency', 'agency.id', 'enablement.agency_id')
    .select('enablement.id')
    .where('enablement.extension_key', '=', extensionKey)
    .where('enablement.agency_id', '=', agencyId)
    .where('enablement.enabled', '=', true)
    .where('enablement._deleted', '=', false)
    .where('agency._deleted', '=', false)
    .executeTakeFirst()

  return Boolean(row)
}

/** Checks whether an extension is enabled on a specific stream. */
export const isExtensionEnabledForStream = async (
  db: Kysely<Database>,
  extensionKey: string,
  streamId: string
): Promise<boolean> => {
  const row = await db
    .selectFrom('extensions.stream_configuration')
    .select('id')
    .where('extension_key', '=', extensionKey)
    .where('stream_id', '=', streamId)
    .where('enabled', '=', true)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  return Boolean(row)
}

/** Updates an active extension configuration value or inserts a new entry. */
export const setExtensionKvEntry = async (
  db: Kysely<Database>,
  extensionKey: string,
  ownerType: string,
  ownerId: string,
  configKey: string,
  value: JsonValue
) => {
  const existing = await db
    .selectFrom('extensions.kv_entry')
    .select('id')
    .where('extension_key', '=', extensionKey)
    .where('owner_type', '=', ownerType)
    .where('owner_id', '=', ownerId)
    .where('config_key', '=', configKey)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (existing) {
    return await db
      .updateTable('extensions.kv_entry')
      .set({ value })
      .where('id', '=', existing.id)
      .returningAll()
      .executeTakeFirst()
  }

  return await db
    .insertInto('extensions.kv_entry')
    .values({
      extension_key: extensionKey,
      owner_type: ownerType,
      owner_id: ownerId,
      config_key: configKey,
      value
    })
    .returningAll()
    .executeTakeFirst()
}

/** Loads one active extension-owned configuration value by its composite owner key. */
export const getExtensionKvEntry = async (
  db: Kysely<Database>,
  extensionKey: string,
  ownerType: string,
  ownerId: string,
  configKey: string
): Promise<JsonValue | null> => {
  const row = await db
    .selectFrom('extensions.kv_entry')
    .select('value')
    .where('extension_key', '=', extensionKey)
    .where('owner_type', '=', ownerType)
    .where('owner_id', '=', ownerId)
    .where('config_key', '=', configKey)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  return row ? row.value : null
}

/** Soft-deletes an extension-owned configuration value by its composite owner key. */
export const deleteExtensionKvEntry = async (
  db: Kysely<Database>,
  extensionKey: string,
  ownerType: string,
  ownerId: string,
  configKey: string
) => {
  await db
    .updateTable('extensions.kv_entry')
    .set({ _deleted: true })
    .where('extension_key', '=', extensionKey)
    .where('owner_type', '=', ownerType)
    .where('owner_id', '=', ownerId)
    .where('config_key', '=', configKey)
    .where('_deleted', '=', false)
    .execute()
}
