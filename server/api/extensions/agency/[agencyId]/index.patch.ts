/* eslint-disable jsdoc/require-jsdoc -- Temporary coverage while this route receives complete API documentation. */
import type { Scope } from '~~/shared/utils/scopes'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { ExtensionToggleSchema } from '~~/shared/types/schemas/extensions'
import {
  authorize,
  authorizeWithFreshAuthContext,
  requireFreshAuthContext
} from '~~/server/utils/authorize'
import {
  getRegisteredExtensions,
  loadFileStorageProvider,
  lockExtensionLifecycleScope,
  runExtensionConfigurationGuards,
  runExtensionDisableGuards,
  runExtensionMigrations
} from '~~/server/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const scope: Scope = { type: 'agency', agencyId }
  await authorize(event, 'agency', 'update', scope)

  if (!agencyId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(agencyId)) {
    return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  }

  const agency = await db
    .selectFrom('Agency_Profile')
    .select('id')
    .where('id', '=', agencyId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!agency) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }

  const body = await readValidatedBodyI18n(event, ExtensionToggleSchema)
  const extensions = await getRegisteredExtensions()
  const extension = extensions.find(item => item.key === body.extensionKey)
  if (!extension) {
    return await notFound(event, 'EXTENSION_NOT_FOUND', 'apiErrors.extensions.not_found')
  }
  let normalizedConfig = body.config
  if (extension.fileStorageProvider && body.config !== undefined) {
    try {
      const provider = await loadFileStorageProvider(extension.key)
      normalizedConfig = await provider?.adapter.validateAgencyConfig?.(body.config) ?? body.config
    } catch {
      return await badRequest(event, 'EXTENSION_CONFIG_INVALID', 'apiErrors.request.invalid')
    }
  }

  const persistEnablement = async (
    writeDb: Kysely<Database> | Transaction<Database>
  ) => {
    const existing = await writeDb
      .selectFrom('extensions.agency_enablement')
      .select(['id', 'config'])
      .where('agency_id', '=', agencyId)
      .where('extension_key', '=', body.extensionKey)
      .where('_deleted', '=', false)
      .executeTakeFirst()

    const values = normalizedConfig === undefined
      ? { enabled: body.enabled }
      : { enabled: body.enabled, config: normalizedConfig }

    const row = existing
      ? await writeDb
          .updateTable('extensions.agency_enablement')
          .set(values)
          .where('id', '=', existing.id)
          .returningAll()
          .executeTakeFirst()
      : await writeDb
          .insertInto('extensions.agency_enablement')
          .values({
            agency_id: agencyId,
            extension_key: body.extensionKey,
            enabled: body.enabled,
            config: normalizedConfig ?? {}
          })
          .returningAll()
          .executeTakeFirst()

    if (body.enabled === false) {
      const streamIds = await writeDb
        .selectFrom('Transfer_Payment_Stream')
        .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
        .select('Transfer_Payment_Stream.id')
        .where('Transfer_Payment_Profile.egcs_tp_agency', '=', agencyId)
        .where('Transfer_Payment_Stream._deleted', '=', false)
        .where('Transfer_Payment_Profile._deleted', '=', false)
        .execute()

      if (streamIds.length > 0) {
        await writeDb
          .updateTable('extensions.stream_configuration')
          .set({ enabled: false })
          .where('extension_key', '=', body.extensionKey)
          .where('stream_id', 'in', streamIds.map(item => String(item.id)))
          .where('_deleted', '=', false)
          .execute()
      }
    }

    return row
  }

  return await db.transaction().execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    await lockExtensionLifecycleScope(trx, body.extensionKey, agencyId)
    const currentAgency = await trx
      .selectFrom('Agency_Profile')
      .select('id')
      .where('id', '=', agencyId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
    if (!currentAgency) {
      return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
    }
    await authorizeWithFreshAuthContext(event, authContext, 'agency', 'update', scope)

    if (body.enabled) {
      try {
        await runExtensionMigrations(trx, extension)
      } catch {
        return await badRequest(event, 'EXTENSION_MIGRATION_FAILED', 'apiErrors.extensions.migration_failed')
      }
    }

    if (body.enabled === false) {
      if (extension.fileStorageProvider) {
        const [selection, attachment] = await Promise.all([
          trx.selectFrom('extensions.agency_storage_selection').select('id')
            .where('agency_id', '=', agencyId).where('provider_key', '=', body.extensionKey)
            .where('_deleted', '=', false).executeTakeFirst(),
          trx.selectFrom('Common_Attachment')
            .innerJoin('Common_Attachment_Types', 'Common_Attachment_Types.id', 'Common_Attachment.egcs_cn_attachmenttype')
            .select('Common_Attachment.id')
            .where('Common_Attachment.egcs_cn_provider', '=', body.extensionKey)
            .where('Common_Attachment._deleted', '=', false)
            .where('Common_Attachment_Types.egcs_cn_agency', '=', agencyId)
            .executeTakeFirst()
        ])
        if (selection || attachment) {
          return await throwApiError(event, {
            statusCode: 409,
            code: 'STORAGE_PROVIDER_IN_USE',
            key: 'apiErrors.attachments.provider_in_use'
          })
        }
      }
      await runExtensionDisableGuards(event, trx, {
        extensionKey: body.extensionKey,
        scope: 'agency',
        agencyId
      })
    }

    await runExtensionConfigurationGuards(event, trx, {
      targetExtensionKey: body.extensionKey,
      scope: 'agency',
      agencyId,
      enabled: body.enabled,
      config: normalizedConfig
    })

    return await persistEnablement(trx)
  })
})
