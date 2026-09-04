import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import {
  AGREEMENT_CHILD_ERROR_KEYS,
  assertAgreementChildExists,
  assertAgreementExists
} from '~~/server/utils/agreement-child-resources'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import {
  hasOtherActiveAgreementCommonAddressReferences,
  lockActiveAgreementCommonAddress
} from '~~/server/utils/agreement-address-routes'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const childId = getRouterParam(event, 'childId')

  if (!agreementId || !childId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(childId)) {
    return await badRequest(event, 'AGREEMENT_ADDRESS_NOT_FOUND', 'apiErrors.agreement.address_not_found')
  }

  const agreementContext = await authorizeAgreementResource(event, 'delete', agreementId, db)
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async trx => {
    const agreement = await assertAgreementExists(event, agreementId, trx)
    if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
      return agreement
    }

    const existing = await assertAgreementChildExists(
      event,
      trx
        .selectFrom('Funding_Case_Agreement_Address')
        .where('id', '=', childId)
        .where('egcs_fc_fundingagreement', '=', agreementId)
        .where('_deleted', '=', false)
        .select(['id', 'egcs_fc_address'])
        .forUpdate()
        .executeTakeFirst(),
      ...AGREEMENT_CHILD_ERROR_KEYS.addressNotFound
    )
    if (!existing || typeof existing !== 'object' || !('id' in existing)) {
      return existing
    }

    const commonAddress = await lockActiveAgreementCommonAddress(trx, existing.egcs_fc_address)

    await trx
      .updateTable('Funding_Case_Agreement_Address')
      .set({ _deleted: true })
      .where('id', '=', childId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .execute()

    if (commonAddress) {
      const addressIsStillReferenced = await hasOtherActiveAgreementCommonAddressReferences(
        trx,
        existing.egcs_fc_address,
        childId
      )
      if (!addressIsStillReferenced) {
        await trx
          .updateTable('Common_Address')
          .set({ _deleted: true })
          .where('id', '=', existing.egcs_fc_address)
          .where('_deleted', '=', false)
          .execute()
      }
    }

    return { success: true }
  }, { action: 'delete' })
})
