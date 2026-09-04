/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Temporary coverage while extension dispatch helpers receive complete documentation. */
import type { H3Event } from 'h3'
import { createError, getMethod } from 'h3'
import {
  isGcsExtensionUserError,
  type GcsExtensionAgreementAccess,
  type GcsExtensionWriteAuthorization
} from '@gcs-ssc/extensions/server'
import {
  canAccessExtensionEntity,
  getExtensionConfigurationForEntity,
  getExtensionStreamConfiguration,
  isExtensionEnabledForAgency,
  lockExtensionLifecycleScope,
  resolveExtensionEntityContext,
  resolveExtensionServerHandler,
  resolveExtensionStreamContext,
  resolveExtensionUserErrorDetails,
  resolveExtensionUserErrorMessage
} from '~~/server/utils/extensions'
import { throwApiError } from '~~/server/utils/api-errors'
import {
  authorizeFreshAssignedItem,
  authorizeWithFreshAuthContext,
  requireFreshAuthContext,
  type AuthContext
} from '~~/server/utils/authorize'
import type { Database } from '~~/shared/types/database'
import type { AuthorizationSubject } from '~~/shared/utils/abilities'
import { isAuthorizationSubject } from '~~/shared/utils/abilities'
import type { Kysely, Transaction } from 'kysely'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import {
  canAccessAgreement,
  listVisibleAgreementOptions,
  resolveAgreementScopeContext
} from '~~/server/utils/agreement'
import { createAgreementClaimAggregate } from '~~/server/utils/agreement-claim'
import { resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'
import { lockTransferPaymentStreams } from '~~/server/utils/transfer-payment-stream-lock'
import { assertBusinessStatusMutationAllowed } from '~~/server/utils/business-status-runtime'
import { assertAgreementCloseoutWriteAllowed } from '~~/server/utils/agreement-write-transaction'

const throwExtensionDispatchError = (
  statusCode: number,
  code: string,
  message: string
): never => {
  throw createError({
    statusCode,
    message,
    data: {
      message,
      code
    }
  })
}

const resolveExtensionAuthorizationSubject = (subject: string): AuthorizationSubject => {
  if (isAuthorizationSubject(subject)) return subject
  return throwExtensionDispatchError(500, 'EXTENSION_RBAC_SUBJECT_INVALID', 'Extension route RBAC subject is invalid.')
}

const resolveExtensionRouteIdentifiers = (event: H3Event) => {
  const extensionKey = getRouterParam(event, 'extensionKey')
  const route = getRouterParam(event, 'route')

  if (!extensionKey || !route) {
    throwExtensionDispatchError(400, 'MISSING_IDS', 'Missing extension route identifiers.')
  }

  const resolvedExtensionKey = extensionKey as string
  const resolvedRoute = route as string

  return {
    extensionKey: resolvedExtensionKey,
    route: resolvedRoute,
    routePath: Array.isArray(route) ? `/${route.join('/')}` : `/${resolvedRoute}`
  }
}

/** Rejects extension routes when the targeted stream has not enabled the extension. */
const assertExtensionStreamEnabled = async (
  event: H3Event,
  extensionKey: string,
  streamId: string | undefined
): Promise<void> => {
  if (!streamId) {
    return
  }

  const streamContext = await resolveExtensionStreamContext(event.context.$db, streamId)
  if (!streamContext) {
    throwExtensionDispatchError(404, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'Transfer payment stream not found.')
  }

  const resolvedStreamContext = streamContext as NonNullable<typeof streamContext>
  const isAgencyEnabled = await isExtensionEnabledForAgency(event.context.$db, extensionKey, resolvedStreamContext.agencyId)
  if (!isAgencyEnabled) {
    throwExtensionDispatchError(403, 'EXTENSION_AGENCY_DISABLED', 'Extension is disabled for this agency.')
  }
}

const assertExtensionAgencyEnabled = async (
  event: H3Event,
  extensionKey: string,
  agencyId: string | undefined
): Promise<void> => {
  if (!agencyId) {
    return
  }

  if (!isPositivePostgresBigintText(agencyId)) {
    throwExtensionDispatchError(404, 'AGENCY_NOT_FOUND', 'Agency not found.')
  }

  const agency = await event.context.$db
    .selectFrom('Agency_Profile')
    .select('id')
    .where('id', '=', agencyId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!agency) {
    throwExtensionDispatchError(404, 'AGENCY_NOT_FOUND', 'Agency not found.')
  }

  const isAgencyEnabled = await isExtensionEnabledForAgency(event.context.$db, extensionKey, agencyId)
  if (!isAgencyEnabled) {
    throwExtensionDispatchError(403, 'EXTENSION_AGENCY_DISABLED', 'Extension is disabled for this agency.')
  }
}

/** Enforces a handler's declared stream, agency, entity, or ability RBAC contract. */
const prepareExtensionRbacContext = async (
  event: H3Event,
  authContext: AuthContext,
  extensionKey: string,
  resolvedHandler: NonNullable<Awaited<ReturnType<typeof resolveExtensionServerHandler>>>
): Promise<void> => {
  const rbac = resolvedHandler.routeDefinition.rbac
  if (!rbac) {
    return
  }
  const subject = resolveExtensionAuthorizationSubject(rbac.subject)

  if ('stream' in rbac) {
    const streamId = resolvedHandler.params[rbac.stream.param]
    if (!streamId) {
      throwExtensionDispatchError(400, 'EXTENSION_RBAC_STREAM_PARAM_MISSING', 'Extension RBAC stream parameter is missing.')
    }
    const resolvedStreamId = String(streamId)

    const streamContext = await resolveExtensionStreamContext(event.context.$db, resolvedStreamId)
    if (!streamContext) {
      throwExtensionDispatchError(404, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'Transfer payment stream not found.')
    }
    const resolvedStreamContext = streamContext as NonNullable<typeof streamContext>
    const streamConfiguration = await getExtensionStreamConfiguration(event.context.$db, extensionKey, resolvedStreamId)
    if (!streamConfiguration.enabled) {
      throwExtensionDispatchError(403, 'EXTENSION_STREAM_DISABLED', 'Extension is disabled for this stream.')
    }

    const canAccess = authContext.userAbilities.authorize(
      subject,
      rbac.action,
      resolvedStreamContext.scope
    )
    if (!canAccess) {
      throwExtensionDispatchError(403, 'EXTENSION_RBAC_FORBIDDEN', 'Extension route access is forbidden.')
    }

    event.context.gcsExtension = {
      extensionKey,
      config: streamConfiguration.config,
      stream: {
        streamId: resolvedStreamId,
        agencyId: resolvedStreamContext.agencyId,
        scope: resolvedStreamContext.scope,
        rbac: {
          subject: rbac.subject,
          action: rbac.action
        }
      }
    }
    return
  }

  if ('agency' in rbac) {
    const agencyId = resolvedHandler.params[rbac.agency.param]
    if (!agencyId) {
      throwExtensionDispatchError(400, 'EXTENSION_RBAC_AGENCY_PARAM_MISSING', 'Extension RBAC agency parameter is missing.')
    }
    const resolvedAgencyId = String(agencyId)

    const isAgencyEnabled = await isExtensionEnabledForAgency(event.context.$db, extensionKey, resolvedAgencyId)
    if (!isAgencyEnabled) {
      throwExtensionDispatchError(403, 'EXTENSION_AGENCY_DISABLED', 'Extension is disabled for this agency.')
    }

    const scope = { type: 'agency' as const, agencyId: resolvedAgencyId }
    if (!authContext.userAbilities.authorize(subject, rbac.action, scope)) {
      throwExtensionDispatchError(403, 'EXTENSION_RBAC_FORBIDDEN', 'Extension route access is forbidden.')
    }

    event.context.gcsExtension = {
      extensionKey,
      config: {},
      agency: {
        agencyId: resolvedAgencyId,
        scope,
        rbac: {
          subject: rbac.subject,
          action: rbac.action
        }
      }
    }
    return
  }

  const entityId = resolvedHandler.params[rbac.entity.param]
  if (!entityId) {
    throwExtensionDispatchError(400, 'EXTENSION_RBAC_ENTITY_PARAM_MISSING', 'Extension RBAC entity parameter is missing.')
  }
  const resolvedEntityId = entityId as string

  const entityContext = await resolveExtensionEntityContext(event.context.$db, rbac.entity.target, resolvedEntityId)
  if (entityContext === null) {
    throwExtensionDispatchError(404, 'EXTENSION_RBAC_ENTITY_NOT_FOUND', 'Extension RBAC entity not found.')
  }
  const resolvedEntityContext = entityContext as NonNullable<typeof entityContext>

  const config = await getExtensionConfigurationForEntity(event.context.$db, extensionKey, resolvedEntityContext)
  if (!config) {
    throwExtensionDispatchError(403, 'EXTENSION_ENTITY_DISABLED', 'Extension is disabled for this entity.')
  }

  const canAccess = await canAccessExtensionEntity(authContext, rbac, resolvedEntityContext, event.context.$db)
  if (!canAccess) {
    throwExtensionDispatchError(403, 'EXTENSION_RBAC_FORBIDDEN', 'Extension route access is forbidden.')
  }

  event.context.gcsExtension = {
    extensionKey,
    config,
    entity: {
      ...resolvedEntityContext,
      rbac: {
        subject: rbac.subject,
        action: rbac.action
      }
    }
  }
}

/** Builds the ordered authorization phases for an extension-owned write transaction. */
const createExtensionWriteAuthorization = (
  event: H3Event,
  extensionKey: string,
  resolvedHandler: NonNullable<Awaited<ReturnType<typeof resolveExtensionServerHandler>>>
): GcsExtensionWriteAuthorization | undefined => {
  const rbac = resolvedHandler.routeDefinition.rbac
  if (!rbac) {
    return undefined
  }
  const subject = resolveExtensionAuthorizationSubject(rbac.subject)

  let lockedDb: Kysely<Database> | undefined
  let lockedAuthContext: AuthContext | undefined

  const writeAuthorization: GcsExtensionWriteAuthorization = {
    lockAuthState: async (rawDb: unknown): Promise<void> => {
      const db = rawDb as Kysely<Database>
      lockedAuthContext = await requireFreshAuthContext(event, db)
      lockedDb = db
    },
    authorizeCurrentEntity: async (rawDb: unknown): Promise<void> => {
      const db = rawDb as Kysely<Database>
      if (lockedDb !== db || !lockedAuthContext) {
        throw new Error('Extension write authorization requires auth-state locking on the same transaction first.')
      }

      if ('agency' in rbac) {
        const agencyId = resolvedHandler.params[rbac.agency.param]
        if (!agencyId) {
          throwExtensionDispatchError(400, 'EXTENSION_RBAC_AGENCY_PARAM_MISSING', 'Extension RBAC agency parameter is missing.')
        }
        const resolvedAgencyId = String(agencyId)
        await lockExtensionLifecycleScope(db as Transaction<Database>, extensionKey, resolvedAgencyId)
        const agency = await db
          .selectFrom('Agency_Profile')
          .select('id')
          .where('id', '=', resolvedAgencyId)
          .where('_deleted', '=', false)
          .forUpdate()
          .executeTakeFirst()
        if (!agency) {
          throwExtensionDispatchError(404, 'EXTENSION_RBAC_ENTITY_NOT_FOUND', 'Extension RBAC entity not found.')
        }
        const enabled = await isExtensionEnabledForAgency(db, extensionKey, resolvedAgencyId)
        if (!enabled) {
          throwExtensionDispatchError(403, 'EXTENSION_AGENCY_DISABLED', 'Extension is disabled for this agency.')
        }
        await authorizeWithFreshAuthContext(
          event,
          lockedAuthContext,
          subject,
          rbac.action,
          { type: 'agency', agencyId: resolvedAgencyId }
        )
        return
      }

      if ('stream' in rbac) {
        const streamId = resolvedHandler.params[rbac.stream.param]
        if (!streamId) {
          throwExtensionDispatchError(400, 'EXTENSION_RBAC_STREAM_PARAM_MISSING', 'Extension RBAC stream parameter is missing.')
        }
        const resolvedStreamId = String(streamId)
        const streamContext = await resolveExtensionStreamContext(db, resolvedStreamId)
        if (!streamContext) {
          throwExtensionDispatchError(404, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'Transfer payment stream not found.')
        }
        const currentStreamContext = streamContext as NonNullable<typeof streamContext>
        await lockExtensionLifecycleScope(
          db as Transaction<Database>,
          extensionKey,
          currentStreamContext.agencyId,
          resolvedStreamId
        )
        const agencyEnabled = await isExtensionEnabledForAgency(db, extensionKey, currentStreamContext.agencyId)
        if (!agencyEnabled) {
          throwExtensionDispatchError(403, 'EXTENSION_AGENCY_DISABLED', 'Extension is disabled for this agency.')
        }
        const streamConfiguration = await getExtensionStreamConfiguration(db, extensionKey, resolvedStreamId)
        if (!streamConfiguration.enabled) {
          throwExtensionDispatchError(403, 'EXTENSION_STREAM_DISABLED', 'Extension is disabled for this stream.')
        }
        await authorizeWithFreshAuthContext(event, lockedAuthContext, subject, rbac.action, async ({ context }) => {
          const canAccess = context.userAbilities.authorize(
            subject,
            rbac.action,
            currentStreamContext.scope
          )
          if (canAccess) return { bypass: true }
          return { scope: currentStreamContext.scope }
        })
        return
      }

      const entityId = resolvedHandler.params[rbac.entity.param]
      if (!entityId) {
        throwExtensionDispatchError(400, 'EXTENSION_RBAC_ENTITY_PARAM_MISSING', 'Extension RBAC entity parameter is missing.')
      }
      await authorizeWithFreshAuthContext(event, lockedAuthContext, subject, rbac.action, async ({ context }) => {
        const entityContext = await resolveExtensionEntityContext(
          db,
          rbac.entity.target,
          String(entityId)
        )
        if (!entityContext) {
          throwExtensionDispatchError(404, 'EXTENSION_RBAC_ENTITY_NOT_FOUND', 'Extension RBAC entity not found.')
        }
        const currentEntityContext = entityContext as NonNullable<typeof entityContext>
        await lockExtensionLifecycleScope(
          db as Transaction<Database>,
          extensionKey,
          currentEntityContext.agencyId,
          currentEntityContext.streamId
        )
        const config = await getExtensionConfigurationForEntity(db, extensionKey, currentEntityContext)
        if (!config) {
          throwExtensionDispatchError(403, 'EXTENSION_ENTITY_DISABLED', 'Extension is disabled for this entity.')
        }

        const canAccess = await canAccessExtensionEntity(context, rbac, currentEntityContext, db)
        if (canAccess) return { bypass: true }
        return { scope: currentEntityContext.scope }
      })
    },
    lockAndAuthorizeAgreement: async (rawDb, input): Promise<boolean> => {
      const db = rawDb as Kysely<Database>
      if (lockedDb !== db || !lockedAuthContext) {
        throw new Error('Extension agreement authorization requires auth-state locking on the same transaction first.')
      }
      const agreement = await db
        .selectFrom('Funding_Case_Agreement_Profile')
        .select('id')
        .where('id', '=', input.agreementId)
        .where('_deleted', '=', false)
        .forUpdate('Funding_Case_Agreement_Profile')
        .executeTakeFirst()
      if (!agreement) return false
      const agreementContext = await resolveAgreementScopeContext(input.agreementId, db)
      if (!agreementContext || agreementContext.streamId !== input.streamId) return false
      await authorizeWithFreshAuthContext(event, lockedAuthContext, 'agreement', input.action, async ({ context }) => {
        const canAccess = await canAccessAgreement(context, input.action, agreementContext.scope, db)
        if (canAccess) return { bypass: true }
        return { denied: true }
      })
      return true
    },
    createAgreementClaim: async (rawDb, input) => {
      const db = rawDb as Transaction<Database>
      if (lockedDb !== db || !lockedAuthContext) {
        throw new Error('Extension Claim creation requires auth-state locking on the same transaction first.')
      }
      if (resolvedHandler.params.streamId && resolvedHandler.params.streamId !== input.streamId) {
        return { status: 'agreement_unavailable' }
      }

      const lockedStreams = await lockTransferPaymentStreams(db, [input.streamId])
      if (!lockedStreams.has(input.streamId)) return { status: 'agreement_unavailable' }
      const agreement = await db.selectFrom('Funding_Case_Agreement_Profile')
        .select(['id', 'egcs_fc_status'])
        .where('id', '=', input.agreementId)
        .where('_deleted', '=', false)
        .forUpdate('Funding_Case_Agreement_Profile')
        .executeTakeFirst()
      if (!agreement) return { status: 'agreement_unavailable' }

      const agreementContext = await resolveAgreementScopeContext(input.agreementId, db)
      if (!agreementContext || agreementContext.streamId !== input.streamId) {
        return { status: 'agreement_unavailable' }
      }
      await assertAgreementCloseoutWriteAllowed(
        event,
        db,
        input.agreementId,
        agreement.egcs_fc_status
      )
      await assertBusinessStatusMutationAllowed(
        event,
        db,
        'fundingcaseagreement',
        input.agreementId
      )
      await authorizeFreshAssignedItem(
        event,
        db,
        lockedAuthContext,
        'fundingcaseagreement',
        input.agreementId,
        'create'
      )
      const creatorId = await resolveAssignmentCommonUserId(db, lockedAuthContext.userId)
      if (!creatorId) {
        throw new Error('Extension Claim creation requires an active Common User for the authenticated actor.')
      }
      const result = await createAgreementClaimAggregate(
        db,
        input,
        agreementContext.agencyId,
        creatorId
      )
      if (result.status !== 'created') return result
      return {
        status: result.status,
        claimId: result.claimId,
        lineItemIds: result.lineItemIds,
        draftStatusId: result.draftStatusId
      }
    }
  }
  writeAuthorization.authorizeCurrentScope = writeAuthorization.authorizeCurrentEntity
  return writeAuthorization
}

/** Builds host-owned agreement visibility operations for extension routes. */
const createExtensionAgreementAccess = (authContext: AuthContext): GcsExtensionAgreementAccess => ({
  listVisibleOptions: async (rawDb, input) => await listVisibleAgreementOptions(
    authContext,
    input.action,
    input.streamId,
    rawDb as Kysely<Database>
  )
})

const handleExtensionDispatchError = async (
  event: H3Event,
  error: unknown
) => {
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

/** Resolves, authorizes, and invokes an extension server route with isolated route parameters. */
export const dispatchExtensionServerRoute = async (
  event: H3Event,
  authContext: AuthContext
) => {
  const { extensionKey, route, routePath } = resolveExtensionRouteIdentifiers(event)
  const resolvedHandler = await resolveExtensionServerHandler(extensionKey, getMethod(event), routePath)
  if (!resolvedHandler) {
    throwExtensionDispatchError(404, 'EXTENSION_ROUTE_NOT_FOUND', 'Extension route not found.')
  }
  const handler = resolvedHandler as NonNullable<typeof resolvedHandler>

  await assertExtensionStreamEnabled(event, extensionKey, handler.params.streamId)
  if (!handler.params.streamId) {
    await assertExtensionAgencyEnabled(event, extensionKey, handler.params.agencyId)
  }
  await prepareExtensionRbacContext(event, authContext, extensionKey, handler)
  const writeAuthorization = createExtensionWriteAuthorization(event, extensionKey, handler)
  if (event.context.gcsExtension) {
    event.context.gcsExtension.agreementAccess = createExtensionAgreementAccess(authContext)
    if (writeAuthorization) {
      event.context.gcsExtension.writeAuthorization = writeAuthorization
    }
  }

  const originalParams = event.context.params ?? {}
  const originalAuthContext = event.context.$authContext
  event.context.params = {
    ...originalParams,
    extensionKey,
    route,
    ...handler.params
  }
  event.context.$authContext = authContext

  try {
    return await handler.handler(event)
  } catch (error: unknown) {
    return await handleExtensionDispatchError(event, error)
  } finally {
    event.context.params = originalParams
    event.context.$authContext = originalAuthContext
  }
}
