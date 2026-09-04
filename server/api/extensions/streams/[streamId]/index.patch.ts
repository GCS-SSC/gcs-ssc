/* eslint-disable jsdoc/require-jsdoc -- Temporary coverage while this route receives complete API documentation. */
import { ExtensionStreamConfigurationSchema } from '~~/shared/types/schemas/extensions'
import type { Kysely, Transaction } from 'kysely'
import {
  authorize,
  authorizeWithFreshAuthContext,
  requireFreshAuthContext
} from '~~/server/utils/authorize'
import {
  getRegisteredExtensions,
  lockExtensionLifecycleScope,
  resolveExtensionStreamContext,
  runExtensionConfigurationGuards,
  runExtensionDisableGuards,
  runExtensionEnableGuards
} from '~~/server/utils/extensions'
import type { Database } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await authorize(event, 'transfer_payment', 'update', async () => ({ bypass: true }))
  const streamId = getRouterParam(event, 'streamId')
  if (!streamId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(streamId)) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  const streamContext = await resolveExtensionStreamContext(db, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'update', async ({ context }) => {
    const canAccess = context.userAbilities.authorize(
      'transfer_payment',
      'update',
      streamContext.scope
    )
    if (canAccess) return { bypass: true }
    return { scope: streamContext.scope }
  })

  const body = await readValidatedBodyI18n(event, ExtensionStreamConfigurationSchema)
  const extensions = await getRegisteredExtensions()
  if (!extensions.some(extension => extension.key === body.extensionKey)) {
    return await notFound(event, 'EXTENSION_NOT_FOUND', 'apiErrors.extensions.not_found')
  }

  const persistConfiguration = async (
    writeDb: Kysely<Database> | Transaction<Database>
  ) => {
    const existing = await writeDb
      .selectFrom('extensions.stream_configuration')
      .select('id')
      .where('stream_id', '=', streamId)
      .where('extension_key', '=', body.extensionKey)
      .where('_deleted', '=', false)
      .executeTakeFirst()

    const row = existing
      ? await writeDb
          .updateTable('extensions.stream_configuration')
          .set({
            enabled: body.enabled,
            config: body.config
          })
          .where('id', '=', existing.id)
          .returningAll()
          .executeTakeFirst()
      : await writeDb
          .insertInto('extensions.stream_configuration')
          .values({
            stream_id: streamId,
            extension_key: body.extensionKey,
            enabled: body.enabled,
            config: body.config
          })
          .returningAll()
          .executeTakeFirst()

    return row
  }

  return await db.transaction().execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    await lockExtensionLifecycleScope(
      trx,
      body.extensionKey,
      streamContext.agencyId,
      streamId
    )

    const currentStreamContext = await resolveExtensionStreamContext(trx, streamId)
    if (!currentStreamContext) {
      return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
    }
    await authorizeWithFreshAuthContext(event, authContext, 'transfer_payment', 'update', async ({ context }) => {
      const canAccess = context.userAbilities.authorize(
        'transfer_payment',
        'update',
        currentStreamContext.scope
      )
      if (canAccess) return { bypass: true }
      return { scope: currentStreamContext.scope }
    })

    const agencyEnabled = await trx
      .selectFrom('extensions.agency_enablement')
      .select('id')
      .where('agency_id', '=', currentStreamContext.agencyId)
      .where('extension_key', '=', body.extensionKey)
      .where('enabled', '=', true)
      .where('_deleted', '=', false)
      .executeTakeFirst()

    if (!agencyEnabled) {
      return await badRequest(event, 'EXTENSION_AGENCY_DISABLED', 'apiErrors.extensions.agency_disabled')
    }

    if (body.enabled === false) {
      await runExtensionDisableGuards(event, trx, {
        extensionKey: body.extensionKey,
        scope: 'stream',
        agencyId: currentStreamContext.agencyId,
        streamId
      })
    } else {
      await runExtensionEnableGuards(event, trx, {
        extensionKey: body.extensionKey,
        scope: 'stream',
        agencyId: currentStreamContext.agencyId,
        streamId
      })
    }

    await runExtensionConfigurationGuards(event, trx, {
      targetExtensionKey: body.extensionKey,
      scope: 'stream',
      agencyId: currentStreamContext.agencyId,
      streamId,
      enabled: body.enabled,
      config: body.config
    })

    return await persistConfiguration(trx)
  })
})
