import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import { authorizeWithFreshAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import type { Database } from '~~/shared/types/database'
import type { AbilityAction } from '~~/shared/utils/abilities'

/**
 * Runs a GWCOA mutation with freshly rebuilt global authorization.
 *
 * @param event - Current request event.
 * @param action - GWCOA mutation being authorized.
 * @param callback - Mutation executed inside the authorized transaction.
 * @returns The mutation result.
 */
export const executeFreshAuthorizedGwcoaWrite = async <T>(
  event: H3Event,
  action: Extract<AbilityAction, 'create' | 'update'>,
  callback: (trx: Transaction<Database>) => Promise<T>
): Promise<T> => await event.context.$db.transaction().execute(async trx => {
  const authContext = await requireFreshAuthContext(event, trx)
  await authorizeWithFreshAuthContext(event, authContext, 'system', action, { type: 'global' })
  return await callback(trx)
})
