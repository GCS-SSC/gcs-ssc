/* eslint-disable jsdoc/require-jsdoc -- typed operations define the field help boundary */
import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { FieldTooltipSave, FieldTooltipItem, FieldTooltipList, FieldTooltipResource } from '~~/shared/types/schemas/field-tooltip'
import type { UiTarget } from '~~/shared/ui-targets/types'
import { uiTargetRegistry } from '#ui-targets'
import { authorize, authorizeWithFreshAuthContext, requireAuthContext, requireFreshAuthContext } from './authorize'
import { throwApiError } from './api-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { getDatabaseConstraintName } from './database-constraint-errors'
import { withAuditExecution } from './audit-context'
import { isExtensionEnabledForAgency } from './extensions'
import { authorizeAgreementResource, canAccessAgreementStream, resolveAgreementStreamScopeContext } from './agreement'
import { resolveFundingOpportunityScope } from './funding-case'
import { authorizeReviewRuntimeAction, getReviewRuntimeOwnerAgencyId, resolveReviewRuntimeEntityFromReview, resolveReviewRuntimeEntityFromRecommendation, resolveReviewRuntimeEntityFromDataCollection } from './review-runtime-access'
import { requireFundingCaseAccess } from './funding-case-access'
import { authorizeJournalVoucher } from './journal-voucher'
import { canAccessEntityAssignmentOwner, resolveEntityAssignmentOwner } from './entity-assignment'
import { canAccessCreditMemoTargetScopes } from './credit-memo-scope-authority'
import { isAssignableEntityType } from '~~/shared/utils/entity-assignments'

const uiTargets = uiTargetRegistry.targets
const fail = (event: H3Event, code: 'not_found' | 'invalid' | 'conflict' | 'forbidden', statusCode = 404): Promise<never> => throwApiError(event, { statusCode, code: `FIELD_TOOLTIP_${code.toUpperCase()}`, key: `field_tooltips.api.${code}` })
const ownerScope = (agencyId: string) => ({ type: 'agency' as const, agencyId })
const ensureAgency = async (event: H3Event, agencyId: string, db = event.context.$db, lock = false) => {
  if (!isPositivePostgresBigintText(agencyId)) return fail(event, 'not_found')
  let query = db.selectFrom('Agency_Profile').select('id').where('id', '=', agencyId).where('_deleted', '=', false)
  if (lock) query = query.forUpdate()
  if (!await query.executeTakeFirst()) return fail(event, 'not_found')
}
const targetSnapshot = (target: UiTarget) => ({
  egcs_ay_label_en: target.label.en, egcs_ay_label_fr: target.label.fr,
  egcs_ay_screen_en: target.viewLabel.en, egcs_ay_screen_fr: target.viewLabel.fr,
  egcs_ay_extension: target.owner.kind === 'extension' ? target.owner.extensionId : null
})
const availableTargets = async (event: H3Event, agencyId: string) => {
  const eligible = uiTargets.filter(target => target.tooltip)
  const extensionIds = [...new Set(eligible.flatMap(target => target.owner.kind === 'extension' ? [target.owner.extensionId] : []))]
  const enabled = new Set((await Promise.all(extensionIds.map(async id =>
    await isExtensionEnabledForAgency(event.context.$db, id, agencyId) ? id : null))).filter(id => id !== null))
  return eligible.filter(target => target.owner.kind === 'host' || enabled.has(target.owner.extensionId))
}
const itemAvailability = (row: FieldTooltipItem, targets: UiTarget[]): FieldTooltipItem['availability'] => {
  const target = uiTargets.find(item => item.key === row.egcs_ay_targetkey && item.tooltip)
  if (!target) return 'unavailable'
  return targets.some(item => item.key === target.key) ? 'available' : 'extension_disabled'
}
const transaction = async <T>(event: H3Event, agencyId: string, action: 'create' | 'update' | 'delete', work: (db: Transaction<Database>) => Promise<T>) => {
  await authorize(event, 'help', action, ownerScope(agencyId))
  return event.context.$db.transaction().execute(async db => {
    const auth = await requireFreshAuthContext(event, db)
    await ensureAgency(event, agencyId, db, true)
    await authorizeWithFreshAuthContext(event, auth, 'help', action, ownerScope(agencyId))
    return withAuditExecution({ type: 'agency', agencyId }, () => work(db))
  }).catch((error: unknown) => {
    if (getDatabaseConstraintName(error) === 'ay_uq_fieldtooltipactive') return fail(event, 'conflict', 409)
    throw error
  })
}
const readItem = async (event: H3Event, agencyId: string, id: string): Promise<FieldTooltipItem> => {
  const row = await event.context.$db.selectFrom('Agency_Field_Tooltip').selectAll().where('egcs_ay_agency', '=', agencyId).where('id', '=', id).where('_deleted', '=', false).executeTakeFirst()
  if (!row) return fail(event, 'not_found')
  const item: FieldTooltipItem = { ...row, availability: 'unavailable' }
  return { ...item, availability: itemAvailability(item, await availableTargets(event, agencyId)) }
}
export const listFieldTooltips = async (event: H3Event, agencyId: string): Promise<FieldTooltipList> => {
  const auth = await authorize(event, 'help', 'read', ownerScope(agencyId))
  await ensureAgency(event, agencyId)
  const rows = await event.context.$db.selectFrom('Agency_Field_Tooltip').selectAll().where('egcs_ay_agency', '=', agencyId).where('_deleted', '=', false).orderBy('id').execute()
  const targets = await availableTargets(event, agencyId)
  return {
    items: rows.map(row => {
      const item: FieldTooltipItem = { ...row, availability: 'unavailable' }
      return { ...item, availability: itemAvailability(item, targets) }
    }),
    targets,
    capabilities: { canCreate: auth.userAbilities.authorize('help', 'create', ownerScope(agencyId)), canEdit: auth.userAbilities.authorize('help', 'update', ownerScope(agencyId)), canDelete: auth.userAbilities.authorize('help', 'delete', ownerScope(agencyId)) }
  }
}
export const saveFieldTooltip = async (event: H3Event, agencyId: string, input: FieldTooltipSave, id?: string) => {
  const savedId = await transaction(event, agencyId, id !== undefined ? 'update' : 'create', async db => {
    const existing = id && isPositivePostgresBigintText(id) ? await db.selectFrom('Agency_Field_Tooltip').selectAll().where('id', '=', id).where('egcs_ay_agency', '=', agencyId).where('_deleted', '=', false).forUpdate().executeTakeFirst() : undefined
    if (id !== undefined && !existing) return fail(event, 'not_found')
    const target = uiTargets.find(item => item.key === input.egcs_ay_targetkey && item.tooltip)
    if ((!existing || existing.egcs_ay_targetkey !== input.egcs_ay_targetkey) && !target) return fail(event, 'invalid', 400)
    if ((!existing || existing.egcs_ay_targetkey !== input.egcs_ay_targetkey) && target?.owner.kind === 'extension' && !await isExtensionEnabledForAgency(db, target.owner.extensionId, agencyId)) return fail(event, 'invalid', 400)
    if (existing) {
      await db.updateTable('Agency_Field_Tooltip').set({ ...input, ...(target ? targetSnapshot(target) : {}) }).where('id', '=', existing.id).execute()
      return existing.id
    }
    if (!target) return fail(event, 'invalid', 400)
    const row = await db.insertInto('Agency_Field_Tooltip').values({ ...input, ...targetSnapshot(target), egcs_ay_agency: agencyId }).returning('id').executeTakeFirstOrThrow()
    return row.id
  })
  return readItem(event, agencyId, savedId)
}
export const deleteFieldTooltip = async (event: H3Event, agencyId: string, id: string) => transaction(event, agencyId, 'delete', async db => {
  if (!isPositivePostgresBigintText(id)) return fail(event, 'not_found')
  const row = await db.updateTable('Agency_Field_Tooltip').set({ _deleted: true }).where('id', '=', id).where('egcs_ay_agency', '=', agencyId).where('_deleted', '=', false).returning('id').executeTakeFirst()
  if (!row) return fail(event, 'not_found')
  return { success: true }
})
const resolveRuntimeAgency = async (event: H3Event, context: FieldTooltipResource): Promise<string | null> => {
  const auth = await requireAuthContext(event)
  const db = event.context.$db
  switch (context.entityType) {
    case 'agreement_create': {
      const owner = await resolveAgreementStreamScopeContext(context.entityId, db, { requireAvailable: true })
      if (!owner) return fail(event, 'not_found')
      await authorize(event, 'agreement', 'create', async ({ context: current }) => {
        if (await canAccessAgreementStream(current, 'create', owner.scope, db)) return { bypass: true }
        return { scope: owner.scope }
      })
      return owner.agencyId
    }
    case 'funding_case_intake_create': {
      const owner = await resolveFundingOpportunityScope(db, context.entityId)
      await authorize(event, 'funding_case', 'create', owner?.scope ?? { type: 'global' })
      if (!owner) return fail(event, 'not_found')
      return owner.agencyId
    }
    case 'agreement': {
      const agreement = await authorizeAgreementResource(event, 'read', context.entityId, db)
      if (!agreement) return fail(event, 'not_found')
      return agreement.agencyId
    }
    case 'funding_case_intake':
      return (await requireFundingCaseAccess(event, context.entityId, 'read', db)).agencyId
    case 'journal_voucher':
      return (await authorizeJournalVoucher(event, context.entityId)).agencyId
    case 'review':
    case 'recommendation':
    case 'data_collection': {
      const resolve = context.entityType === 'review'
        ? resolveReviewRuntimeEntityFromReview
        : context.entityType === 'recommendation' ? resolveReviewRuntimeEntityFromRecommendation : resolveReviewRuntimeEntityFromDataCollection
      const runtime = await resolve(db, context.entityId)
      if (!runtime) return fail(event, 'not_found')
      await authorizeReviewRuntimeAction(event, 'read_assessment', runtime)
      if (!runtime.agreementId && runtime.entityType !== 'fundingcaseintake') return null
      return getReviewRuntimeOwnerAgencyId(runtime)
    }
    default: {
      const entityType = context.entityType
      if (!isAssignableEntityType(entityType)) return fail(event, 'invalid', 400)
      const owner = await resolveEntityAssignmentOwner(db, entityType, context.entityId)
      if (!owner) return fail(event, 'not_found')
      if (!await canAccessEntityAssignmentOwner(auth, owner, 'read', db)
        || !await canAccessCreditMemoTargetScopes(db, auth, entityType, context.entityId, 'read')) return fail(event, 'forbidden', 403)
      return owner.kind === 'agreement' ? owner.agencyId : null
    }
  }
}
export const readRuntimeFieldTooltips = async (event: H3Event, context: FieldTooltipResource) => {
  const agencyId = await resolveRuntimeAgency(event, context)
  if (!agencyId) return { agencyId: null, items: [] }
  const targets = new Set((await availableTargets(event, agencyId)).map(target => target.key))
  const rows = await event.context.$db.selectFrom('Agency_Field_Tooltip').select(['egcs_ay_targetkey', 'egcs_ay_text_en', 'egcs_ay_text_fr']).where('egcs_ay_agency', '=', agencyId).where('egcs_ay_enabled', '=', true).where('_deleted', '=', false).execute()
  return { agencyId, items: rows.filter(row => targets.has(row.egcs_ay_targetkey)).map(row => ({ targetKey: row.egcs_ay_targetkey, text: { en: row.egcs_ay_text_en, fr: row.egcs_ay_text_fr } })) }
}
