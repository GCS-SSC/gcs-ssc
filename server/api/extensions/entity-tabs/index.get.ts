import { z } from 'zod'
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import type { ExtensionEntityTabItem, ExtensionEntityTabsResponse } from '~~/shared/types/schemas/extensions'
import type { GcsExtensionJsonConfig } from '~~/shared/utils/extensions'
import type { Database } from '~~/shared/types/database'
import { parseI18n } from '~~/server/utils/api-validate'
import { authorize, type AuthContext } from '~~/server/utils/authorize'
import { listApplicantRecipientContributionAgencies, canAccessApplicantRecipient } from '~~/server/utils/applicant-recipient-auth'
import { badRequest } from '~~/server/utils/api-errors'
import {
  canAccessExtensionEntity,
  getExtensionConfigurationForEntity,
  getRegisteredExtensions,
  resolveExtensionEntityContext
} from '~~/server/utils/extensions'
import { getExtensionEntityAuthorizationSubject } from '~~/shared/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const EntityTabQuerySchema = z.object({
  target: z.enum(['agreement', 'proponent', 'claim', 'monitor', 'opportunity']),
  agreementId: z.string().optional(),
  applicantRecipientId: z.string().optional(),
  agencyId: z.string().optional(),
  claimId: z.string().optional(),
  monitorId: z.string().optional(),
  opportunityId: z.string().optional()
})

/**
 * Resolves the entity id query field for an extension tab target.
 *
 * @param query - Validated entity tab query.
 * @returns Matching entity id, or null when absent.
 */
const entityIdForQuery = (query: z.infer<typeof EntityTabQuerySchema>): string | null => {
  if (query.target === 'agreement') return query.agreementId ?? null
  if (query.target === 'proponent') return query.applicantRecipientId ?? null
  if (query.target === 'claim') return query.claimId ?? null
  if (query.target === 'opportunity') return query.opportunityId ?? null
  return query.monitorId ?? null
}

type EntityTabQuery = z.infer<typeof EntityTabQuerySchema>
type ExtensionEntityContext = NonNullable<Awaited<ReturnType<typeof resolveExtensionEntityContext>>>

const emptyEntityTabsResponse = (target: EntityTabQuery['target']): ExtensionEntityTabsResponse => ({
  target,
  items: []
})

/**
 * Resolves each Proponent tab once, with all eligible enabled agencies attached.
 * @param db - Database used to read agency enablement.
 * @param context - Authenticated actor and grants.
 * @param applicantRecipientId - App-wide Proponent identity.
 * @returns Visible tabs with their eligible agency contexts.
 */
const collectProponentTabs = async (
  db: Kysely<Database>,
  context: AuthContext,
  applicantRecipientId: string
): Promise<ExtensionEntityTabItem[]> => {
  const extensions = await getRegisteredExtensions()
  const items: ExtensionEntityTabItem[] = []
  for (const extension of extensions) {
    for (const tab of (extension.client.tabs ?? []).filter(item => item.target === 'proponent')) {
      if (!await canAccessApplicantRecipient(context, applicantRecipientId, tab.rbac.action, db)) continue
      const candidates = await listApplicantRecipientContributionAgencies(context, tab.rbac.action, db)
      const agencies = [] as NonNullable<Extract<ExtensionEntityTabItem['context'], { target: 'proponent' }>['agencies']>
      for (const agency of candidates) {
        if (tab.agencyReadRequired && !context.userAbilities.authorize('agency', 'read', {
          type: 'agency', agencyId: agency.id
        })) continue
        const row = await db.selectFrom('extensions.agency_enablement')
          .select('config')
          .where('extension_key', '=', extension.key)
          .where('agency_id', '=', agency.id)
          .where('enabled', '=', true)
          .where('_deleted', '=', false)
          .executeTakeFirst()
        if (!row) continue
        const config = row.config && typeof row.config === 'object' && !Array.isArray(row.config)
          ? row.config as GcsExtensionJsonConfig
          : {}
        if (tab.agencyConfigVisibility && !tab.agencyConfigVisibility.values.includes(
          String(config[tab.agencyConfigVisibility.key] ?? '')
        )) continue
        agencies.push({ agencyId: agency.id, nameEn: agency.nameEn, nameFr: agency.nameFr, config })
      }
      if (agencies.length === 0 || !('componentName' in tab) || !tab.componentName) continue
      items.push({
        extensionKey: extension.key,
        tabId: tab.id,
        value: tab.value ?? `extension:${extension.key}:proponent:${tab.id}`,
        label: tab.label,
        icon: tab.icon,
        componentName: String(tab.componentName),
        config: {},
        context: {
          target: 'proponent', applicantRecipientId, ownerType: 'applicantrecipient',
          ownerId: applicantRecipientId, agencies
        },
        rbac: tab.rbac
      })
    }
  }
  return items
}

/**
 * Authorizes access to the entity that owns extension tabs.
 *
 * @param event - Active request event.
 * @param db - Database connection.
 * @param entityContext - Resolved extension entity context.
 * @returns Authorization context for tab-level RBAC checks.
 */
const authorizeExtensionEntityTabs = async (
  event: H3Event,
  db: Kysely<Database>,
  entityContext: ExtensionEntityContext
) => {
  const subject = getExtensionEntityAuthorizationSubject(entityContext.target)
  return await authorize(event, subject, 'read', async ({ context }) => {
    const canAccess = await canAccessExtensionEntity(
      context,
      { subject, action: 'read' },
      entityContext,
      db
    )
    if (canAccess) return { bypass: true }

    return { scope: entityContext.scope }
  })
}

/**
 * Builds the extension tab items available for the entity and caller.
 *
 * @param db - Database connection.
 * @param authResult - Authorization context from the entity check.
 * @param target - Requested tab target.
 * @param entityContext - Resolved extension entity context.
 * @returns Extension tab items visible to the caller.
 */
const collectExtensionEntityTabItems = async (
  db: Kysely<Database>,
  authResult: Awaited<ReturnType<typeof authorize>>,
  target: EntityTabQuery['target'],
  entityContext: ExtensionEntityContext
): Promise<ExtensionEntityTabItem[]> => {
  const extensions = await getRegisteredExtensions()
  const items: ExtensionEntityTabItem[] = []

  for (const extension of extensions) {
    const config = await getExtensionConfigurationForEntity(db, extension.key, entityContext)
    if (!config) {
      continue
    }

    const tabs = extension.client.tabs.filter(tab => tab.target === target)
    for (const tab of tabs) {
      if (tab.agencyConfigVisibility) {
        const agencySetting = await db.selectFrom('extensions.agency_enablement')
          .select('config')
          .where('extension_key', '=', extension.key)
          .where('agency_id', '=', entityContext.agencyId)
          .where('enabled', '=', true)
          .where('_deleted', '=', false).executeTakeFirst()
        const agencyConfig = agencySetting?.config
        const value = agencyConfig && typeof agencyConfig === 'object' && !Array.isArray(agencyConfig)
          ? agencyConfig[tab.agencyConfigVisibility.key]
          : undefined
        if (typeof value !== 'string' || !tab.agencyConfigVisibility.values.includes(value)) continue
      }
      const componentName = 'componentName' in tab ? String(tab.componentName) : ''
      if (!componentName) {
        continue
      }

      const canAccessTab = await canAccessExtensionEntity(authResult, tab.rbac, entityContext, db)
      if (!canAccessTab) {
        continue
      }

      items.push({
        extensionKey: extension.key,
        tabId: tab.id,
        value: tab.value ?? `extension:${extension.key}:${tab.target}:${tab.id}`,
        label: tab.label,
        icon: tab.icon,
        componentName,
        config,
        context: { ...entityContext, target: entityContext.target as 'agreement' | 'claim' | 'monitor' | 'opportunity' },
        rbac: tab.rbac
      })
    }
  }

  return items
}

export default defineEventHandler(async event => {
  const db = event.context.$db
  const rawQuery = getQuery(event)
  const rawEntityIds = [
    rawQuery.agreementId,
    rawQuery.applicantRecipientId,
    rawQuery.agencyId,
    rawQuery.claimId,
    rawQuery.monitorId,
    rawQuery.opportunityId
  ]
  if (rawEntityIds.some(value => value !== undefined
    && (typeof value !== 'string' || !isPositivePostgresBigintText(value)))) {
    return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  }
  const query = await parseI18n(event, EntityTabQuerySchema, rawQuery)
  const entityId = entityIdForQuery(query)

  if (!entityId) {
    return emptyEntityTabsResponse(query.target)
  }

  if (query.target === 'proponent') {
    if (query.agencyId !== undefined) return await badRequest(event, 'INVALID_EXTENSION_CONTEXT', 'apiErrors.request.invalid_id')
    const access = await authorize(event, 'applicant_recipient', 'read', async ({ context }) =>
      await canAccessApplicantRecipient(context, entityId, 'read', db)
        ? { bypass: true }
        : { denied: true })
    return { target: 'proponent', items: await collectProponentTabs(db, access, entityId) }
  }

  const entityContext = await resolveExtensionEntityContext(db, query.target, entityId, query.agencyId)
  if (!entityContext) {
    return emptyEntityTabsResponse(query.target)
  }

  const authResult = await authorizeExtensionEntityTabs(event, db, entityContext)
  const items = await collectExtensionEntityTabItems(db, authResult, query.target, entityContext)

  const response: ExtensionEntityTabsResponse = {
    target: query.target,
    items
  }
  return response
})
