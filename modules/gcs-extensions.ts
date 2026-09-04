/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Generated registry helpers require a temporary documentation migration window. */
import { createHash } from 'node:crypto'
import { access, cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createJiti } from 'jiti'
import { addComponentsDir, addTemplate, defineNuxtModule, useLogger } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { AUTHORIZATION_ACTIONS } from '@gcs-ssc/authorization'
import type {
  GcsExtensionAssetDefinition,
  GcsExtensionCreateActionDefinition,
  GcsExtensionDefinition,
  GcsExtensionLifecycleEntityDefinition,
  GcsExtensionEntityTabDefinition,
  GcsExtensionEntityTabTarget,
  GcsExtensionMigrationDefinition,
  GcsClientExtensionManifest,
  GcsRegisteredExtension,
  GcsResolvedExtension,
  GcsExtensionServerHandlerDefinition,
  GcsExtensionPaymentAmountCalculatorDefinition,
  GcsExtensionHostCapability
} from '../shared/utils/extensions'
import {
  GCS_EXTENSION_SDK_VERSION,
  getExtensionEntityAuthorizationSubject
} from '../shared/utils/extensions'
import { AUTHORIZATION_SUBJECTS } from '../shared/utils/abilities'
import { sdkAliases } from '../shared/utils/extension-sdk-aliases'

const EXTENSION_KEY_PATTERN = /^[a-z][a-z0-9-]*$/
const EXTENSION_LIFECYCLE_NAMESPACE_PATTERN = /^[a-z][a-z0-9-]{0,62}$/
const EXTENSION_LIFECYCLE_ENTITY_TYPE_PATTERN = /^[a-z][a-z0-9-]{0,62}$/
const EXTENSION_ENTITY_TAB_ID_PATTERN = /^[a-z][a-z0-9-]*$/
const EXTENSION_ENTITY_TAB_TARGETS = new Set(['agreement', 'proponent', 'claim', 'monitor'])
const EXTENSION_CREATE_ACTION_ID_PATTERN = /^[a-z][a-z0-9-]*$/
const EXTENSION_PAYMENT_AMOUNT_CALCULATOR_ID_PATTERN = /^[a-z][a-z0-9-]*$/
const EXTENSION_CREATE_OPERATIONS = new Set(['agreement.commitments.create', 'agreement.payments.create'])
const EXTENSION_CREATE_ACTION_MODES = new Set(['append', 'replace'])
const EXTENSION_ABILITY_ACTIONS = new Set<string>(AUTHORIZATION_ACTIONS)
const EXTENSION_AUTHORIZATION_SUBJECTS = new Set<string>(AUTHORIZATION_SUBJECTS)
const EXTENSION_SERVER_HANDLER_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete'])
const EXTENSION_HOST_CAPABILITIES = new Set([
  'agency-config',
  'stream-config-modal',
  'stream-config-page',
  'entity-tabs',
  'textarea-slots',
  'create-actions',
  'payment-amount-calculators',
  'server-handlers',
  'server-handler-rbac',
  'migrations',
  'runtime-resolution',
  'public-assets',
  'extension-ui',
  'extension-api-client',
  'host-api-client',
  'extension-kv',
  'extension-secrets',
  'extension-create-operation-hooks',
  'extension-lifecycle-hooks',
  'lifecycle-entities',
  'file-storage-provider'
])
const EXTENSION_LIFECYCLE_COMPLETION_CAPABILITIES = new Set(['supported', 'none'])
const EXTENSION_LIFECYCLE_APPROVAL_SUBMISSION_CAPABILITIES = new Set(['on_completion', 'none'])
const EXTENSION_LIFECYCLE_STANDARD_WORKFLOW_CAPABILITIES = new Set(['explicit'])
const EXTENSION_LIFECYCLE_OWNER_KINDS = new Set(['agreement', 'proponent'])
const EXTENSION_LIFECYCLE_ASSIGNMENT_MODES = new Set(['independent', 'inherited'])
const EXTENSION_STORAGE_METADATA_PERSISTENCE = new Set(['host', 'provider'])
const EXTENSION_STORAGE_METADATA_MUTABILITY = new Set(['upload-only', 'editable'])

interface ExtensionPackageJson {
  name?: string
  private?: boolean
  dependencies?: Record<string, string>
}

interface ExtensionScanState {
  seenKeys: Set<string>
  seenPackages: Set<string>
  seenEntityTypes: Set<string>
}

interface ExtensionConfigImporter {
  import: (id: string, options: { default: true }) => Promise<unknown>
}

type ExtensionServerHandlerMethod = NonNullable<GcsExtensionServerHandlerDefinition['method']>

interface NormalizedExtensionServerRoute {
  method: ExtensionServerHandlerMethod
  params: Set<string>
  route: string
  segments: Array<{
    dynamic: boolean
    value: string
  }>
  signature: string
}

const APP_PROVIDED_PACKAGES = new Set(['vue', 'nuxt', '@nuxt/ui', 'tailwindcss'])
const PRODUCTION_ASSET_SOURCE_EXTENSIONS = new Set([
  '.cts',
  '.jsx',
  '.map',
  '.mts',
  '.ts',
  '.tsx',
  '.vue'
])

/** Returns whether an asset tree contains source files excluded from production. */
const containsProductionAssetSource = async (directory: string): Promise<boolean> => {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory() && await containsProductionAssetSource(entryPath)) {
      return true
    }
    if (entry.isFile() && PRODUCTION_ASSET_SOURCE_EXTENSIONS.has(extname(entry.name))) {
      return true
    }
  }
  return false
}

export { sdkAliases }

const parseSdkVersion = (value: string): [number, number, number] | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value)
  if (!match) {
    return null
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** Determines whether an extension SDK requirement is compatible with the host version. */
const isSdkVersionCompatible = (requiredVersion: string, hostVersion: string): boolean => {
  const normalizedRequiredVersion = requiredVersion.startsWith('^')
    ? requiredVersion.slice(1)
    : requiredVersion
  const required = parseSdkVersion(normalizedRequiredVersion)
  const host = parseSdkVersion(hostVersion)
  if (!required || !host) {
    return false
  }

  if (!requiredVersion.startsWith('^')) {
    return host[0] === required[0] && host[1] === required[1] && host[2] === required[2]
  }

  const [requiredMajor, requiredMinor, requiredPatch] = required
  const [hostMajor, hostMinor, hostPatch] = host
  if (requiredMajor === 0) {
    if (requiredMinor === 0) {
      return hostMajor === 0
        && hostMinor === 0
        && hostPatch === requiredPatch
    }

    return hostMajor === 0
      && hostMinor === requiredMinor
      && hostPatch >= requiredPatch
  }

  return hostMajor === requiredMajor
    && (
      hostMinor > requiredMinor
      || (hostMinor === requiredMinor && hostPatch >= requiredPatch)
    )
}

const addImpliedCapability = (
  capabilities: Set<GcsExtensionHostCapability>,
  condition: boolean,
  capability: GcsExtensionHostCapability
): void => {
  if (condition) {
    capabilities.add(capability)
  }
}

const normalizeExtensionServerHandlerMethod = (
  method: GcsExtensionServerHandlerDefinition['method'],
  index: number
): ExtensionServerHandlerMethod => {
  if (method !== undefined && typeof method !== 'string') {
    throw new Error(
      `Extension server handler ${index} method must be one of get, post, put, patch, or delete`
    )
  }
  const normalizedMethod = method === undefined ? 'get' : method.toLowerCase()
  if (!EXTENSION_SERVER_HANDLER_METHODS.has(normalizedMethod)) {
    throw new Error(
      `Extension server handler ${index} method must be one of get, post, put, patch, or delete`
    )
  }
  return normalizedMethod as ExtensionServerHandlerMethod
}

const normalizeExtensionServerHandlerRoute = (
  extensionKey: string,
  handler: Pick<GcsExtensionServerHandlerDefinition, 'method' | 'route'>,
  index: number
): NormalizedExtensionServerRoute => {
  if (typeof handler.route !== 'string' || !handler.route.startsWith('/')) {
    throw new Error(`Extension server handler ${index} must use an absolute route`)
  }

  const extensionPrefix = `/api/extensions/${extensionKey}`
  let relativeRoute = `/${handler.route.split('/').filter(Boolean).join('/')}`
  if (relativeRoute === extensionPrefix) {
    relativeRoute = '/'
  } else if (relativeRoute.startsWith(`${extensionPrefix}/`)) {
    relativeRoute = relativeRoute.slice(extensionPrefix.length)
  } else if (relativeRoute.startsWith(extensionPrefix)) {
    throw new Error(
      `Extension server handler ${index} route must end its extension namespace at a segment boundary`
    )
  }

  const params = new Set<string>()
  const segments = relativeRoute.split('/').filter(Boolean).map(segment => {
    const dynamicMatch = /^\[([A-Za-z_][A-Za-z0-9_]*)\]$/.exec(segment)
    if (dynamicMatch) {
      const param = dynamicMatch[1] as string
      if (params.has(param)) {
        throw new Error(`Extension server handler ${index} has duplicate route parameter "${param}"`)
      }
      params.add(param)
      return { dynamic: true, value: param }
    }

    if (segment.includes('[') || segment.includes(']')) {
      throw new Error(
        `Extension server handler ${index} route segment "${segment}" is invalid; optional and catch-all parameters are not supported`
      )
    }

    return { dynamic: false, value: segment }
  })
  const route = segments.length === 0
    ? '/'
    : `/${segments.map(segment => segment.dynamic ? `[${segment.value}]` : segment.value).join('/')}`
  const signature = segments.length === 0
    ? '/'
    : `/${segments.map(segment => segment.dynamic ? '[]' : segment.value).join('/')}`

  return {
    method: normalizeExtensionServerHandlerMethod(handler.method, index),
    params,
    route,
    segments,
    signature
  }
}

const extensionServerRoutesOverlap = (
  first: NormalizedExtensionServerRoute,
  second: NormalizedExtensionServerRoute
): boolean => first.method === second.method
  && first.segments.length === second.segments.length
  && first.segments.every((segment, index) => {
    const otherSegment = second.segments[index]
    if (!otherSegment) return false
    return segment.dynamic || otherSegment.dynamic || segment.value === otherSegment.value
  })

const normalizeExtensionServerHandlerRoutes = (
  extensionKey: string,
  handlers: ReadonlyArray<Pick<GcsExtensionServerHandlerDefinition, 'method' | 'route'>>
): NormalizedExtensionServerRoute[] => {
  const normalizedRoutes = handlers.map((handler, index) =>
    normalizeExtensionServerHandlerRoute(extensionKey, handler, index)
  )

  for (const [index, route] of normalizedRoutes.entries()) {
    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const previousRoute = normalizedRoutes[previousIndex]
      if (!previousRoute || !extensionServerRoutesOverlap(previousRoute, route)) {
        continue
      }
      if (previousRoute.signature === route.signature) {
        throw new Error(
          `Extension ${extensionKey} server handlers ${previousIndex} and ${index} have duplicate normalized ${route.method.toUpperCase()} route signature "${route.signature}"`
        )
      }
      throw new Error(
        `Extension ${extensionKey} server handlers ${previousIndex} and ${index} have ambiguous ${route.method.toUpperCase()} routes "${previousRoute.route}" and "${route.route}"; static and dynamic route precedence is undefined`
      )
    }
  }

  return normalizedRoutes
}

/** Rejects invalid, duplicate, and intersecting extension server-handler routes. */
export const validateExtensionServerHandlerRoutes = (
  extensionKey: string,
  handlers: ReadonlyArray<Pick<GcsExtensionServerHandlerDefinition, 'method' | 'route'>>
): void => {
  normalizeExtensionServerHandlerRoutes(extensionKey, handlers)
}

const inferRequiredHostCapabilities = (definition: GcsExtensionDefinition): Set<GcsExtensionHostCapability> => {
  const capabilities = new Set<GcsExtensionHostCapability>()
  addImpliedCapability(capabilities, Boolean(definition.admin?.agency), 'agency-config')
  addImpliedCapability(capabilities, Boolean(definition.admin?.streamConfig), 'stream-config-modal')
  addImpliedCapability(capabilities, Boolean(definition.admin?.streamConfigPage), 'stream-config-page')
  addImpliedCapability(capabilities, (definition.client?.tabs ?? []).length > 0, 'entity-tabs')
  addImpliedCapability(capabilities, (definition.client?.slots ?? []).length > 0, 'textarea-slots')
  addImpliedCapability(capabilities, (definition.client?.createActions ?? []).length > 0, 'create-actions')
  addImpliedCapability(capabilities, (definition.client?.paymentAmountCalculators ?? []).length > 0, 'payment-amount-calculators')
  addImpliedCapability(capabilities, (definition.serverHandlers ?? []).length > 0, 'server-handlers')
  addImpliedCapability(capabilities, (definition.serverHandlers ?? []).some(handler => Boolean(handler.rbac)), 'server-handler-rbac')
  addImpliedCapability(capabilities, (definition.migrations ?? []).length > 0, 'migrations')
  addImpliedCapability(capabilities, Boolean(definition.runtime), 'runtime-resolution')
  addImpliedCapability(capabilities, (definition.assets ?? []).length > 0, 'public-assets')
  addImpliedCapability(capabilities, Boolean(definition.admin || definition.client), 'extension-ui')
  addImpliedCapability(capabilities, Boolean(definition.nitroPlugin), 'extension-lifecycle-hooks')
  addImpliedCapability(capabilities, (definition.entities ?? []).length > 0, 'lifecycle-entities')
  addImpliedCapability(capabilities, Boolean(definition.fileStorageProvider), 'file-storage-provider')

  return capabilities
}

/** Produces the stable namespaced identity for an extension lifecycle entity. */
export const qualifyExtensionEntityType = (extensionKey: string, localType: string): `${string}:${string}` => {
  if (!EXTENSION_LIFECYCLE_NAMESPACE_PATTERN.test(extensionKey) || !EXTENSION_LIFECYCLE_ENTITY_TYPE_PATTERN.test(localType)) {
    throw new Error('Extension lifecycle entity identities require lowercase kebab-case extension and local types')
  }
  return `${extensionKey}:${localType}`
}

const validateLifecycleEntityDefinition = (
  extensionKey: string,
  entity: GcsExtensionLifecycleEntityDefinition,
  index: number,
  seenLocalTypes: Set<string>
): void => {
  const fieldName = `entities.${index}`
  if (!EXTENSION_LIFECYCLE_ENTITY_TYPE_PATTERN.test(entity.type)) {
    throw new Error(`Extension ${extensionKey} field "${fieldName}.type" must use lowercase kebab-case without a namespace`)
  }
  if (seenLocalTypes.has(entity.type)) {
    throw new Error(`Extension ${extensionKey} has duplicate lifecycle entity type "${entity.type}"`)
  }
  seenLocalTypes.add(entity.type)
  if (!entity.label?.en || !entity.label?.fr) {
    throw new Error(`Extension ${extensionKey} field "${fieldName}.label" must define bilingual en and fr values`)
  }
  if (!EXTENSION_LIFECYCLE_COMPLETION_CAPABILITIES.has(entity.completion)) {
    throw new Error(`Extension ${extensionKey} field "${fieldName}.completion" is invalid`)
  }
  if (!EXTENSION_LIFECYCLE_APPROVAL_SUBMISSION_CAPABILITIES.has(entity.approvalSubmission)) {
    throw new Error(`Extension ${extensionKey} field "${fieldName}.approvalSubmission" is invalid`)
  }
  if (!EXTENSION_LIFECYCLE_STANDARD_WORKFLOW_CAPABILITIES.has(entity.standardWorkflow)) {
    throw new Error(`Extension ${extensionKey} field "${fieldName}.standardWorkflow" is invalid`)
  }
  if (entity.approvalSubmission === 'on_completion' && entity.completion !== 'supported') {
    throw new Error(`Extension ${extensionKey} field "${fieldName}.approvalSubmission" requires completion support`)
  }
  if (typeof entity.supportsDirectReviews !== 'boolean') {
    throw new Error(`Extension ${extensionKey} field "${fieldName}.supportsDirectReviews" must be boolean`)
  }
  if (!EXTENSION_LIFECYCLE_OWNER_KINDS.has(entity.ownerKind)) {
    throw new Error(`Extension ${extensionKey} field "${fieldName}.ownerKind" is invalid`)
  }
  if (!EXTENSION_LIFECYCLE_ASSIGNMENT_MODES.has(entity.assignmentMode)) {
    throw new Error(`Extension ${extensionKey} field "${fieldName}.assignmentMode" is invalid`)
  }
  if (!entity.adapter?.path) {
    throw new Error(`Extension ${extensionKey} field "${fieldName}.adapter.path" is required`)
  }
}

/** Resolves one validated lifecycle adapter without exposing its source path in metadata. */
export const resolveLifecycleEntity = async (
  extensionDir: string,
  extensionKey: string,
  entity: GcsExtensionLifecycleEntityDefinition,
  index: number
) => {
  const { type: localType, adapter, ...metadata } = entity
  return {
    ...metadata,
    localType,
    type: qualifyExtensionEntityType(extensionKey, localType),
    adapter: {
      path: await assertContainedPath(extensionDir, adapter.path, `entities.${index}.adapter.path`)
    }
  }
}

/** Resolves a real path and rejects extension references that escape their package root. */
export const assertContainedPath = async (rootDir: string, targetPath: string, fieldName: string): Promise<string> => {
  const absolutePath = resolve(rootDir, targetPath)
  const root = await realpath(rootDir)
  const realTargetPath = await realpath(absolutePath)
  const relativePath = relative(root, realTargetPath)
  if (relativePath.startsWith('..') || relativePath === '..' || resolve(root, relativePath) !== realTargetPath) {
    throw new Error(`Extension field "${fieldName}" must stay inside ${rootDir}: ${targetPath}`)
  }
  await access(absolutePath)
  return realTargetPath
}

/** Validates package identity, privacy, and placement of host-provided dependencies. */
export const validateExtensionPackage = (extensionDir: string, packageJson: ExtensionPackageJson): string => {
  if (!packageJson.name) {
    throw new Error(`Extension at ${extensionDir} must define package.json name`)
  }
  if (packageJson.private !== true) {
    throw new Error(`Extension package ${packageJson.name} must set "private": true`)
  }

  const duplicatedPackages = Object.keys(packageJson.dependencies ?? {}).filter(name => APP_PROVIDED_PACKAGES.has(name))
  if (duplicatedPackages.length > 0) {
    throw new Error(
      `Extension package ${packageJson.name} must list app-provided packages as peerDependencies or devDependencies, not dependencies: ${duplicatedPackages.join(', ')}`
    )
  }

  return packageJson.name
}

const validateFileStorageProviderDefinition = (definition: GcsExtensionDefinition): void => {
  const provider = definition.fileStorageProvider
  if (!provider) return
  if (!provider.adapter?.path) {
    throw new Error(`Extension ${definition.key} field "fileStorageProvider.adapter.path" is required`)
  }
  const metadata = provider.metadata
  if (!metadata) return
  if (!metadata.component?.path) {
    throw new Error(`Extension ${definition.key} field "fileStorageProvider.metadata.component.path" is required`)
  }
  if (!metadata.validator?.path) {
    throw new Error(`Extension ${definition.key} field "fileStorageProvider.metadata.validator.path" is required`)
  }
  if (!EXTENSION_STORAGE_METADATA_PERSISTENCE.has(metadata.persistence)) {
    throw new Error(`Extension ${definition.key} field "fileStorageProvider.metadata.persistence" is invalid`)
  }
  if (!EXTENSION_STORAGE_METADATA_MUTABILITY.has(metadata.mutability)) {
    throw new Error(`Extension ${definition.key} field "fileStorageProvider.metadata.mutability" is invalid`)
  }
  if (!Number.isSafeInteger(metadata.contractVersion) || metadata.contractVersion < 1) {
    throw new Error(`Extension ${definition.key} field "fileStorageProvider.metadata.contractVersion" must be a positive integer`)
  }
}

/** Validates extension identity, bilingual naming, SDK compatibility, and host capabilities. */
export const validateExtensionDefinition = (definition: GcsExtensionDefinition, extensionDir: string): void => {
  if (!EXTENSION_KEY_PATTERN.test(definition.key)) {
    throw new Error(`Extension at ${extensionDir} has invalid key "${definition.key}". Use lowercase kebab-case.`)
  }
  if (!definition.name?.en || !definition.name?.fr) {
    throw new Error(`Extension ${definition.key} must define bilingual name.en and name.fr`)
  }
  if (!definition.sdkVersion) {
    throw new Error(`Extension ${definition.key} must define sdkVersion`)
  }
  if (!isSdkVersionCompatible(definition.sdkVersion, GCS_EXTENSION_SDK_VERSION)) {
    throw new Error(
      `Extension ${definition.key} requires unsupported SDK version "${definition.sdkVersion}". Host SDK is ${GCS_EXTENSION_SDK_VERSION}.`
    )
  }
  for (const capability of definition.requiredHostCapabilities ?? []) {
    if (!EXTENSION_HOST_CAPABILITIES.has(capability)) {
      throw new Error(`Extension ${definition.key} requires unsupported host capability "${capability}"`)
    }
  }
  const declaredCapabilities = new Set(definition.requiredHostCapabilities ?? [])
  for (const capability of inferRequiredHostCapabilities(definition)) {
    if (!declaredCapabilities.has(capability)) {
      throw new Error(`Extension ${definition.key} must declare required host capability "${capability}"`)
    }
  }
  const serverHandlers = definition.serverHandlers ?? []
  validateExtensionServerHandlerRoutes(definition.key, serverHandlers)
  for (const [index, handler] of serverHandlers.entries()) {
    validateServerHandlerRbac(handler, index)
  }
  const seenLocalEntityTypes = new Set<string>()
  for (const [index, entity] of (definition.entities ?? []).entries()) {
    validateLifecycleEntityDefinition(definition.key, entity, index, seenLocalEntityTypes)
  }
  validateFileStorageProviderDefinition(definition)
}

const resolveServerHandler = async (
  rootDir: string,
  extensionKey: string,
  handler: GcsExtensionServerHandlerDefinition,
  index: number
) => {
  const normalizedRoute = normalizeExtensionServerHandlerRoute(extensionKey, handler, index)

  return {
    route: normalizedRoute.route,
    method: normalizedRoute.method,
    path: await assertContainedPath(rootDir, handler.path, `serverHandlers.${index}.path`),
    auth: handler.auth,
    rbac: handler.rbac
  }
}

const validateExtensionRbacRequirement = (
  requirement: { subject: string; action: string },
  fieldName: string
) => {
  if (
    !EXTENSION_AUTHORIZATION_SUBJECTS.has(requirement.subject)
    || !EXTENSION_ABILITY_ACTIONS.has(requirement.action)
  ) {
    throw new Error(`Extension field "${fieldName}" must use an existing GCS RBAC subject/action pair`)
  }
}

const validateExtensionEntityRbacRequirement = (
  target: GcsExtensionEntityTabTarget,
  requirement: { subject: string; action: string },
  fieldName: string
): void => {
  const expectedSubject = getExtensionEntityAuthorizationSubject(target)
  if (requirement.subject !== expectedSubject) {
    throw new Error(
      `Extension field "${fieldName}" must use subject "${expectedSubject}" for entity target "${target}"`
    )
  }
}

const getExtensionRouteParams = (route: string): Set<string> => {
  const params = new Set<string>()
  for (const match of route.matchAll(/\[([^\]/]+)\]/g)) {
    params.add(match[1] as string)
  }
  return params
}

const validateExtensionRouteParam = (
  routeParams: Set<string>,
  param: string,
  fieldName: string,
  index: number
): void => {
  if (!routeParams.has(param)) {
    throw new Error(`Extension server handler ${index} must include ${fieldName} "${param}" in its route pattern`)
  }
}

/** Rejects server routes whose RBAC declaration conflicts with their path parameters. */
const validateServerHandlerRbac = (
  handler: GcsExtensionServerHandlerDefinition,
  index: number
) => {
  if (!handler.rbac) {
    if (handler.auth !== 'manual') {
      throw new Error(`Extension server handler ${index} must define rbac or set auth: "manual"`)
    }
    return
  }
  const routeParams = getExtensionRouteParams(handler.route)
  if (handler.auth === 'manual') {
    throw new Error(`Extension server handler ${index} cannot combine rbac with auth: "manual"`)
  }
  validateExtensionRbacRequirement(handler.rbac, `serverHandlers.${index}.rbac`)
  const targetCount = Number('entity' in handler.rbac) + Number('stream' in handler.rbac) + Number('agency' in handler.rbac)
  if (targetCount !== 1) {
    throw new Error(`Extension server handler ${index} must define exactly one RBAC target`)
  }
  if ('entity' in handler.rbac) {
    if (!EXTENSION_ENTITY_TAB_TARGETS.has(handler.rbac.entity.target)) {
      throw new Error(`Extension server handler ${index} has invalid RBAC entity target "${handler.rbac.entity.target}"`)
    }
    validateExtensionEntityRbacRequirement(
      handler.rbac.entity.target,
      handler.rbac,
      `serverHandlers.${index}.rbac`
    )
    if (normalizeExtensionServerHandlerMethod(handler.method, index) === 'delete' && handler.rbac.action !== 'delete') {
      throw new Error(`Extension server handler ${index} DELETE entity routes must require the delete action`)
    }
    if (!handler.rbac.entity.param) {
      throw new Error(`Extension server handler ${index} must define rbac.entity.param`)
    }
  }
  if ('stream' in handler.rbac && !handler.rbac.stream.param) {
    throw new Error(`Extension server handler ${index} must define rbac.stream.param`)
  }
  if ('agency' in handler.rbac && !handler.rbac.agency.param) {
    throw new Error(`Extension server handler ${index} must define rbac.agency.param`)
  }
  if ('entity' in handler.rbac) {
    validateExtensionRouteParam(routeParams, handler.rbac.entity.param, 'rbac.entity.param', index)
  }
  if ('stream' in handler.rbac) {
    validateExtensionRouteParam(routeParams, handler.rbac.stream.param, 'rbac.stream.param', index)
  }
  if ('agency' in handler.rbac) {
    validateExtensionRouteParam(routeParams, handler.rbac.agency.param, 'rbac.agency.param', index)
  }
}

/** Resolves and validates a tab component exported by an extension package. */
export const resolveEntityTab = async (
  rootDir: string,
  tab: GcsExtensionEntityTabDefinition,
  index: number
) => {
  if (!EXTENSION_ENTITY_TAB_TARGETS.has(tab.target)) {
    throw new Error(`Extension client tab ${index} has invalid target "${tab.target}"`)
  }
  if (!EXTENSION_ENTITY_TAB_ID_PATTERN.test(tab.id)) {
    throw new Error(`Extension client tab ${index} has invalid id "${tab.id}". Use lowercase kebab-case.`)
  }
  if (!tab.label?.en || !tab.label?.fr) {
    throw new Error(`Extension client tab ${index} must define bilingual label.en and label.fr`)
  }
  validateExtensionRbacRequirement(tab.rbac, `client.tabs.${index}.rbac`)
  validateExtensionEntityRbacRequirement(tab.target, tab.rbac, `client.tabs.${index}.rbac`)

  return {
    ...tab,
    path: await assertContainedPath(rootDir, tab.path, `client.tabs.${index}.path`)
  }
}

/** Resolves and validates an agreement-create action contributed by an extension. */
export const resolveCreateAction = async (
  rootDir: string,
  action: GcsExtensionCreateActionDefinition,
  index: number
) => {
  if (!EXTENSION_CREATE_OPERATIONS.has(action.operation)) {
    throw new Error(`Extension client create action ${index} has invalid operation "${action.operation}"`)
  }
  if (!EXTENSION_CREATE_ACTION_MODES.has(action.mode)) {
    throw new Error(`Extension client create action ${index} has invalid mode "${action.mode}"`)
  }
  if (!EXTENSION_CREATE_ACTION_ID_PATTERN.test(action.id)) {
    throw new Error(`Extension client create action ${index} has invalid id "${action.id}". Use lowercase kebab-case.`)
  }
  if (!action.label?.en || !action.label?.fr) {
    throw new Error(`Extension client create action ${index} must define bilingual label.en and label.fr`)
  }
  validateExtensionRbacRequirement(action.rbac, `client.createActions.${index}.rbac`)

  return {
    ...action,
    path: await assertContainedPath(rootDir, action.path, `client.createActions.${index}.path`)
  }
}

/** Resolves and validates an extension's payment calculator contribution. */
const resolvePaymentAmountCalculator = async (
  rootDir: string,
  calculator: GcsExtensionPaymentAmountCalculatorDefinition,
  index: number
) => {
  if (calculator.operation !== 'agreement.payments.create') {
    throw new Error(`Extension client payment amount calculator ${index} has invalid operation "${calculator.operation}"`)
  }
  if (!EXTENSION_PAYMENT_AMOUNT_CALCULATOR_ID_PATTERN.test(calculator.id)) {
    throw new Error(`Extension client payment amount calculator ${index} has invalid id "${calculator.id}". Use lowercase kebab-case.`)
  }
  if (!calculator.label?.en || !calculator.label?.fr) {
    throw new Error(`Extension client payment amount calculator ${index} must define bilingual label.en and label.fr`)
  }
  validateExtensionRbacRequirement(calculator.rbac, `client.paymentAmountCalculators.${index}.rbac`)

  return {
    ...calculator,
    path: await assertContainedPath(rootDir, calculator.path, `client.paymentAmountCalculators.${index}.path`)
  }
}

/** Derives a stable, extension-qualified migration key from its file name. */
export const migrationKeyFromPath = (extensionKey: string, migrationPath: string): string => {
  const fileName = basename(migrationPath)
  const extension = extname(fileName)
  const stem = extension ? fileName.slice(0, -extension.length) : fileName
  return `${extensionKey}:${stem}`
}

const resolveMigration = async (
  rootDir: string,
  extensionKey: string,
  migration: GcsExtensionMigrationDefinition,
  index: number
) => ({
  key: migrationKeyFromPath(extensionKey, migration.path),
  path: await assertContainedPath(rootDir, migration.path, `migrations.${index}.path`)
})

const resolveComponent = async (
  rootDir: string,
  component: { path: string } | undefined,
  fieldName: string
) => {
  if (!component) return undefined
  const absolutePath = await assertContainedPath(rootDir, component.path, fieldName)
  return {
    ...component,
    path: absolutePath
  }
}

const resolvePackageRoot = async (rootDir: string, packageName: string): Promise<string> => {
  const require = createRequire(join(rootDir, 'package.json'))
  let currentDir = dirname(require.resolve(packageName))
  while (currentDir !== dirname(currentDir)) {
    const packageJsonPath = join(currentDir, 'package.json')
    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as ExtensionPackageJson
      if (packageJson.name === packageName) {
        return currentDir
      }
    } catch {
      // Keep walking toward the package root.
    }
    currentDir = dirname(currentDir)
  }

  throw new Error(`Could not resolve package root for ${packageName}`)
}

/** Resolves an extension asset while keeping its source inside the package root. */
export const resolveExtensionAsset = async (
  rootDir: string,
  packageName: string,
  asset: GcsExtensionAssetDefinition,
  index: number
): Promise<{ baseURL: string; dir: string }> => {
  if (!asset.baseURL.startsWith('/')) {
    throw new Error(`Extension asset ${index} in ${packageName} must use an absolute baseURL`)
  }

  if (asset.path) {
    return {
      baseURL: asset.baseURL,
      dir: await assertContainedPath(rootDir, asset.path, `assets.${index}.path`)
    }
  }

  if (asset.package && asset.packagePath) {
    const packageRoot = await resolvePackageRoot(rootDir, asset.package)
    const packageAssetDir = resolve(packageRoot, asset.packagePath)
    const realPackageRoot = await realpath(packageRoot)
    const realAssetDir = await realpath(packageAssetDir)
    const relativeAssetDir = relative(realPackageRoot, realAssetDir)
    if (relativeAssetDir.startsWith('..') || relativeAssetDir === '..') {
      throw new Error(`Extension asset ${index} in ${packageName} must stay inside package ${asset.package}`)
    }

    return {
      baseURL: asset.baseURL,
      dir: realAssetDir
    }
  }

  throw new Error(`Extension asset ${index} in ${packageName} must define either path or package/packagePath`)
}

/** Ensures public assets cannot claim host or another extension's URL namespace. */
export const validateExtensionAssetBaseUrls = (
  extensionKey: string,
  assets: Array<{ baseURL: string }>
): void => {
  const extensionBaseUrl = `/extensions/${extensionKey}`
  const seenBaseUrls = new Set<string>()
  for (const [index, asset] of assets.entries()) {
    if (asset.baseURL !== extensionBaseUrl && !asset.baseURL.startsWith(`${extensionBaseUrl}/`)) {
      throw new Error(
        `Extension asset ${index} for ${extensionKey} must stay inside public namespace ${extensionBaseUrl}`
      )
    }
    if (seenBaseUrls.has(asset.baseURL)) {
      throw new Error(`Extension ${extensionKey} has duplicate public asset baseURL "${asset.baseURL}"`)
    }
    seenBaseUrls.add(asset.baseURL)
  }
}

const assertUniqueExtensionValue = (
  seenValues: Set<string>,
  value: string,
  message: string
): void => {
  if (seenValues.has(value)) {
    throw new Error(message)
  }
  seenValues.add(value)
}

/** Lists extension package directories in deterministic lexical order. */
const getExtensionDirectories = async (extensionsDir: string): Promise<string[]> => {
  let entries: string[] = []
  try {
    entries = await readdir(extensionsDir)
  } catch {
    return []
  }

  const extensionDirs: string[] = []
  for (const entry of entries.sort()) {
    if (entry.startsWith('.')) {
      continue
    }

    const extensionDir = join(extensionsDir, entry)
    const extensionStat = await stat(extensionDir)
    if (extensionStat.isDirectory()) {
      extensionDirs.push(extensionDir)
    }
  }

  return extensionDirs
}

const loadExtensionPackageName = async (
  extensionDir: string,
  state: ExtensionScanState
): Promise<string> => {
  const packageRaw = await readFile(join(extensionDir, 'package.json'), 'utf8')
  const packageJson = JSON.parse(packageRaw) as ExtensionPackageJson
  const packageName = validateExtensionPackage(extensionDir, packageJson)
  assertUniqueExtensionValue(state.seenPackages, packageName, `Duplicate extension package name "${packageName}"`)

  return packageName
}

const loadExtensionDefinition = async (
  extensionDir: string,
  importer: ExtensionConfigImporter,
  state: ExtensionScanState
): Promise<GcsExtensionDefinition> => {
  const configPath = join(extensionDir, 'extension.config.ts')
  await access(configPath)
  const definition = await importer.import(configPath, { default: true }) as GcsExtensionDefinition
  validateExtensionDefinition(definition, extensionDir)
  assertUniqueExtensionValue(state.seenKeys, definition.key, `Duplicate extension key "${definition.key}"`)

  return definition
}

/** Rejects duplicate client contribution keys across an extension's registries. */
const assertUniqueExtensionClientKeys = (
  tabs: Awaited<ReturnType<typeof resolveEntityTab>>[],
  createActions: Awaited<ReturnType<typeof resolveCreateAction>>[],
  paymentAmountCalculators: Awaited<ReturnType<typeof resolvePaymentAmountCalculator>>[]
): void => {
  const tabKeys = new Set<string>()
  for (const tab of tabs) {
    const tabKey = `${tab.target}:${tab.id}`
    assertUniqueExtensionValue(tabKeys, tabKey, `Duplicate extension client tab "${tabKey}"`)
  }

  const createActionKeys = new Set<string>()
  for (const createAction of createActions) {
    const actionKey = `${createAction.operation}:${createAction.id}`
    assertUniqueExtensionValue(createActionKeys, actionKey, `Duplicate extension client create action "${actionKey}"`)
  }

  const paymentAmountCalculatorKeys = new Set<string>()
  for (const calculator of paymentAmountCalculators) {
    const calculatorKey = `${calculator.operation}:${calculator.id}`
    assertUniqueExtensionValue(
      paymentAmountCalculatorKeys,
      calculatorKey,
      `Duplicate extension client payment amount calculator "${calculatorKey}"`
    )
  }
}

/** Resolves client contribution component paths and rejects duplicate contribution keys. */
const resolveExtensionClient = async (
  extensionDir: string,
  extensionKey: string,
  definition: GcsExtensionDefinition
) => {
  const slots = await Promise.all((definition.client?.slots ?? []).map(async (slot, index) => ({
    ...slot,
    path: await assertContainedPath(extensionDir, slot.path, `client.slots.${index}.path`)
  })))
  const tabs = await Promise.all((definition.client?.tabs ?? []).map((tab, index) =>
    resolveEntityTab(extensionDir, tab, index)
  ))
  const createActions = await Promise.all((definition.client?.createActions ?? []).map((action, index) =>
    resolveCreateAction(extensionDir, action, index)
  ))
  const paymentAmountCalculators = await Promise.all((definition.client?.paymentAmountCalculators ?? []).map((calculator, index) =>
    resolvePaymentAmountCalculator(extensionDir, calculator, index)
  ))
  assertUniqueExtensionClientKeys(tabs, createActions, paymentAmountCalculators)

  return {
    slots,
    tabs: tabs.map(tab => ({
      ...tab,
      value: `extension:${extensionKey}:${tab.target}:${tab.id}`
    })),
    createActions: createActions.map(createAction => ({
      ...createAction,
      value: `extension:${extensionKey}:${createAction.operation}:${createAction.id}`
    })),
    paymentAmountCalculators: paymentAmountCalculators.map(calculator => ({
      ...calculator,
      value: `extension:${extensionKey}:${calculator.operation}:${calculator.id}`
    }))
  }
}

const resolveExtensionServerHandlers = async (
  extensionDir: string,
  definition: GcsExtensionDefinition
) => {
  validateExtensionServerHandlerRoutes(definition.key, definition.serverHandlers ?? [])
  return await Promise.all((definition.serverHandlers ?? []).map((handler, index) => {
    validateServerHandlerRbac(handler, index)
    return resolveServerHandler(extensionDir, definition.key, handler, index)
  }))
}

const resolveExtensionMigrations = async (
  extensionDir: string,
  definition: GcsExtensionDefinition
) => {
  const migrations = await Promise.all((definition.migrations ?? []).map((migration, index) =>
    resolveMigration(extensionDir, definition.key, migration, index)
  ))
  const migrationKeys = new Set<string>()
  for (const migration of migrations) {
    assertUniqueExtensionValue(migrationKeys, migration.key, `Duplicate extension migration key "${migration.key}"`)
  }

  return migrations
}

const resolveExtensionEntities = async (
  extensionDir: string,
  definition: GcsExtensionDefinition,
  state: ExtensionScanState
) => await Promise.all((definition.entities ?? []).map(async (entity, index) => {
  const qualifiedType = qualifyExtensionEntityType(definition.key, entity.type)
  assertUniqueExtensionValue(
    state.seenEntityTypes,
    qualifiedType,
    `Duplicate extension lifecycle entity type "${qualifiedType}"`
  )
  return await resolveLifecycleEntity(extensionDir, definition.key, entity, index)
}))

const resolveExtensionAdmin = async (
  extensionDir: string,
  definition: GcsExtensionDefinition
) => ({
  agency: await resolveComponent(extensionDir, definition.admin?.agency, 'admin.agency.path'),
  streamConfig: await resolveComponent(extensionDir, definition.admin?.streamConfig, 'admin.streamConfig.path'),
  streamConfigPage: await resolveComponent(extensionDir, definition.admin?.streamConfigPage, 'admin.streamConfigPage.path')
})

const resolveExtensionRuntime = async (
  extensionDir: string,
  definition: GcsExtensionDefinition
) => definition.runtime
  ? { path: await assertContainedPath(extensionDir, definition.runtime.path, 'runtime.path') }
  : undefined

const resolveExtensionNitroPlugin = async (
  extensionDir: string,
  definition: GcsExtensionDefinition
) => definition.nitroPlugin ? await assertContainedPath(extensionDir, definition.nitroPlugin, 'nitroPlugin') : undefined

export const resolveFileStorageProvider = async (
  extensionDir: string,
  definition: GcsExtensionDefinition
) => {
  const provider = definition.fileStorageProvider
  if (!provider) return undefined
  return {
    adapter: {
      path: await assertContainedPath(extensionDir, provider.adapter.path, 'fileStorageProvider.adapter.path')
    },
    ...(provider.metadata
      ? {
          metadata: {
            ...provider.metadata,
            component: {
              ...provider.metadata.component,
              path: await assertContainedPath(
                extensionDir,
                provider.metadata.component.path,
                'fileStorageProvider.metadata.component.path'
              )
            },
            validator: {
              path: await assertContainedPath(
                extensionDir,
                provider.metadata.validator.path,
                'fileStorageProvider.metadata.validator.path'
              )
            }
          }
        }
      : {})
  }
}

/** Loads one extension directory and reserves its package and extension identities. */
const resolveExtensionDirectory = async (
  extensionDir: string,
  importer: ExtensionConfigImporter,
  state: ExtensionScanState
): Promise<GcsResolvedExtension> => {
  const canonicalExtensionDir = await realpath(extensionDir)
  const packageName = await loadExtensionPackageName(canonicalExtensionDir, state)
  const definition = await loadExtensionDefinition(canonicalExtensionDir, importer, state)
  const admin = await resolveExtensionAdmin(canonicalExtensionDir, definition)
  const client = await resolveExtensionClient(canonicalExtensionDir, definition.key, definition)
  const css = await Promise.all((definition.css ?? []).map((cssPath, index) => assertContainedPath(canonicalExtensionDir, cssPath, `css.${index}`)))
  const assets = await Promise.all((definition.assets ?? []).map((asset, index) =>
    resolveExtensionAsset(canonicalExtensionDir, packageName, asset, index)
  ))
  validateExtensionAssetBaseUrls(definition.key, assets)
  const serverHandlers = await resolveExtensionServerHandlers(canonicalExtensionDir, definition)
  const migrations = await resolveExtensionMigrations(canonicalExtensionDir, definition)
  const entities = await resolveExtensionEntities(canonicalExtensionDir, definition, state)
  const runtime = await resolveExtensionRuntime(canonicalExtensionDir, definition)
  const nitroPlugin = await resolveExtensionNitroPlugin(canonicalExtensionDir, definition)
  const fileStorageProvider = await resolveFileStorageProvider(canonicalExtensionDir, definition)

  return {
    key: definition.key,
    name: definition.name,
    description: definition.description,
    sdkVersion: definition.sdkVersion,
    requiredHostCapabilities: definition.requiredHostCapabilities ?? [],
    packageName,
    rootDir: canonicalExtensionDir,
    admin,
    client,
    css,
    assets,
    serverHandlers,
    migrations,
    ...(entities.length > 0 ? { entities } : {}),
    runtime,
    nitroPlugin,
    fileStorageProvider
  }
}

const handleExtensionScanError = (
  logger: ReturnType<typeof useLogger>,
  extensionDir: string,
  error: unknown
): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('Cannot find module') || message.includes('ERR_MODULE_NOT_FOUND')) {
    throw new Error(`${message}\n\nExtension dependencies may be missing. Run "bun install" after adding or removing folders in extensions/*.`)
  }
  if (message.includes('ENOENT') && (message.includes('package.json') || message.includes('extension.config.ts'))) {
    logger.warn(`Skipping ${extensionDir}; extension folders require package.json and extension.config.ts`)
    return true
  }
  throw error
}

/** Discovers extension packages, skipping incomplete skeletons and rejecting invalid packages. */
const scanExtensions = async (nuxt: Nuxt): Promise<GcsResolvedExtension[]> => {
  const logger = useLogger('gcs-extensions')
  const rootDir = nuxt.options.rootDir
  const extensionsDir = resolve(rootDir, 'extensions')
  const jiti = createJiti(pathToFileURL(rootDir).href, {
    interopDefault: true,
    moduleCache: false
  })
  const state: ExtensionScanState = {
    seenKeys: new Set<string>(),
    seenPackages: new Set<string>(),
    seenEntityTypes: new Set<string>()
  }
  const resolvedExtensions: GcsResolvedExtension[] = []
  const extensionDirs = await getExtensionDirectories(extensionsDir)

  for (const extensionDir of extensionDirs) {
    try {
      resolvedExtensions.push(await resolveExtensionDirectory(extensionDir, jiti, state))
    } catch (error: unknown) {
      if (handleExtensionScanError(logger, extensionDir, error)) {
        continue
      }
    }
  }

  return resolvedExtensions
}

/** Creates a stable Nuxt component name for an extension contribution. */
export const componentName = (prefix: string, extensionKey: string, index?: number): string => {
  const suffix = extensionKey.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')
  return index === undefined ? `${prefix}${suffix}` : `${prefix}${suffix}${index}`
}

const withoutComponentPath = <T extends { path: string }>(
  definition: T,
  generatedComponentName: string
): Omit<T, 'path'> & { componentName: string } => {
  const { path: _path, ...metadata } = definition
  return {
    ...metadata,
    componentName: generatedComponentName
  }
}

/** Builds browser-safe extension metadata with stable generated component names. */
const buildClientExtensionMetadata = (extension: GcsResolvedExtension): GcsClientExtensionManifest => ({
  key: extension.key,
  name: extension.name,
  description: extension.description,
  sdkVersion: extension.sdkVersion,
  admin: {
    agency: extension.admin.agency
      ? withoutComponentPath(extension.admin.agency, componentName('ExtensionAgency', extension.key))
      : undefined,
    streamConfig: extension.admin.streamConfig
      ? withoutComponentPath(extension.admin.streamConfig, componentName('ExtensionStreamConfig', extension.key))
      : undefined,
    streamConfigPage: extension.admin.streamConfigPage
      ? withoutComponentPath(extension.admin.streamConfigPage, componentName('ExtensionStreamConfigPage', extension.key))
      : undefined
  },
  client: {
    slots: extension.client.slots.map((slot, index) =>
      withoutComponentPath(slot, componentName('ExtensionSlot', extension.key, index))
    ),
    tabs: extension.client.tabs.map((tab, index) =>
      withoutComponentPath(tab, componentName('ExtensionEntityTab', extension.key, index))
    ),
    createActions: extension.client.createActions.map((action, index) =>
      withoutComponentPath(action, componentName('ExtensionCreateAction', extension.key, index))
    ),
    paymentAmountCalculators: extension.client.paymentAmountCalculators.map((calculator, index) =>
      withoutComponentPath(
        calculator,
        componentName('ExtensionPaymentAmountCalculator', extension.key, index)
      )
    )
  },
  fileStorageProvider: extension.fileStorageProvider
    ? {
        ...(extension.fileStorageProvider.metadata
          ? {
              metadata: {
                persistence: extension.fileStorageProvider.metadata.persistence,
                mutability: extension.fileStorageProvider.metadata.mutability,
                contractVersion: extension.fileStorageProvider.metadata.contractVersion,
                component: withoutComponentPath(
                  extension.fileStorageProvider.metadata.component,
                  componentName('ExtensionFileStorageMetadata', extension.key)
                )
              }
            }
          : {})
      }
    : undefined
})

const serializeClientExtension = (extension: GcsResolvedExtension): string =>
  JSON.stringify(buildClientExtensionMetadata(extension))

const registryContributionId = (
  contributionType: 'handler' | 'migration' | 'runtime' | 'entity_adapter' | 'storage_adapter' | 'storage_metadata_validator',
  extension: GcsResolvedExtension,
  identityParts: string[]
): string => {
  const identity = JSON.stringify([
    extension.key,
    contributionType,
    ...identityParts
  ])
  const hash = createHash('sha256').update(identity).digest('hex').slice(0, 24)
  return `${contributionType}_${hash}`
}

const extensionRelativePath = (extension: GcsResolvedExtension, filePath: string): string =>
  relative(extension.rootDir, filePath).replaceAll('\\', '/')

interface ExtensionServerRegistryBuild {
  extensions: GcsRegisteredExtension[]
  contents: string
}

/** Generates sanitized server metadata and statically analyzable lazy contribution imports. */
export const buildExtensionServerRegistry = (
  extensions: GcsResolvedExtension[]
): ExtensionServerRegistryBuild => {
  const sourceLoaderNames = new Map<string, string>()
  const sourceLoaderDeclarations: string[] = []
  const contributionLoaderEntries: string[] = []
  const contributionIds = new Set<string>()

  const registerContributionLoader = (id: string, filePath: string): void => {
    if (contributionIds.has(id)) {
      throw new Error(`Duplicate generated extension contribution identity "${id}"`)
    }
    contributionIds.add(id)

    let loaderName = sourceLoaderNames.get(filePath)
    if (!loaderName) {
      loaderName = `loadExtensionSource${sourceLoaderNames.size}`
      sourceLoaderNames.set(filePath, loaderName)
      sourceLoaderDeclarations.push(`const ${loaderName} = () => import(${JSON.stringify(filePath)})`)
    }
    contributionLoaderEntries.push(`${JSON.stringify(id)}: ${loaderName}`)
  }

  const registeredExtensions = extensions.map((extension): GcsRegisteredExtension => {
    const normalizedServerHandlers = normalizeExtensionServerHandlerRoutes(extension.key, extension.serverHandlers)
    const serverHandlers = extension.serverHandlers.map((handler, index) => {
      const normalizedHandler = normalizedServerHandlers[index]
      if (!normalizedHandler) {
        throw new Error(`Extension ${extension.key} server handler ${index} normalization is missing`)
      }
      const relativePath = extensionRelativePath(extension, handler.path)
      const id = registryContributionId('handler', extension, [
        normalizedHandler.method,
        normalizedHandler.route,
        relativePath
      ])
      registerContributionLoader(id, handler.path)
      return {
        id,
        route: normalizedHandler.route,
        method: normalizedHandler.method,
        auth: handler.auth,
        rbac: handler.rbac
      }
    })
    const migrations = extension.migrations.map(migration => {
      const id = registryContributionId('migration', extension, [
        migration.key,
        extensionRelativePath(extension, migration.path)
      ])
      registerContributionLoader(id, migration.path)
      return {
        id,
        key: migration.key
      }
    })
    const runtime = extension.runtime
      ? {
          id: registryContributionId('runtime', extension, [
            extensionRelativePath(extension, extension.runtime.path)
          ])
        }
      : undefined

    if (runtime && extension.runtime) {
      registerContributionLoader(runtime.id, extension.runtime.path)
    }

    const entities = (extension.entities ?? []).map(entity => {
      const id = registryContributionId('entity_adapter', extension, [
        entity.type,
        extensionRelativePath(extension, entity.adapter.path)
      ])
      registerContributionLoader(id, entity.adapter.path)
      const { adapter: _adapter, ...metadata } = entity
      return {
        ...metadata,
        adapter: { id }
      }
    })

    const fileStorageProvider = extension.fileStorageProvider
      ? (() => {
          const adapterId = registryContributionId('storage_adapter', extension, [
            extensionRelativePath(extension, extension.fileStorageProvider.adapter.path)
          ])
          registerContributionLoader(adapterId, extension.fileStorageProvider.adapter.path)
          const metadata = extension.fileStorageProvider.metadata
          if (!metadata) return { adapter: { id: adapterId } }
          const validatorId = registryContributionId('storage_metadata_validator', extension, [
            extensionRelativePath(extension, metadata.validator.path)
          ])
          registerContributionLoader(validatorId, metadata.validator.path)
          return {
            adapter: { id: adapterId },
            metadata: {
              persistence: metadata.persistence,
              mutability: metadata.mutability,
              contractVersion: metadata.contractVersion,
              component: withoutComponentPath(
                metadata.component,
                componentName('ExtensionFileStorageMetadata', extension.key)
              ),
              validator: { id: validatorId }
            }
          }
        })()
      : undefined

    return {
      ...buildClientExtensionMetadata(extension),
      packageName: extension.packageName,
      requiredHostCapabilities: extension.requiredHostCapabilities,
      serverHandlers,
      migrations,
      ...(entities.length > 0 ? { entities } : {}),
      fileStorageProvider,
      runtime
    }
  })

  return {
    extensions: registeredExtensions,
    contents: [
      ...sourceLoaderDeclarations,
      `const gcsExtensionModuleLoaders = {${contributionLoaderEntries.join(',')}}`,
      `export const gcsExtensions = ${JSON.stringify(registeredExtensions)}`,
      'export const getGcsExtensions = () => gcsExtensions',
      'export const getGcsExtensionByKey = key => gcsExtensions.find(extension => extension.key === key) ?? null',
      'export const loadGcsExtensionModule = async id => {',
      '  const loader = gcsExtensionModuleLoaders[id]',
      '  if (typeof loader !== "function") {',
      '    throw new Error(`Unknown extension contribution "${id}"`)',
      '  }',
      '  return await loader()',
      '}'
    ].join('\n')
  }
}

type ExtensionComponentDefinition = {
  path: string
}

const getExtensionComponentDefinitions = (extension: GcsResolvedExtension): ExtensionComponentDefinition[] => [
  extension.admin.agency,
  extension.admin.streamConfig,
  extension.admin.streamConfigPage,
  ...extension.client.slots,
  ...extension.client.tabs,
  ...extension.client.createActions,
  ...extension.client.paymentAmountCalculators,
  extension.fileStorageProvider?.metadata?.component
].filter((component): component is ExtensionComponentDefinition => Boolean(component))

const registerExtensionCssAndComponents = (nuxt: Nuxt, extensions: GcsResolvedExtension[]) => {
  for (const extension of extensions) {
    for (const css of extension.css) {
      nuxt.options.css.push(css)
    }

    for (const component of getExtensionComponentDefinitions(extension)) {
      addComponentsDir({
        path: resolve(component.path, '..'),
        pathPrefix: false,
        global: false
      })
    }
  }
}

const addComponentRegistryEntry = (
  imports: string[],
  componentEntries: string[],
  prefix: string,
  extensionKey: string,
  path: string,
  index?: number
) => {
  const name = componentName(prefix, extensionKey, index)
  imports.push(`import ${name} from ${JSON.stringify(path)}`)
  componentEntries.push(`${JSON.stringify(name)}: markRaw(${name})`)
}

/** Indexes contributed Vue components by their stable generated component names. */
const buildExtensionComponentRegistry = (extensions: GcsResolvedExtension[]) => {
  const imports: string[] = []
  const componentEntries: string[] = []

  for (const extension of extensions) {
    if (extension.admin.agency) {
      addComponentRegistryEntry(imports, componentEntries, 'ExtensionAgency', extension.key, extension.admin.agency.path)
    }
    if (extension.admin.streamConfig) {
      addComponentRegistryEntry(imports, componentEntries, 'ExtensionStreamConfig', extension.key, extension.admin.streamConfig.path)
    }
    if (extension.admin.streamConfigPage) {
      addComponentRegistryEntry(imports, componentEntries, 'ExtensionStreamConfigPage', extension.key, extension.admin.streamConfigPage.path)
    }
    for (const [index, slot] of extension.client.slots.entries()) {
      addComponentRegistryEntry(imports, componentEntries, 'ExtensionSlot', extension.key, slot.path, index)
    }
    for (const [index, tab] of extension.client.tabs.entries()) {
      addComponentRegistryEntry(imports, componentEntries, 'ExtensionEntityTab', extension.key, tab.path, index)
    }
    for (const [index, action] of extension.client.createActions.entries()) {
      addComponentRegistryEntry(imports, componentEntries, 'ExtensionCreateAction', extension.key, action.path, index)
    }
    for (const [index, calculator] of extension.client.paymentAmountCalculators.entries()) {
      addComponentRegistryEntry(imports, componentEntries, 'ExtensionPaymentAmountCalculator', extension.key, calculator.path, index)
    }
    if (extension.fileStorageProvider?.metadata) {
      addComponentRegistryEntry(
        imports,
        componentEntries,
        'ExtensionFileStorageMetadata',
        extension.key,
        extension.fileStorageProvider.metadata.component.path
      )
    }
  }

  return { imports, componentEntries }
}

/** Emits client and server metadata, the component registry, and Tailwind source templates. */
const addExtensionTemplates = (
  nuxt: Nuxt,
  extensions: GcsResolvedExtension[],
  imports: string[],
  componentEntries: string[]
): string => {
  const metadataTemplate = addTemplate({
    filename: 'gcs-extensions/metadata.mjs',
    write: true,
    getContents: () => [
      `export const gcsExtensions = [${extensions.map(serializeClientExtension).join(',')}]`,
      'export const getGcsExtensions = () => gcsExtensions',
      'export const getGcsExtensionByKey = key => gcsExtensions.find(extension => extension.key === key) ?? null'
    ].join('\n')
  })
  nuxt.options.alias['#gcs-extensions/metadata'] = metadataTemplate.dst

  const serverRegistry = buildExtensionServerRegistry(extensions)
  const serverRegistryTemplate = addTemplate({
    filename: 'gcs-extensions/server-registry.mjs',
    write: true,
    getContents: () => serverRegistry.contents
  })
  nuxt.options.alias['#gcs-extensions/server-registry'] = serverRegistryTemplate.dst

  const registryTemplate = addTemplate({
    filename: 'gcs-extensions/registry.mjs',
    write: true,
    getContents: () => [
      'import { markRaw } from "vue"',
      'export { gcsExtensions, getGcsExtensions, getGcsExtensionByKey } from "#gcs-extensions/metadata"',
      ...imports,
      `export const gcsExtensionComponents = {${componentEntries.join(',')}}`,
      'export const getGcsExtensionComponent = name => gcsExtensionComponents[name] ?? null'
    ].join('\n')
  })
  nuxt.options.alias['#gcs-extensions/registry'] = registryTemplate.dst

  const sourceTemplate = addTemplate({
    filename: 'gcs-extensions/tailwind-sources.css',
    write: true,
    getContents: () => extensions.map(extension => `@source "${extension.rootDir.replaceAll('\\', '/')}/**/*.{vue,ts,js}";`).join('\n')
  })
  if (extensions.length > 0) {
    nuxt.options.css.push(sourceTemplate.dst)
  }

  return serverRegistryTemplate.dst
}

/** Registers extension aliases, plugins, and public assets with Nitro. */
const configureExtensionNitro = (
  nuxt: Nuxt,
  extensions: GcsResolvedExtension[],
  aliases: Record<string, string>
) => {
  let productionAssetStage: string | null = null
  nuxt.hook('close', async () => {
    if (productionAssetStage !== null) {
      await rm(productionAssetStage, { force: true, recursive: true })
    }
  })
  nuxt.hook('nitro:config', async nitroConfig => {
    nitroConfig.alias = {
      ...nitroConfig.alias,
      ...aliases
    }
    nitroConfig.plugins = nitroConfig.plugins ?? []
    nitroConfig.publicAssets = nitroConfig.publicAssets ?? []

    for (const extension of extensions) {
      if (extension.nitroPlugin) {
        nitroConfig.plugins.push(extension.nitroPlugin)
      }
      for (const [assetIndex, asset] of extension.assets.entries()) {
        let assetDir = asset.dir
        if (!nuxt.options.dev && await containsProductionAssetSource(asset.dir)) {
          if (productionAssetStage === null) {
            productionAssetStage = await mkdtemp(join(tmpdir(), 'gcs-extension-assets-'))
          }
          assetDir = join(
            productionAssetStage,
            extension.key,
            String(assetIndex)
          )
          await rm(assetDir, { force: true, recursive: true })
          await mkdir(dirname(assetDir), { recursive: true })
          await cp(asset.dir, assetDir, {
            filter: source => !PRODUCTION_ASSET_SOURCE_EXTENSIONS.has(extname(source)),
            recursive: true
          })
        }
        nitroConfig.publicAssets.push({
          dir: assetDir,
          baseURL: asset.baseURL
        })
      }
    }
  })
}

export default defineNuxtModule({
  meta: {
    name: 'gcs-extensions',
    configKey: 'gcsExtensions'
  },
  setup: async (_options, nuxt) => {
    const aliases = sdkAliases(nuxt.options.rootDir)
    nuxt.options.alias = {
      ...nuxt.options.alias,
      ...aliases
    }

    const extensions = await scanExtensions(nuxt)

    registerExtensionCssAndComponents(nuxt, extensions)
    const { imports, componentEntries } = buildExtensionComponentRegistry(extensions)
    const serverRegistryPath = addExtensionTemplates(nuxt, extensions, imports, componentEntries)
    configureExtensionNitro(nuxt, extensions, {
      ...aliases,
      '#gcs-extensions/server-registry': serverRegistryPath
    })
  }
})
