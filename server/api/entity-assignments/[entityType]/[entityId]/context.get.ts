import { forbidden, notFound } from '~~/server/utils/api-errors'
import {
  canReadEntityAssignments,
  resolveAssignmentAgreementId
} from '~~/server/utils/entity-assignment'
import { EntityAssignmentTargetSchema } from '~~/shared/types/schemas'
import { parseI18n } from '~~/server/utils/api-validate'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { requireAuthContext } from '~~/server/utils/authorize'
import type { AssignableEntityType } from '~~/shared/types/database'
import {
  authorizeExtensionEntityAssignmentRead,
  resolveExtensionEntityAssignmentOwner,
  resolveExtensionEntityAssignmentRuntime
} from '~~/server/utils/extension-entity-assignment'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const target = await parseI18n(event, EntityAssignmentTargetSchema, {
    entityType: getRouterParam(event, 'entityType'),
    entityId: getRouterParam(event, 'entityId')
  })
  const extensionRuntime = target.entityType.includes(':')
    ? await resolveExtensionEntityAssignmentRuntime(event, target.entityType, target.entityId)
    : null
  if (extensionRuntime) await authorizeExtensionEntityAssignmentRead(event, extensionRuntime)
  else if (!await canReadEntityAssignments(event, target.entityType as AssignableEntityType, target.entityId)) return await forbidden(event)

  const extensionOwner = extensionRuntime ? resolveExtensionEntityAssignmentOwner(extensionRuntime) : null
  const agreementId = extensionOwner?.kind === 'agreement'
    ? extensionOwner.agreementId
    : await resolveAssignmentAgreementId(event.context.$db, target.entityType as AssignableEntityType, target.entityId)
  if (!agreementId) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const agreement = await event.context.$db.selectFrom('Funding_Case_Agreement_Profile')
    .select([
      'id',
      'egcs_fc_agreementnumber',
      'egcs_fc_title_en',
      'egcs_fc_title_fr'
    ])
    .where('id', '=', agreementId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!agreement) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const scopeContext = await resolveAgreementScopeContext(agreementId, event.context.$db)
  const auth = await requireAuthContext(event)
  let canReadAgreement = false
  if (scopeContext) {
    canReadAgreement = await canAccessAgreement(auth, 'read', scopeContext.scope, event.context.$db)
  }
  return { ...agreement, can_read_agreement: canReadAgreement }
})
