/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Temporary coverage while extension runtime helpers receive complete documentation. */
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AbilityAction } from '~~/shared/utils/abilities'
import type { ExtensionRuntimeResponse, ExtensionRuntimeSlotItem } from '~~/shared/types/schemas/extensions'
import type {
  GcsExtensionJsonConfig,
  GcsExtensionSlot,
  GcsRegisteredExtension
} from '~~/shared/utils/extensions'
import { forbidden, notFound } from '~~/server/utils/api-errors'
import { authorize } from '~~/server/utils/authorize'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { canAccessApplicantRecipient } from '~~/server/utils/applicant-recipient-auth'
import {
  getRegisteredExtensions,
  resolveExtensionRuntimeSlot,
  resolveExtensionStreamContext
} from '~~/server/utils/extensions'

export interface ExtensionRuntimeSlotQuery {
  slot: GcsExtensionSlot
  streamId?: string
  agencyId?: string
  applicantRecipientId?: string
  agreementId?: string
  permissionAction: Extract<AbilityAction, 'create' | 'read' | 'update'>
}

type StreamConfigurationRow = {
  extension_key: string
  config: unknown
}

const emptyRuntimeResponse = (query: ExtensionRuntimeSlotQuery): ExtensionRuntimeResponse => ({
  slot: query.slot,
  items: []
})

const resolveSlotComponentName = (slot: GcsRegisteredExtension['client']['slots'][number]) => {
  if (!('componentName' in slot)) {
    return ''
  }

  return String(slot.componentName)
}

const buildExtensionRuntimeSlotItems = (
  extension: GcsRegisteredExtension,
  query: ExtensionRuntimeSlotQuery,
  config: GcsExtensionJsonConfig
): ExtensionRuntimeSlotItem[] => extension.client.slots
  .filter(slot => slot.slot === query.slot)
  .map(slot => ({
    extensionKey: extension.key,
    componentName: resolveSlotComponentName(slot),
    config
  }))
  .filter(item => item.componentName.length > 0)

const listAgencyEnabledExtensionKeys = async (
  db: Kysely<Database>,
  agencyId: string
) => {
  const rows = await db
    .selectFrom('extensions.agency_enablement')
    .select('extension_key')
    .where('agency_id', '=', agencyId)
    .where('enabled', '=', true)
    .where('_deleted', '=', false)
    .execute()

  return new Set(rows.map(row => row.extension_key))
}

/** Lists extension runtime configuration enabled for both the agency and stream. */
const listStreamRuntimeConfigurationRows = async (
  db: Kysely<Database>,
  streamId: string,
  agencyId: string
) => {
  const rows = await db
    .selectFrom('extensions.stream_configuration')
    .innerJoin('extensions.agency_enablement', join =>
      join
        .onRef('extensions.agency_enablement.extension_key', '=', 'extensions.stream_configuration.extension_key')
        .on('extensions.agency_enablement.agency_id', '=', agencyId)
        .on('extensions.agency_enablement.enabled', '=', true)
        .on('extensions.agency_enablement._deleted', '=', false)
    )
    .select([
      'extensions.stream_configuration.extension_key as extension_key',
      'extensions.stream_configuration.config as config'
    ])
    .where('extensions.stream_configuration.stream_id', '=', streamId)
    .where('extensions.stream_configuration.enabled', '=', true)
    .where('extensions.stream_configuration._deleted', '=', false)
    .execute()

  return rows as StreamConfigurationRow[]
}

/** Builds extension configuration enabled for an already-authorized agency context. */
const resolveAgencyRuntimeResponse = async (
  event: H3Event,
  db: Kysely<Database>,
  query: ExtensionRuntimeSlotQuery
): Promise<ExtensionRuntimeResponse> => {
  const agencyId = query.agencyId ?? ''
  const enabledKeys = await listAgencyEnabledExtensionKeys(db, agencyId)
  const extensions = await getRegisteredExtensions()
  const items: ExtensionRuntimeSlotItem[] = []

  for (const extension of extensions) {
    if (!enabledKeys.has(extension.key)) {
      continue
    }

    const runtimeResolution = await resolveExtensionRuntimeSlot(event, extension, query)
    if (extension.runtime && runtimeResolution?.enabled !== true) {
      continue
    }

    items.push(...buildExtensionRuntimeSlotItems(extension, query, runtimeResolution?.config ?? {}))
  }

  return {
    slot: query.slot,
    items
  }
}

const authorizeExtensionAgreementRuntime = async (
  event: H3Event,
  db: Kysely<Database>,
  query: ExtensionRuntimeSlotQuery,
  streamContext: NonNullable<Awaited<ReturnType<typeof resolveExtensionStreamContext>>>
) => {
  if (!query.agreementId) {
    if (query.permissionAction !== 'create') return await forbidden(event)
    return await authorize(event, 'agreement', 'create', streamContext.scope)
  }

  const agreementContext = await resolveAgreementScopeContext(query.agreementId, db)
  if (!agreementContext || agreementContext.streamId !== streamContext.streamId) {
    return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  return await authorize(event, 'agreement', query.permissionAction, async ({ context }) => {
    const canAccess = await canAccessAgreement(
      context,
      query.permissionAction,
      agreementContext.scope,
      db
    )
    return canAccess ? { bypass: true } : { scope: agreementContext.scope }
  })
}

/** Builds stream extension configuration after enforcing transfer payment access. */
const resolveStreamRuntimeResponse = async (
  event: H3Event,
  db: Kysely<Database>,
  query: ExtensionRuntimeSlotQuery
): Promise<ExtensionRuntimeResponse> => {
  const streamId = query.streamId ?? ''
  const streamContext = await resolveExtensionStreamContext(db, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorizeExtensionAgreementRuntime(event, db, query, streamContext)

  const rows = await listStreamRuntimeConfigurationRows(db, streamId, streamContext.agencyId)
  const rowByKey = new Map(rows.map(row => [row.extension_key, row]))
  const extensions = await getRegisteredExtensions()
  const items = extensions.flatMap(extension => {
    const row = rowByKey.get(extension.key)
    if (!row) return []
    return buildExtensionRuntimeSlotItems(extension, query, (row.config ?? {}) as GcsExtensionJsonConfig)
  })

  return {
    slot: query.slot,
    streamId,
    items
  }
}

/** Resolves and authorizes exact Proponent runtime configuration. */
const resolveProponentRuntimeResponse = async (
  event: H3Event,
  db: Kysely<Database>,
  query: ExtensionRuntimeSlotQuery
): Promise<ExtensionRuntimeResponse> => {
  if (!query.applicantRecipientId) {
    if (query.permissionAction !== 'create' || !query.agencyId) return await forbidden(event)
    const agency = await db
      .selectFrom('Agency_Profile')
      .select('id')
      .where('id', '=', query.agencyId)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    if (!agency) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
    await authorize(event, 'applicant_recipient', 'create', { type: 'agency', agencyId: query.agencyId })
    return await resolveAgencyRuntimeResponse(event, db, query)
  }

  const profile = await db
    .selectFrom('Applicant_Recipient_Profile')
    .select(['id', 'egcs_ar_leadagency'])
    .where('id', '=', query.applicantRecipientId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!profile) {
    return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
  }

  const agencyId = profile.egcs_ar_leadagency ? String(profile.egcs_ar_leadagency) : ''
  if (!agencyId || (query.agencyId && query.agencyId !== agencyId)) {
    return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
  }

  await authorize(event, 'applicant_recipient', query.permissionAction, async ({ context }) => {
    const canAccess = await canAccessApplicantRecipient(
      context,
      String(profile.id),
      query.permissionAction,
      db
    )
    return canAccess ? { bypass: true } : { denied: true }
  })

  return await resolveAgencyRuntimeResponse(event, db, { ...query, agencyId })
}

/** Dispatches runtime configuration loading for agency or stream routes. */
export const resolveExtensionRuntimeResponse = async (
  event: H3Event,
  query: ExtensionRuntimeSlotQuery
): Promise<ExtensionRuntimeResponse> => {
  const db = event.context.$db

  if (!query.streamId && !query.agencyId && !query.applicantRecipientId) {
    return emptyRuntimeResponse(query)
  }

  if (query.applicantRecipientId || query.slot === 'proponent.descriptions.after') {
    return await resolveProponentRuntimeResponse(event, db, query)
  }

  if (!query.streamId) return emptyRuntimeResponse(query)
  return await resolveStreamRuntimeResponse(event, db, query)
}
