/* eslint-disable jsdoc/require-jsdoc -- typed public operations describe the guided help boundary */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import { GuideDocumentSchema } from '@gcs-ssc/guided-help/contracts'
import type { GuideDraft } from '@gcs-ssc/guided-help/contracts'
import type { Database, JsonValue } from '~~/shared/types/database'
import type { Scope } from '~~/shared/utils/scopes'
import { authorize, authorizeWithFreshAuthContext, requireAuthContext, requireFreshAuthContext } from './authorize'
import { getActiveStructuralRoleAssignments, getActiveStructuralRoles } from './active-user-scopes'
import { createPublication, publishDefinition, readPublicationMetadata, retirePublication, PublicationLifecycleConflictError } from './system-publication'
import { throwApiError } from './api-errors'
import { getDatabaseConstraintName } from './database-constraint-errors'
import { withAuditExecution } from './audit-context'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { authorizeReviewRuntimeAction, getReviewRuntimeOwnerAgencyId, resolveReviewRuntimeEntityFromReview } from './review-runtime-access'
import { authorizeAgreementResource, resolveAgreementVisibility } from './agreement'
import { guidedHelpLedger } from '~~/shared/guided-help/catalog'
import { checkHostGuideCompatibility } from '~~/shared/guided-help/journeys'

type Db = Kysely<Database> | Transaction<Database>
type Action = 'read' | 'create' | 'update' | 'delete'
type Owner = { agencyId: string | null }
type Settings = { formatVersion: 1; sourceVersionId: string; discoveryScreens: string[]; roles: string[]; enabled: boolean }
const fail = (event: H3Event, code: string, statusCode = 404): Promise<never> => throwApiError(event, { statusCode, code: `GUIDED_HELP_${code.toUpperCase()}`, key: `guided_help.api.${code}` })
const scope = (owner: Owner): Scope => owner.agencyId === null ? { type: 'global' } : { type: 'agency', agencyId: owner.agencyId }
const json = (value: unknown) => value as JsonValue
const settings = (row: Pick<Database['Agency_Guided_Help'], 'egcs_ay_sourceversion' | 'egcs_ay_discoveryscreens' | 'egcs_ay_roles'>): Settings => ({ formatVersion: 1, sourceVersionId: String(row.egcs_ay_sourceversion), discoveryScreens: row.egcs_ay_discoveryscreens as string[], roles: row.egcs_ay_roles as string[], enabled: true })

const ensureAgency = async (event: H3Event, db: Db, agencyId: string, lock = false) => {
  if (!isPositivePostgresBigintText(agencyId)) return fail(event, 'not_found')
  let query = db.selectFrom('Agency_Profile').select('id').where('id', '=', agencyId).where('_deleted', '=', false)
  if (lock) query = query.forUpdate()
  if (!await query.executeTakeFirst()) return fail(event, 'not_found')
}
const transaction = async <T>(event: H3Event, owner: Owner, action: Action, work: (db: Transaction<Database>, actorId: string) => Promise<T>, lockRoleIds: string[] = []) => {
  await authorize(event, 'guided_help', action, scope(owner))
  return event.context.$db.transaction().execute(async db => {
    const auth = await requireFreshAuthContext(event, db, { lockRoleIds })
    if (owner.agencyId !== null) await ensureAgency(event, db, owner.agencyId, true)
    await authorizeWithFreshAuthContext(event, auth, 'guided_help', action, scope(owner))
    const actor = await db.selectFrom('Common_User').select('id').where('egcs_cn_auth_user_id', '=', auth.userId).where('_deleted', '=', false).executeTakeFirst()
    if (!actor) return fail(event, 'forbidden', 403)
    return withAuditExecution(owner.agencyId === null ? { type: 'global' } : { type: 'agency', agencyId: owner.agencyId }, () => work(db, String(actor.id)))
  }).catch((error: unknown) => {
    if (error instanceof PublicationLifecycleConflictError || getDatabaseConstraintName(error) === 'ay_uq_guidedhelpactive') return fail(event, 'conflict', 409)
    throw error
  })
}
const guide = async (event: H3Event, db: Db, id: string, lock = false) => {
  if (!isPositivePostgresBigintText(id)) return fail(event, 'not_found')
  let query = db.selectFrom('Common_Guided_Help').selectAll().where('id', '=', id).where('_deleted', '=', false)
  if (lock) query = query.forUpdate()
  const row = await query.executeTakeFirst()
  if (!row) return fail(event, 'not_found')
  return row
}
const guideOwner = (row: { egcs_cn_agency: string | null }): Owner => ({ agencyId: row.egcs_cn_agency === null ? null : String(row.egcs_cn_agency) })
const version = async (event: H3Event, db: Db, id: string, guideId?: string) => {
  let query = db.selectFrom('Common_Publication_Version').selectAll().where('id', '=', id).where('egcs_cn_kind', '=', 'guided_help')
  if (guideId) query = query.where('egcs_cn_publication', '=', guideId)
  const row = await query.executeTakeFirst()
  if (!row) return fail(event, 'not_found')
  return row
}
const compatibility = (document: unknown) => {
  const parsed = GuideDocumentSchema.safeParse(document)
  return parsed.success ? checkHostGuideCompatibility(parsed.data, guidedHelpLedger) : [{ code: 'invalid-document', message: 'Invalid published guide' }]
}
const validateDocument = async (event: H3Event, document: unknown) => {
  const parsed = GuideDocumentSchema.safeParse(document)
  if (!parsed.success) return fail(event, 'invalid', 400)
  if (compatibility(parsed.data).length) return fail(event, 'incompatible', 409)
  return parsed.data
}
const offered = async (event: H3Event, db: Db, sourceId: string, versionId: string, owner: Owner, existing = false) => {
  const source = await guide(event, db, sourceId, true)
  const metadata = await readPublicationMetadata(db, sourceId)
  const owned = source.egcs_cn_agency !== null && String(source.egcs_cn_agency) === owner.agencyId
  if (!existing && (metadata.publicationState !== 'published' || (!owned && !source.egcs_cn_shared))) return fail(event, 'unavailable', 409)
  return version(event, db, versionId, sourceId)
}
const validateSettings = async (event: H3Event, db: Db, agencyId: string, input: { egcs_ay_discoveryscreens: string[]; egcs_ay_roles: string[] }) => {
  if (input.egcs_ay_discoveryscreens.some(key => !guidedHelpLedger.views.some(view => view.key === key && view.discoverable !== false))) return fail(event, 'invalid', 400)
  const roles = await getActiveStructuralRoles(db, input.egcs_ay_roles)
  if (roles.length !== input.egcs_ay_roles.length || roles.some(role => role.agencyId !== null && role.agencyId !== agencyId)) return fail(event, 'invalid', 400)
}

export const listGuidedHelpContexts = async (event: H3Event) => {
  const auth = await requireAuthContext(event)
  // Explicitly authorize through the subject; individual eligible agency scopes are filtered below.
  const agencies = await event.context.$db.selectFrom('Agency_Profile').select(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr']).where('_deleted', '=', false).execute()
  const canSystem = auth.userAbilities.authorize('guided_help', 'read', { type: 'global' })
  return { canSystem, items: agencies.filter(row => auth.userAbilities.authorize('guided_help', 'read', { type: 'agency', agencyId: String(row.id) })).map(row => ({ id: String(row.id), name: { en: row.egcs_ay_name_en, fr: row.egcs_ay_name_fr } })) }
}
export const listGuidedHelpRoles = async (event: H3Event, agencyId: string) => {
  await authorize(event, 'guided_help', 'read', scope({ agencyId }))
  await ensureAgency(event, event.context.$db, agencyId)
  const roles = await getActiveStructuralRoles(event.context.$db)
  const ids = roles.filter(role => role.agencyId === null || role.agencyId === agencyId).map(role => role.roleId)
  if (!ids.length) return { items: [] }
  const rows = await event.context.$db.selectFrom('role').select(['id', 'name_en', 'name_fr']).where('id', 'in', ids).execute()
  return { items: rows.map(row => ({ id: String(row.id), name: { en: row.name_en, fr: row.name_fr } })) }
}
/**
 * Read attribution only, including historical sources; never load another owner's draft.
 * @returns Public owner identity without draft content.
 * @param db Authorized database connection.
 * @param guideId Published source identity.
 */
const sourceAttribution = async (db: Db, guideId: string) => {
  const row = await db.selectFrom('Common_Guided_Help as Source').leftJoin('Agency_Profile as Agency', 'Agency.id', 'Source.egcs_cn_agency').select(['Source.id', 'Source.egcs_cn_ownertype', 'Source.egcs_cn_agency', 'Agency.egcs_ay_name_en', 'Agency.egcs_ay_name_fr']).where('Source.id', '=', guideId).executeTakeFirst()
  return row ? { guideId: String(row.id), ownerType: row.egcs_cn_ownertype, agencyId: row.egcs_cn_agency === null ? null : String(row.egcs_cn_agency), agencyName: { en: row.egcs_ay_name_en ?? '', fr: row.egcs_ay_name_fr ?? '' } } : null
}
const versionEvidence = (item: { id: string; egcs_cn_version: number; egcs_cn_definition: unknown; egcs_cn_actor: string; egcs_cn_createdat: Date }) => ({ id: String(item.id), version: item.egcs_cn_version, document: item.egcs_cn_definition, actorId: String(item.egcs_cn_actor), publishedAt: item.egcs_cn_createdat })
export const readGuidedHelp = async (event: H3Event, id: string) => {
  await requireAuthContext(event)
  const row = await guide(event, event.context.$db, id)
  const auth = await authorize(event, 'guided_help', 'read', scope(guideOwner(row)))
  const metadata = await readPublicationMetadata(event.context.$db, id, row.egcs_cn_document)
  const versions = await event.context.$db.selectFrom('Common_Publication_Version').selectAll().where('egcs_cn_publication', '=', id).orderBy('egcs_cn_version', 'desc').execute()
  const clonedVersion = row.egcs_cn_clonedfromversion ? await version(event, event.context.$db, String(row.egcs_cn_clonedfromversion)) : null
  return { ...row, ...metadata, sourceAttribution: await sourceAttribution(event.context.$db, id), clonedFrom: clonedVersion ? { ...await sourceAttribution(event.context.$db, String(clonedVersion.egcs_cn_publication)), versionId: String(clonedVersion.id), version: clonedVersion.egcs_cn_version } : null, compatibility: compatibility(row.egcs_cn_document), versions: versions.map(versionEvidence), capabilities: { canEdit: auth.userAbilities.authorize('guided_help', 'update', scope(guideOwner(row))), canPublish: auth.userAbilities.authorize('guided_help', 'update', scope(guideOwner(row))), canRetire: auth.userAbilities.authorize('guided_help', 'delete', scope(guideOwner(row))), canDelete: auth.userAbilities.authorize('guided_help', 'delete', scope(guideOwner(row))) && metadata.publicationState === 'draft' } }
}
export const listGuidedHelp = async (event: H3Event, agencyId: string | null) => {
  await authorize(event, 'guided_help', 'read', scope({ agencyId }))
  if (agencyId !== null) await ensureAgency(event, event.context.$db, agencyId)
  let query = event.context.$db.selectFrom('Common_Guided_Help').select('id').where('_deleted', '=', false)
  query = agencyId === null ? query.where('egcs_cn_agency', 'is', null) : query.where('egcs_cn_agency', '=', agencyId)
  const rows = await query.orderBy('id').execute()
  return { items: await Promise.all(rows.map(row => readGuidedHelp(event, String(row.id)))) }
}
export const createGuidedHelp = async (event: H3Event, agencyId: string | null, input: { egcs_cn_document: GuideDraft; egcs_cn_shared?: boolean }) => {
  const id = await transaction(event, { agencyId }, 'create', async db => {
    const id = await createPublication(db, 'guided_help')
    await db.insertInto('Common_Guided_Help').values({ id, egcs_cn_ownertype: agencyId === null ? 'system' : 'agency', egcs_cn_agency: agencyId, egcs_cn_document: json(input.egcs_cn_document), egcs_cn_shared: input.egcs_cn_shared ?? false }).execute()
    return id
  })
  return readGuidedHelp(event, id)
}
export const updateGuidedHelp = async (event: H3Event, id: string, input: { egcs_cn_document: GuideDraft; egcs_cn_shared?: boolean }) => {
  await requireAuthContext(event)
  const initial = await guide(event, event.context.$db, id)
  await transaction(event, guideOwner(initial), 'update', async db => {
    const row = await guide(event, db, id, true)
    if (row.egcs_cn_agency !== initial.egcs_cn_agency) return fail(event, 'conflict', 409)
    const metadata = await readPublicationMetadata(db, id)
    if (metadata.publicationState === 'retired') return fail(event, 'unavailable', 409)
    await db.updateTable('Common_Guided_Help').set({ egcs_cn_document: json(input.egcs_cn_document), ...(input.egcs_cn_shared === undefined ? {} : { egcs_cn_shared: input.egcs_cn_shared }) }).where('id', '=', id).execute()
  })
  return readGuidedHelp(event, id)
}
export const publishGuidedHelp = async (event: H3Event, id: string) => {
  await requireAuthContext(event)
  const initial = await guide(event, event.context.$db, id)
  await transaction(event, guideOwner(initial), 'update', async (db, actorId) => {
    const row = await guide(event, db, id, true)
    const document = await validateDocument(event, row.egcs_cn_document)
    await publishDefinition(db, { publicationId: id, kind: 'guided_help', definition: json(document), actorId })
  })
  return readGuidedHelp(event, id)
}
export const retireGuidedHelp = async (event: H3Event, id: string) => {
  await requireAuthContext(event)
  const initial = await guide(event, event.context.$db, id)
  await transaction(event, guideOwner(initial), 'delete', async (db, actorId) => {
    await guide(event, db, id, true)
    await retirePublication(db, { publicationId: id, kind: 'guided_help', actorId })
  })
  return readGuidedHelp(event, id)
}
export const deleteGuidedHelp = async (event: H3Event, id: string) => {
  await requireAuthContext(event)
  const initial = await guide(event, event.context.$db, id)
  return transaction(event, guideOwner(initial), 'delete', async db => {
    await guide(event, db, id, true)
    const metadata = await readPublicationMetadata(db, id)
    const reference = await db.selectFrom('Agency_Guided_Help').select('id').where('egcs_ay_guide', '=', id).executeTakeFirst()
    if (metadata.publicationState !== 'draft' || reference) return fail(event, 'conflict', 409)
    await db.updateTable('Common_Guided_Help').set({ _deleted: true }).where('id', '=', id).execute()
    await db.updateTable('Common_Publication').set({ _deleted: true }).where('id', '=', id).execute()
    return { success: true }
  })
}

export const listSharedGuidedHelp = async (event: H3Event, agencyId: string) => {
  await authorize(event, 'guided_help', 'read', scope({ agencyId }))
  await ensureAgency(event, event.context.$db, agencyId)
  const rows = await event.context.$db.selectFrom('Common_Guided_Help as Guide').innerJoin('Common_Publication as Publication', 'Publication.id', 'Guide.id').innerJoin('Common_Publication_Version as Version', 'Version.id', 'Publication.egcs_cn_currentversion').select(['Guide.id', 'Guide.egcs_cn_ownertype', 'Guide.egcs_cn_agency', 'Version.id as sourceVersionId', 'Version.egcs_cn_version as version', 'Version.egcs_cn_definition as document']).where('Guide._deleted', '=', false).where('Guide.egcs_cn_shared', '=', true).where('Publication._deleted', '=', false).where('Publication.egcs_cn_state', '=', 'published').execute()
  return { items: await Promise.all(rows.map(async row => ({ ...row, sourceAttribution: await sourceAttribution(event.context.$db, String(row.id)), compatibility: compatibility(row.document) }))) }
}
const catalog = async (event: H3Event, db: Db, agencyId: string, id: string, lock = false) => {
  if (!isPositivePostgresBigintText(id)) return fail(event, 'not_found')
  let query = db.selectFrom('Agency_Guided_Help').selectAll().where('id', '=', id).where('egcs_ay_agency', '=', agencyId).where('_deleted', '=', false)
  if (lock) query = query.forUpdate()
  const row = await query.executeTakeFirst()
  if (!row) return fail(event, 'not_found')
  return row
}
const retainedGuideVersionIds = async (db: Db, agencyId: string, guideId: string) => {
  const retainedIds = new Set<string>()
  const localCopies = await db.selectFrom('Agency_Guided_Help').select(['id', 'egcs_ay_sourceversion']).where('egcs_ay_agency', '=', agencyId).where('egcs_ay_guide', '=', guideId).where('_deleted', '=', false).execute()
  if (!localCopies.length) return retainedIds
  for (const local of localCopies) retainedIds.add(String(local.egcs_ay_sourceversion))
  const localHistory = await db.selectFrom('Common_Publication_Version').select('egcs_cn_definition').where('egcs_cn_publication', 'in', localCopies.map(local => String(local.id))).where('egcs_cn_kind', '=', 'guided_help_catalog').execute()
  for (const historical of localHistory) {
    const definition = historical.egcs_cn_definition
    if (definition && typeof definition === 'object' && !Array.isArray(definition) && typeof definition.sourceVersionId === 'string') retainedIds.add(definition.sourceVersionId)
  }
  return retainedIds
}
export const readGuidedHelpCatalog = async (event: H3Event, agencyId: string, id: string) => {
  await authorize(event, 'guided_help', 'read', scope({ agencyId }))
  await ensureAgency(event, event.context.$db, agencyId)
  const row = await catalog(event, event.context.$db, agencyId, id)
  const sourceVersion = await version(event, event.context.$db, String(row.egcs_ay_sourceversion), String(row.egcs_ay_guide))
  const sourceMetadata = await readPublicationMetadata(event.context.$db, String(row.egcs_ay_guide))
  const sourceVersions = await event.context.$db.selectFrom('Common_Publication_Version').selectAll().where('egcs_cn_publication', '=', String(row.egcs_ay_guide)).where('egcs_cn_kind', '=', 'guided_help').orderBy('egcs_cn_version', 'desc').execute()
  const source = await guide(event, event.context.$db, String(row.egcs_ay_guide))
  const canInspectAll = String(source.egcs_cn_agency) === agencyId || (source.egcs_cn_shared && sourceMetadata.publicationState === 'published')
  const retainedIds = canInspectAll ? new Set<string>() : await retainedGuideVersionIds(event.context.$db, agencyId, String(row.egcs_ay_guide))
  const visibleVersions = sourceVersions.filter(item => canInspectAll || retainedIds.has(String(item.id)))
  const latestSourceVersionId = sourceMetadata.publicationVersionId && (canInspectAll || retainedIds.has(sourceMetadata.publicationVersionId)) ? sourceMetadata.publicationVersionId : undefined
  return { sourceAttribution: await sourceAttribution(event.context.$db, String(row.egcs_ay_guide)), sourceVersions: visibleVersions.map(versionEvidence), ...row, ...await readPublicationMetadata(event.context.$db, id, json(settings(row))), sourceVersionDocument: sourceVersion.egcs_cn_definition, latestSourceVersionId, compatibility: compatibility(sourceVersion.egcs_cn_definition) }
}
export const listGuidedHelpCatalog = async (event: H3Event, agencyId: string) => {
  await authorize(event, 'guided_help', 'read', scope({ agencyId }))
  await ensureAgency(event, event.context.$db, agencyId)
  const rows = await event.context.$db.selectFrom('Agency_Guided_Help').select('id').where('egcs_ay_agency', '=', agencyId).where('_deleted', '=', false).execute()
  return { items: await Promise.all(rows.map(row => readGuidedHelpCatalog(event, agencyId, String(row.id)))) }
}
type CatalogInput = { egcs_ay_sourceversion: string; egcs_ay_discoveryscreens: string[]; egcs_ay_roles: string[] }
export const adoptGuidedHelp = async (event: H3Event, agencyId: string, input: CatalogInput & { egcs_ay_guide: string }) => {
  const id = await transaction(event, { agencyId }, 'create', async db => {
    await validateSettings(event, db, agencyId, input)
    await offered(event, db, input.egcs_ay_guide, input.egcs_ay_sourceversion, { agencyId })
    const id = await createPublication(db, 'guided_help_catalog')
    await db.insertInto('Agency_Guided_Help').values({ id, egcs_ay_agency: agencyId, egcs_ay_guide: input.egcs_ay_guide, egcs_ay_sourceversion: input.egcs_ay_sourceversion, egcs_ay_discoveryscreens: JSON.stringify(input.egcs_ay_discoveryscreens), egcs_ay_roles: JSON.stringify(input.egcs_ay_roles) }).execute()
    return id
  }, input.egcs_ay_roles)
  return readGuidedHelpCatalog(event, agencyId, id)
}
export const updateGuidedHelpCatalog = async (event: H3Event, agencyId: string, id: string, input: CatalogInput) => {
  await transaction(event, { agencyId }, 'update', async db => {
    await validateSettings(event, db, agencyId, input)
    const row = await catalog(event, db, agencyId, id, true)
    await offered(event, db, String(row.egcs_ay_guide), input.egcs_ay_sourceversion, { agencyId }, (await retainedGuideVersionIds(db, agencyId, String(row.egcs_ay_guide))).has(input.egcs_ay_sourceversion))
    await db.updateTable('Agency_Guided_Help').set({ egcs_ay_sourceversion: input.egcs_ay_sourceversion, egcs_ay_discoveryscreens: JSON.stringify(input.egcs_ay_discoveryscreens), egcs_ay_roles: JSON.stringify(input.egcs_ay_roles) }).where('id', '=', id).execute()
  }, input.egcs_ay_roles)
  return readGuidedHelpCatalog(event, agencyId, id)
}
export const publishGuidedHelpCatalog = async (event: H3Event, agencyId: string, id: string) => {
  await authorize(event, 'guided_help', 'update', scope({ agencyId }))
  const initial = await catalog(event, event.context.$db, agencyId, id)
  const roleIds = initial.egcs_ay_roles as string[]
  await transaction(event, { agencyId }, 'update', async (db, actorId) => {
    const row = await catalog(event, db, agencyId, id, true)
    if (JSON.stringify(row.egcs_ay_roles) !== JSON.stringify(roleIds)) return fail(event, 'conflict', 409)
    await validateSettings(event, db, agencyId, { egcs_ay_discoveryscreens: row.egcs_ay_discoveryscreens as string[], egcs_ay_roles: row.egcs_ay_roles as string[] })
    const source = await version(event, db, String(row.egcs_ay_sourceversion), String(row.egcs_ay_guide))
    await validateDocument(event, source.egcs_cn_definition)
    await publishDefinition(db, { publicationId: id, kind: 'guided_help_catalog', actorId, definition: json(settings(row)) })
    await db.updateTable('Agency_Guided_Help').set({ egcs_ay_enabled: true }).where('id', '=', id).execute()
  }, roleIds)
  return readGuidedHelpCatalog(event, agencyId, id)
}
export const unpublishGuidedHelpCatalog = async (event: H3Event, agencyId: string, id: string) => transaction(event, { agencyId }, 'update', async db => {
  await catalog(event, db, agencyId, id, true)
  await db.updateTable('Agency_Guided_Help').set({ egcs_ay_enabled: false }).where('id', '=', id).execute()
  return { success: true }
})
export const cloneGuidedHelp = async (event: H3Event, agencyId: string, sourceVersionId: string) => {
  const id = await transaction(event, { agencyId }, 'create', async db => {
    const sourceVersion = await version(event, db, sourceVersionId)
    const sourceId = String(sourceVersion.egcs_cn_publication)
    const retained = await retainedGuideVersionIds(db, agencyId, sourceId)
    await offered(event, db, sourceId, sourceVersionId, { agencyId }, retained.has(sourceVersionId))
    const id = await createPublication(db, 'guided_help')
    await db.insertInto('Common_Guided_Help').values({ id, egcs_cn_ownertype: 'agency', egcs_cn_agency: agencyId, egcs_cn_document: sourceVersion.egcs_cn_definition, egcs_cn_shared: false, egcs_cn_clonedfromversion: sourceVersionId }).execute()
    return id
  })
  return readGuidedHelp(event, id)
}

const visibleAgreementAgencies = async (event: H3Event) => {
  const auth = await requireAuthContext(event)
  const db = event.context.$db
  const visibility = await resolveAgreementVisibility(auth, 'read', db)
  let query = db.selectFrom('Agency_Profile').select('Agency_Profile.id').where('Agency_Profile._deleted', '=', false)
  if (!visibility.hasGlobalAccess) query = query.where(eb => eb.or([
    ...(visibility.agencyIds.length ? [eb('Agency_Profile.id', 'in', visibility.agencyIds)] : []),
    ...(visibility.transferPaymentIds.length ? [eb.exists(eb.selectFrom('Transfer_Payment_Profile').select('id').whereRef('egcs_tp_agency', '=', 'Agency_Profile.id').where('id', 'in', visibility.transferPaymentIds).where('_deleted', '=', false))] : []),
    ...(visibility.agreementIds.length ? [eb.exists(eb.selectFrom('Funding_Case_Agreement_Profile as Agreement').innerJoin('Transfer_Payment_Stream as Stream', 'Stream.id', 'Agreement.egcs_fc_transferpaymentstream').innerJoin('Transfer_Payment_Profile as Program', 'Program.id', 'Stream.egcs_tp_transferpaymentprofile').select('Agreement.id').whereRef('Program.egcs_tp_agency', '=', 'Agency_Profile.id').where('Agreement.id', 'in', visibility.agreementIds).where('Agreement._deleted', '=', false).where('Stream._deleted', '=', false).where('Program._deleted', '=', false))] : [])
  ]))
  return (await query.execute()).map(row => String(row.id))
}
const authorizeScreen = async (event: H3Event, agencyId: string, view: string, reviewId?: string, agreementId?: string) => {
  await requireAuthContext(event)
  if (agreementId !== undefined) {
    if (!isPositivePostgresBigintText(agreementId)) return fail(event, 'not_found')
    const agreement = await authorizeAgreementResource(event, 'read', agreementId, event.context.$db)
    if (!agreement || agreement.agencyId !== agencyId) return fail(event, 'not_found')
  }
  if (view === 'agreements.list' || view === 'agreement.risk-rating') {
    if (view === 'agreement.risk-rating' && !agreementId) return fail(event, 'unavailable', 409)
    if (view === 'agreements.list' && !(await visibleAgreementAgencies(event)).includes(agencyId)) return fail(event, 'not_found')
    return
  }
  if (view === 'assessment.detail') {
    if (!reviewId || !isPositivePostgresBigintText(reviewId)) return fail(event, 'unavailable', 409)
    const context = await resolveReviewRuntimeEntityFromReview(event.context.$db, reviewId)
    if (!context || getReviewRuntimeOwnerAgencyId(context) !== agencyId || (agreementId && context.agreementId !== agreementId)) return fail(event, 'not_found')
    await authorizeReviewRuntimeAction(event, 'read_assessment', context)
    return
  }
  // Each supported view has a trusted host-owned authorization mapping. A ledger entry alone grants nothing.
  if (!['agency.general', 'agency.address-types', 'agency.agreement-types'].includes(view)) return fail(event, 'unavailable', 409)
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  await ensureAgency(event, event.context.$db, agencyId)
}
const eligibleCatalogs = async (event: H3Event, agencyId: string, view: string, reviewId?: string, agreementId?: string) => {
  await authorizeScreen(event, agencyId, view, reviewId, agreementId)
  const auth = await requireAuthContext(event)
  const assignments = await getActiveStructuralRoleAssignments(event.context.$db, [auth.userId])
  const roleIds = new Set(assignments.filter(item => item.scopeType === 'global' || item.agencyId === agencyId).map(item => item.roleId))
  const rows = await event.context.$db.selectFrom('Agency_Guided_Help as Catalog').innerJoin('Common_Publication as Publication', 'Publication.id', 'Catalog.id').innerJoin('Common_Publication_Version as Version', 'Version.id', 'Publication.egcs_cn_currentversion').select(['Catalog.id', 'Catalog.egcs_ay_guide', 'Version.id as publicationVersionId', 'Version.egcs_cn_definition as definition']).where('Catalog.egcs_ay_agency', '=', agencyId).where('Catalog._deleted', '=', false).where('Catalog.egcs_ay_enabled', '=', true).where('Publication._deleted', '=', false).where('Publication.egcs_cn_state', '=', 'published').execute()
  return rows.filter(row => {
    const definition = row.definition as unknown as Settings
    return definition.discoveryScreens.includes(view) && definition.roles.some(role => roleIds.has(role))
  })
}
export const discoverGuidedHelp = async (event: H3Event, agencyId: string, view: string, reviewId?: string, agreementId?: string) => {
  const rows = await eligibleCatalogs(event, agencyId, view, reviewId, agreementId)
  const items = []
  for (const row of rows) {
    const local = row.definition as unknown as Settings
    const source = await version(event, event.context.$db, local.sourceVersionId, String(row.egcs_ay_guide))
    if (!compatibility(source.egcs_cn_definition).length) items.push({ id: String(row.id), publicationVersionId: String(row.publicationVersionId), document: source.egcs_cn_definition })
  }
  return { items }
}
export const launchGuidedHelp = async (event: H3Event, agencyId: string, id: string, view: string, reviewId?: string, agreementId?: string) => {
  const eligible = (await eligibleCatalogs(event, agencyId, view, reviewId, agreementId)).find(row => String(row.id) === id)
  if (!eligible) return fail(event, 'not_found')
  const local = eligible.definition as unknown as Settings
  const source = await version(event, event.context.$db, local.sourceVersionId, String(eligible.egcs_ay_guide))
  const document = await validateDocument(event, source.egcs_cn_definition)
  return { agencyId, catalogId: id, publicationVersionId: String(eligible.publicationVersionId), sourceVersionId: String(source.id), document }
}

export const discoverCollectionGuidedHelp = async (event: H3Event, view: string) => {
  await requireAuthContext(event)
  if (view !== 'agreements.list') return fail(event, 'unavailable', 409)
  const agencyIds = await visibleAgreementAgencies(event)
  if (!agencyIds.length) return { items: [] }
  const agencies = await event.context.$db.selectFrom('Agency_Profile')
    .select(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr']).where('id', 'in', agencyIds).execute()
  const groups = await Promise.all(agencyIds.map(async agencyId => {
    const result = await discoverGuidedHelp(event, agencyId, view)
    const agency = agencies.find(item => String(item.id) === agencyId)
    const agencyName = { en: agency?.egcs_ay_name_en ?? '', fr: agency?.egcs_ay_name_fr ?? '' }
    return result.items.map(item => ({ ...item, agencyId, agencyName }))
  }))
  return { items: groups.flat() }
}
