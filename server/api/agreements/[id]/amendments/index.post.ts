import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { FundingCaseAgreementAmendmentCreateSchema } from '~~/shared/types/schemas'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'
import { assertAgreementAmendable } from '~~/server/utils/agreement-amendment'
import { lockAgencyDraftStatus } from '~~/server/utils/business-status-runtime'
import { dateOnlySql } from '~~/server/utils/database-date'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const agreementContext = await authorizeAgreementResource(event, 'create', agreementId, db)
  if (!agreementContext) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementAmendmentCreateSchema)
  try {
    return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, current, auth) => {
      await assertAgreementAmendable(event, trx, agreementId)
      const openAmendment = await trx.selectFrom('Funding_Case_Agreement_Amendment').select('id')
        .where('egcs_fc_fundingagreement', '=', agreementId)
        .where('egcs_fc_isopen', '=', true)
        .where('_deleted', '=', false).executeTakeFirst()
      if (openAmendment) {
        return await badRequest(event, 'AGREEMENT_OPEN_AMENDMENT_EXISTS', 'apiErrors.agreement.open_amendment_exists')
      }
      const types = await trx.selectFrom('Transfer_Payment_Amendment_Type')
        .select(['id', 'egcs_tp_amended', 'egcs_tp_requiresamendmentsubtype'])
        .where('id', 'in', validated.amendment_type_ids)
        .where('egcs_tp_transferpaymentstream', '=', current.streamId)
        .where('_deleted', '=', false)
        .execute()
      if (types.length !== validated.amendment_type_ids.length) {
        return await badRequest(event, 'INVALID_AGREEMENT_AMENDMENT_TYPE', 'apiErrors.agreement.invalid_amendment_type')
      }
      const subtypeLinks = validated.amendment_subtype_ids.length > 0
        ? await trx.selectFrom('Transfer_Payment_Amendment_Subtype_Type')
            .innerJoin('Transfer_Payment_Amendment_Subtype', 'Transfer_Payment_Amendment_Subtype.id', 'Transfer_Payment_Amendment_Subtype_Type.egcs_tp_amendmentsubtype')
            .select(['Transfer_Payment_Amendment_Subtype.id as subtype_id', 'Transfer_Payment_Amendment_Subtype_Type.egcs_tp_amendmenttype as type_id'])
            .where('Transfer_Payment_Amendment_Subtype.id', 'in', validated.amendment_subtype_ids)
            .where('Transfer_Payment_Amendment_Subtype.egcs_tp_transferpaymentstream', '=', current.streamId)
            .where('Transfer_Payment_Amendment_Subtype._deleted', '=', false)
            .where('Transfer_Payment_Amendment_Subtype_Type._deleted', '=', false)
            .forUpdate('Transfer_Payment_Amendment_Subtype')
            .execute()
        : []
      const validSubtypeIds = new Set(subtypeLinks.map(link => String(link.subtype_id)))
      const selectedTypeIdSet = new Set(validated.amendment_type_ids.map(String))
      const subtypeOutsideSelectedTypes = validated.amendment_subtype_ids.some(subtypeId => !subtypeLinks.some(link =>
        String(link.subtype_id) === String(subtypeId) && selectedTypeIdSet.has(String(link.type_id))
      ))
      const missingRequiredSubtype = types.some(type => type.egcs_tp_requiresamendmentsubtype
        && !subtypeLinks.some(link => String(link.type_id) === String(type.id)))
      if (validSubtypeIds.size !== validated.amendment_subtype_ids.length || subtypeOutsideSelectedTypes || missingRequiredSubtype) {
        return await badRequest(event, 'INVALID_AGREEMENT_AMENDMENT_SUBTYPE', 'apiErrors.agreement.invalid_amendment_subtype')
      }
      const durationEnabled = types.some(type => type.egcs_tp_amended === 'duration')
      const agreementDates = durationEnabled
        ? await trx.selectFrom('Funding_Case_Agreement_Profile')
            .select(['egcs_fc_authorizedassistancestartdate', 'egcs_fc_authorizedassistanceenddate'])
            .where('id', '=', agreementId).where('_deleted', '=', false).executeTakeFirstOrThrow()
        : null
      const creatorId = await resolveAssignmentCommonUserId(trx, auth.userId)
      if (!creatorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')

      const latestAmendment = await trx.selectFrom('Funding_Case_Agreement_Amendment')
        .select('egcs_fc_amendmentnumber')
        .where('egcs_fc_fundingagreement', '=', agreementId)
        .orderBy('egcs_fc_amendmentnumber', 'desc')
        .executeTakeFirst()
      const amendmentNumber = (latestAmendment?.egcs_fc_amendmentnumber ?? 0) + 1
      const draftStatusId = await lockAgencyDraftStatus(trx, current.agencyId)

      const amendment = await trx.insertInto('Funding_Case_Agreement_Amendment').values({
        egcs_fc_fundingagreement: agreementId,
        egcs_fc_amendmentnumber: amendmentNumber,
        egcs_fc_name_en: validated.egcs_fc_name_en,
        egcs_fc_name_fr: validated.egcs_fc_name_fr,
        egcs_fc_status: draftStatusId,
        egcs_fc_proposedauthorizedassistancestartdate: agreementDates?.egcs_fc_authorizedassistancestartdate
          ? dateOnlySql(agreementDates.egcs_fc_authorizedassistancestartdate)
          : undefined,
        egcs_fc_proposedauthorizedassistanceenddate: agreementDates?.egcs_fc_authorizedassistanceenddate
          ? dateOnlySql(agreementDates.egcs_fc_authorizedassistanceenddate)
          : undefined
      }).returningAll().executeTakeFirstOrThrow()
      await trx.insertInto('Funding_Case_Agreement_Amendment_Type').values(validated.amendment_type_ids.map(typeId => ({
        egcs_fc_amendment: amendment.id,
        egcs_fc_amendmenttype: typeId
      }))).execute()
      if (validated.amendment_subtype_ids.length > 0) {
        await trx.insertInto('Funding_Case_Agreement_Amendment_Subtype').values(validated.amendment_subtype_ids.map(subtypeId => ({
          egcs_fc_amendment: amendment.id,
          egcs_fc_amendmentsubtype: subtypeId
        }))).execute()
      }
      await createPrimaryEntityAssignment(trx, 'fundingcaseamendment', String(amendment.id), creatorId)
      return { ...amendment, amendment_type_ids: validated.amendment_type_ids, amendment_subtype_ids: validated.amendment_subtype_ids }
    }, { action: 'create' })
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
