import { z } from 'zod'
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import type { ExtensionEntityTabItem, ExtensionEntityTabsResponse } from '~~/shared/types/schemas/extensions'
import type { Database } from '~~/shared/types/database'
import { parseI18n } from '~~/server/utils/api-validate'
import { authorize } from '~~/server/utils/authorize'
import {
  canAccessExtensionEntity,
  getExtensionConfigurationForEntity,
  getRegisteredExtensions,
  resolveExtensionEntityContext
} from '~~/server/utils/extensions'
import { getExtensionEntityAuthorizationSubject } from '~~/shared/utils/extensions'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const EntityTabQuerySchema = z.object({
  target: z.enum(['agreement', 'proponent', 'claim', 'monitor']),
  agreementId: z.string().optional(),
  applicantRecipientId: z.string().optional(),
  claimId: z.string().optional(),
  monitorId: z.string().optional()
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
  return query.monitorId ?? null
}

type EntityTabQuery = z.infer<typeof EntityTabQuerySchema>
type ExtensionEntityContext = NonNullable<Awaited<ReturnType<typeof resolveExtensionEntityContext>>>

const emptyEntityTabsResponse = (target: EntityTabQuery['target']): ExtensionEntityTabsResponse => ({
  target,
  items: []
})

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
        context: entityContext,
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
    rawQuery.claimId,
    rawQuery.monitorId
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

  const entityContext = await resolveExtensionEntityContext(db, query.target, entityId)
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
