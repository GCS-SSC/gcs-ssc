import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertDraftAgreementAmendment, resolveDraftAgreementAmendmentBudgetVersion } from '~~/server/utils/agreement-amendment'
import { FundingCaseAgreementAmendmentPatchSchema } from '~~/shared/types/schemas'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { assertAgreementBudgetFiscalYearsOverlapDuration } from '~~/server/utils/agreement-fiscal-year-duration'
import { dateOnlySql } from '~~/server/utils/database-date'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(agreementId) || !isPositivePostgresBigintText(amendmentId)) {
    return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid')
  }
  const context = await authorizeAgreementResource(event, 'update', agreementId, db)
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  const body = await readValidatedBodyI18n(event, FundingCaseAgreementAmendmentPatchSchema)
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
    const amendment = await assertDraftAgreementAmendment(event, trx, agreementId, amendmentId)
    if (!('id' in amendment)) return amendment
    const selectedTypeIds: string[] = body.amendment_type_ids
      ? body.amendment_type_ids
      : await trx.selectFrom('Funding_Case_Agreement_Amendment_Type')
          .select('egcs_fc_amendmenttype')
          .where('egcs_fc_amendment', '=', amendmentId).where('_deleted', '=', false)
          .execute().then(rows => rows.map(row => String(row.egcs_fc_amendmenttype)))
    const selectedSubtypeIds: string[] = body.amendment_subtype_ids
      ? body.amendment_subtype_ids
      : await trx.selectFrom('Funding_Case_Agreement_Amendment_Subtype').select('egcs_fc_amendmentsubtype')
          .where('egcs_fc_amendment', '=', amendmentId).where('_deleted', '=', false)
          .execute().then(rows => rows.map(row => String(row.egcs_fc_amendmentsubtype)))
    const types = selectedTypeIds.length > 0
      ? await trx.selectFrom('Transfer_Payment_Amendment_Type').select(['id', 'egcs_tp_amended', 'egcs_tp_requiresamendmentsubtype'])
          .where('id', 'in', selectedTypeIds).where('egcs_tp_transferpaymentstream', '=', context.streamId).where('_deleted', '=', false).execute()
      : []
    if (types.length !== selectedTypeIds.length) return await badRequest(event, 'INVALID_AGREEMENT_AMENDMENT_TYPE', 'apiErrors.agreement.invalid_amendment_type')
    const subtypeLinks = selectedSubtypeIds.length > 0
      ? await trx.selectFrom('Transfer_Payment_Amendment_Subtype_Type')
          .innerJoin('Transfer_Payment_Amendment_Subtype', 'Transfer_Payment_Amendment_Subtype.id', 'Transfer_Payment_Amendment_Subtype_Type.egcs_tp_amendmentsubtype')
          .select(['Transfer_Payment_Amendment_Subtype.id as subtype_id', 'Transfer_Payment_Amendment_Subtype_Type.egcs_tp_amendmenttype as type_id'])
          .where('Transfer_Payment_Amendment_Subtype.id', 'in', selectedSubtypeIds)
          .where('Transfer_Payment_Amendment_Subtype.egcs_tp_transferpaymentstream', '=', context.streamId)
          .where('Transfer_Payment_Amendment_Subtype._deleted', '=', false)
          .where('Transfer_Payment_Amendment_Subtype_Type._deleted', '=', false)
          .forUpdate('Transfer_Payment_Amendment_Subtype')
          .execute()
      : []
    const validSubtypeIds = new Set(subtypeLinks.map(link => String(link.subtype_id)))
    const selectedTypeIdSet = new Set(selectedTypeIds.map(String))
    const subtypeOutsideSelectedTypes = selectedSubtypeIds.some(subtypeId => !subtypeLinks.some(link =>
      String(link.subtype_id) === String(subtypeId) && selectedTypeIdSet.has(String(link.type_id))
    ))
    const missingRequiredSubtype = types.some(type => type.egcs_tp_requiresamendmentsubtype
      && !subtypeLinks.some(link => String(link.type_id) === String(type.id)))
    if (validSubtypeIds.size !== selectedSubtypeIds.length || subtypeOutsideSelectedTypes || missingRequiredSubtype) {
      return await badRequest(event, 'INVALID_AGREEMENT_AMENDMENT_SUBTYPE', 'apiErrors.agreement.invalid_amendment_subtype')
    }
    const [budgetSnapshot, activitySnapshot] = await Promise.all([
      trx.selectFrom('Funding_Case_Agreement_Budget_Version').select('id').where('egcs_fc_amendment', '=', amendmentId).where('_deleted', '=', false).executeTakeFirst(),
      trx.selectFrom('Funding_Case_Agreement_Activity_Version').select('id').where('egcs_fc_amendment', '=', amendmentId).where('_deleted', '=', false).executeTakeFirst()
    ])
    if (budgetSnapshot && !types.some(type => ['budget', 'duration'].includes(type.egcs_tp_amended))) {
      return await badRequest(event, 'AGREEMENT_AMENDMENT_BUDGET_TYPE_REQUIRED', 'apiErrors.agreement.amendment_budget_type_required')
    }
    if (activitySnapshot && !types.some(type => type.egcs_tp_amended === 'activities')) {
      return await badRequest(event, 'AGREEMENT_AMENDMENT_ACTIVITIES_TYPE_REQUIRED', 'apiErrors.agreement.amendment_activities_type_required')
    }
    const durationEnabled = types.some(type => type.egcs_tp_amended === 'duration')
    const proposedStartDate = body.egcs_fc_proposedauthorizedassistancestartdate
      ?? amendment.egcs_fc_proposedauthorizedassistancestartdate
    const proposedEndDate = body.egcs_fc_proposedauthorizedassistanceenddate
      ?? amendment.egcs_fc_proposedauthorizedassistanceenddate
    if (durationEnabled && (!proposedStartDate || !proposedEndDate)) {
      return await badRequest(event, 'AGREEMENT_AMENDMENT_DURATION_DATES_REQUIRED', 'apiErrors.agreement.amendment_duration_dates_required')
    }
    if (proposedStartDate && proposedEndDate && proposedStartDate > proposedEndDate) {
      return await badRequest(event, 'AGREEMENT_AMENDMENT_INVALID_DATE_RANGE', 'apiErrors.agreement.amendment_invalid_date_range')
    }
    if (durationEnabled && proposedStartDate && proposedEndDate && budgetSnapshot) {
      const budgetVersionId = await resolveDraftAgreementAmendmentBudgetVersion(event, trx, agreementId, amendmentId)
      if (typeof budgetVersionId !== 'string') return budgetVersionId
      const durationError = await assertAgreementBudgetFiscalYearsOverlapDuration(event, trx, agreementId, {
        startDate: proposedStartDate,
        endDate: proposedEndDate
      }, budgetVersionId)
      if (durationError) return durationError
    }
    if (body.amendment_type_ids) {
      await trx.updateTable('Funding_Case_Agreement_Amendment_Type').set({ _deleted: true })
        .where('egcs_fc_amendment', '=', amendmentId).where('_deleted', '=', false).execute()
      if (selectedTypeIds.length > 0) {
        await trx.insertInto('Funding_Case_Agreement_Amendment_Type').values(selectedTypeIds.map(typeId => ({
          egcs_fc_amendment: amendmentId,
          egcs_fc_amendmenttype: typeId
        }))).execute()
      }
    }
    if (body.amendment_subtype_ids) {
      await trx.updateTable('Funding_Case_Agreement_Amendment_Subtype').set({ _deleted: true })
        .where('egcs_fc_amendment', '=', amendmentId).where('_deleted', '=', false).execute()
      if (selectedSubtypeIds.length > 0) {
        await trx.insertInto('Funding_Case_Agreement_Amendment_Subtype').values(selectedSubtypeIds.map(subtypeId => ({
          egcs_fc_amendment: amendmentId,
          egcs_fc_amendmentsubtype: subtypeId
        }))).execute()
      }
    }
    const updated = await trx.updateTable('Funding_Case_Agreement_Amendment').set({
      egcs_fc_name_en: body.egcs_fc_name_en,
      egcs_fc_name_fr: body.egcs_fc_name_fr,
      egcs_fc_proposedauthorizedassistancestartdate: durationEnabled && proposedStartDate ? dateOnlySql(proposedStartDate) : null,
      egcs_fc_proposedauthorizedassistanceenddate: durationEnabled && proposedEndDate ? dateOnlySql(proposedEndDate) : null
    }).where('id', '=', amendmentId).where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow()
    return { ...updated, amendment_type_ids: selectedTypeIds, amendment_subtype_ids: selectedSubtypeIds }
  }, {
    action: 'update',
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
    businessStatusTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
})
