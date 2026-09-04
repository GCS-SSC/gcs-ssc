import { z } from 'zod'
import type { ExtensionPaymentAmountCalculatorsResponse } from '~~/shared/types/schemas/extensions'
import { parseI18n } from '~~/server/utils/api-validate'
import { authorizeWithFreshAuthContext, requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { listExtensionPaymentAmountCalculatorItems } from '~~/server/utils/extension-agreement-operation-routes'
import {
  canAccessExtensionEntity,
  resolveExtensionEntityContext
} from '~~/server/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const PaymentAmountCalculatorsQuerySchema = z.object({
  operation: z.literal('agreement.payments.create'),
  agreementId: z.string().optional()
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const rawQuery = getQuery(event)
  if (rawQuery.agreementId !== undefined
    && (typeof rawQuery.agreementId !== 'string' || !isPositivePostgresBigintText(rawQuery.agreementId))) {
    return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  }
  const query = await parseI18n(event, PaymentAmountCalculatorsQuerySchema, rawQuery)

  if (!query.agreementId) {
    const response: ExtensionPaymentAmountCalculatorsResponse = {
      operation: query.operation,
      items: [],
      conflict: false
    }
    return response
  }

  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    const entityContext = await resolveExtensionEntityContext(trx, 'agreement', query.agreementId!)
    if (!entityContext?.agreementId || !entityContext.streamId) {
      return { operation: query.operation, items: [], conflict: false }
    }

    const authResult = await authorizeWithFreshAuthContext(event, authContext, 'agreement', 'read', async ({ context }) => {
      const canAccess = await canAccessExtensionEntity(
        context, { subject: 'agreement', action: 'read' }, entityContext, trx
      )
      if (canAccess) return { bypass: true }
      return { scope: entityContext.scope }
    })
    const items = await listExtensionPaymentAmountCalculatorItems(trx, authResult, query.operation, entityContext)
    return {
      operation: query.operation,
      items,
      conflict: items.length > 1,
      ...(items.length > 1 ? { conflictCode: 'EXTENSION_PAYMENT_AMOUNT_CALCULATOR_CONFLICT' } : {})
    }
  })
})
