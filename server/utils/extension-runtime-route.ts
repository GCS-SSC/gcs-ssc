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
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { canAccessApplicantRecipient, listApplicantRecipientContributionAgencies } from '~~/server/utils/applicant-recipient-auth'
import {
  getRegisteredExtensions,
  resolveExtensionRuntimeSlot,
  resolveExtensionStreamContext
} from '~~/server/utils/extensions'

export interface ExtensionRuntimeSlotQuery {
  slot: GcsExtensionSlot
  subject?: 'agency' | 'transfer_payment' | 'agreement' | 'applicant_recipient'
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

const listAgencyEnabledExtensionConfigurations = async (
  db: Kysely<Database>,
  agencyId: string
) => {
  const rows = await db
    .selectFrom('extensions.agency_enablement')
    .select(['extension_key', 'config'])
    .where('agency_id', '=', agencyId)
    .where('enabled', '=', true)
    .where('_deleted', '=', false)
    .execute()

  return new Map(rows.map(row => [row.extension_key, (row.config ?? {}) as GcsExtensionJsonConfig]))
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
  const enabledConfigs = await listAgencyEnabledExtensionConfigurations(db, agencyId)
  const extensions = await getRegisteredExtensions()
  const items: ExtensionRuntimeSlotItem[] = []

  for (const extension of extensions) {
    if (!enabledConfigs.has(extension.key)) {
      continue
    }

    const runtimeResolution = await resolveExtensionRuntimeSlot(event, extension, query)
    if (extension.runtime && runtimeResolution?.enabled !== true) {
      continue
    }

    let config = runtimeResolution?.config ?? {}
    if (query.slot === 'bilingual-field.after') {
      config = { agency: enabledConfigs.get(extension.key) ?? {} }
    }
    items.push(...buildExtensionRuntimeSlotItems(extension, query, config))
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
  if (query.agencyId !== undefined) return await forbidden(event)
  if (!query.applicantRecipientId) {
    if (query.permissionAction !== 'create') return await forbidden(event)
    await authorize(event, 'applicant_recipient', 'create', async ({ context }) => {
      const agencies = await listApplicantRecipientContributionAgencies(context, 'create', db)
      return agencies.length ? { bypass: true } : { denied: true }
    })
  } else {
    const profile = await db.selectFrom('Applicant_Recipient_Profile').select('id')
      .where('id', '=', query.applicantRecipientId).where('_deleted', '=', false).executeTakeFirst()
    if (!profile) return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
    await authorize(event, 'applicant_recipient', query.permissionAction, async ({ context }) =>
      await canAccessApplicantRecipient(context, String(profile.id), query.permissionAction, db)
        ? { bypass: true }
        : { denied: true })
  }
  const context = await requireAuthContext(event)
  const candidates = await listApplicantRecipientContributionAgencies(context, query.permissionAction, db)
  const grouped = new Map<string, ExtensionRuntimeSlotItem>()
  for (const agency of candidates) {
    const response = await resolveAgencyRuntimeResponse(event, db, { ...query, agencyId: agency.id })
    for (const item of response.items) {
      const existing = grouped.get(item.extensionKey)
      if (existing) existing.agencies?.push({
        agencyId: agency.id, nameEn: agency.nameEn, nameFr: agency.nameFr, config: item.config
      })
      else grouped.set(item.extensionKey, {
        ...item,
        config: {},
        agencies: [{ agencyId: agency.id, nameEn: agency.nameEn, nameFr: agency.nameFr, config: item.config }]
      })
    }
  }
  return { slot: query.slot, items: [...grouped.values()] }
}

/** Authorizes explicitly scoped bilingual controls without borrowing Agreement authority. */
const resolveBilingualFieldRuntimeResponse = async (
  event: H3Event,
  db: Kysely<Database>,
  query: ExtensionRuntimeSlotQuery
): Promise<ExtensionRuntimeResponse> => {
  if (query.subject === 'applicant_recipient') {
    if (query.streamId || query.agreementId) return await forbidden(event)
    return await resolveProponentRuntimeResponse(event, db, query)
  }
  if (query.applicantRecipientId || !query.subject) return await forbidden(event)
  if (query.subject === 'agreement' && (!query.streamId || query.agencyId)) return await forbidden(event)
  if (query.subject !== 'agreement' && query.agreementId) return await forbidden(event)
  if (query.streamId) {
    if (!['agreement', 'transfer_payment'].includes(query.subject) || query.agencyId) return await forbidden(event)
    const owner = await resolveExtensionStreamContext(db, query.streamId)
    if (!owner) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
    if (query.subject === 'agreement') await authorizeExtensionAgreementRuntime(event, db, query, owner)
    else await authorize(event, 'transfer_payment', query.permissionAction, owner.scope)
    const rows = await listStreamRuntimeConfigurationRows(db, query.streamId, owner.agencyId)
    const rowByKey = new Map(rows.map(row => [row.extension_key, row]))
    const extensions = await getRegisteredExtensions()
    const items = extensions.flatMap(extension => {
      const row = rowByKey.get(extension.key)
      return row ? buildExtensionRuntimeSlotItems(extension, query, (row.config ?? {}) as GcsExtensionJsonConfig) : []
    })
    return await withBilingualAgencyConfiguration(db, { slot: query.slot, streamId: query.streamId, items }, owner.agencyId)
  }
  if (!query.agencyId) return emptyRuntimeResponse(query)
  await authorize(event, query.subject, query.permissionAction, { type: 'agency', agencyId: query.agencyId })
  return await resolveAgencyRuntimeResponse(event, db, query)
}

/** Delivers both configuration layers; the extension owns glossary composition. */
const withBilingualAgencyConfiguration = async (
  db: Kysely<Database>,
  response: ExtensionRuntimeResponse,
  agencyId: string
): Promise<ExtensionRuntimeResponse> => {
  const rows = await db.selectFrom('extensions.agency_enablement').select(['extension_key', 'config'])
    .where('agency_id', '=', agencyId).where('enabled', '=', true).where('_deleted', '=', false).execute()
  const configs = new Map(rows.map(row => [row.extension_key, row.config]))
  return {
    ...response,
    items: response.items.filter(item => configs.has(item.extensionKey)).map(item => ({
      ...item,
      config: { agency: (configs.get(item.extensionKey) ?? {}) as GcsExtensionJsonConfig, stream: item.config }
    }))
  }
}

/** Dispatches runtime configuration loading for agency or stream routes. */
export const resolveExtensionRuntimeResponse = async (
  event: H3Event,
  query: ExtensionRuntimeSlotQuery
): Promise<ExtensionRuntimeResponse> => {
  const db = event.context.$db

  if (query.slot === 'bilingual-field.after') return await resolveBilingualFieldRuntimeResponse(event, db, query)

  if (!query.streamId && !query.agencyId && !query.applicantRecipientId
    && query.slot !== 'proponent.descriptions.after') {
    return emptyRuntimeResponse(query)
  }

  if (query.applicantRecipientId || query.slot === 'proponent.descriptions.after') {
    return await resolveProponentRuntimeResponse(event, db, query)
  }

  if (!query.streamId) return emptyRuntimeResponse(query)
  return await resolveStreamRuntimeResponse(event, db, query)
}
