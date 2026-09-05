/* eslint-disable jsdoc/require-jsdoc */
import { z } from 'zod'
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { Scope } from '~~/shared/utils/scopes'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { badRequest } from '~~/server/utils/api-errors'
import { requireAuthContext } from '~~/server/utils/authorize'
import {
  canAccessAgreement,
  canAccessAgreementStream,
  resolveAgreementScopeContext,
  resolveAgreementStreamScopeContext
} from '~~/server/utils/agreement'
import type { AgreementScopeContext } from '~~/server/utils/agreement'
import { escapeLikePattern } from '~~/server/utils/sql-like'

export const AgreementStreamLookupQuerySchema = PaginationSchema.extend({
  agreement_id: z.preprocess(value => {
    if (typeof value !== 'string') {
      return value
    }

    const trimmedValue = value.trim()
    return trimmedValue.length > 0 ? trimmedValue : undefined
  }, PositivePostgresBigintIdSchema.optional()),
  stream_id: z.preprocess(value => {
    if (typeof value !== 'string') {
      return value
    }

    const trimmedValue = value.trim()
    return trimmedValue.length > 0 ? trimmedValue : undefined
  }, PositivePostgresBigintIdSchema.optional()),
  permission_action: z.enum(['create', 'update', 'read']).default('create')
})

const routeBadRequest = async (
  event: H3Event,
  code: string,
  key: string
) => {
  const badRequestHandler = (globalThis as { badRequest?: typeof badRequest }).badRequest ?? badRequest
  return await badRequestHandler(event, code, key)
}

export const prepareAgreementStreamLookupRoute = async (
  event: H3Event,
  db: Kysely<Database>
) => {
  await requireAuthContext(event)
  const query = await getValidatedQueryI18n(event, AgreementStreamLookupQuerySchema)
  const { page, limit, search, agreement_id, stream_id, permission_action } = query

  if (!stream_id) {
    return await routeBadRequest(event, 'INVALID_AGREEMENT_STREAM', 'apiErrors.agreement.invalid_stream')
  }

  const streamContext = await resolveAgreementStreamScopeContext(stream_id, db)
  if (!streamContext) {
    return await routeBadRequest(event, 'INVALID_AGREEMENT_STREAM', 'apiErrors.agreement.invalid_stream')
  }

  const agreementContext = permission_action !== 'create' && agreement_id
    ? await resolveAgreementScopeContext(agreement_id, db)
    : null
  if (permission_action !== 'create' && agreement_id && !agreementContext) {
    return await routeBadRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    escapedSearch: search ? escapeLikePattern(search) : '',
    streamId: stream_id,
    permissionAction: permission_action,
    streamScope: streamContext.scope,
    agreementContext
  }
}

export const authorizeAgreementStreamLookupRoute = async (
  db: Kysely<Database>,
  action: 'create' | 'update' | 'read',
  streamId: string,
  scope: Scope,
  agreementContext: AgreementScopeContext | null,
  context: Parameters<typeof canAccessAgreementStream>[0]
) => {
  if (
    action !== 'create'
    && agreementContext
    && agreementContext.streamId === streamId
    && await canAccessAgreement(context, action, agreementContext.scope, db)
  ) {
    return { bypass: true } as const
  }

  const canRead = await canAccessAgreementStream(context, action, scope, db)
  if (canRead) {
    return { bypass: true } as const
  }

  return { scope }
}
