import { z } from 'zod'
import type { ExtensionCreateActionsResponse } from '~~/shared/types/schemas/extensions'
import { parseI18n } from '~~/server/utils/api-validate'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { listExtensionCreateActionItems } from '~~/server/utils/extension-agreement-operation-routes'
import {
  canAccessExtensionEntity,
  resolveExtensionEntityContext
} from '~~/server/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const CreateActionsQuerySchema = z.object({
  operation: z.enum(['agreement.commitments.create', 'agreement.payments.create']),
  agreementId: z.string().optional()
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  // Establish the principal before query validation or existence-sensitive lookup.
  await requireAuthContext(event)
  const rawQuery = getQuery(event)
  if (rawQuery.agreementId !== undefined
    && (typeof rawQuery.agreementId !== 'string' || !isPositivePostgresBigintText(rawQuery.agreementId))) {
    return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  }
  const query = await parseI18n(event, CreateActionsQuerySchema, rawQuery)

  if (!query.agreementId) {
    const response: ExtensionCreateActionsResponse = {
      operation: query.operation,
      items: [],
      conflict: false
    }
    return response
  }

  const entityContext = await resolveExtensionEntityContext(db, 'agreement', query.agreementId)
  if (!entityContext?.agreementId || !entityContext.streamId) {
    const response: ExtensionCreateActionsResponse = {
      operation: query.operation,
      items: [],
      conflict: false
    }
    return response
  }

  const authResult = await authorize(event, 'agreement', 'read', async ({ context }) => {
    const canAccess = await canAccessExtensionEntity(
      context,
      { subject: 'agreement', action: 'read' },
      entityContext,
      db
    )
    if (canAccess) return { bypass: true }
    return { scope: entityContext.scope }
  })

  const items = await listExtensionCreateActionItems(db, authResult, query.operation, entityContext)

  const replaceActions = items.filter(item => item.mode === 'replace')
  const response: ExtensionCreateActionsResponse = {
    operation: query.operation,
    items,
    conflict: replaceActions.length > 1,
    ...(replaceActions.length > 1 ? { conflictCode: 'EXTENSION_CREATE_OPERATION_CONFLICT' } : {})
  }
  return response
})
