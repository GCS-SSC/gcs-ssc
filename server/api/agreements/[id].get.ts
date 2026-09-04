import { authorizeWithFreshAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { hasAgreementRiskRatingRuns, isAgreementRiskRatingWorkflowManaged, resolveLatestAgreementRiskRating } from '~~/server/utils/agreement-risk-rating'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

// eslint-disable-next-line local/require-authorize -- executeFreshReadSnapshot rebuilds auth before the in-snapshot authorization.
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  return await executeFreshReadSnapshot(event, async db => {
    const freshAuth = await requireFreshAuthContext(event, db)

    const agreementContext = await resolveAgreementScopeContext(id, db)
    if (!agreementContext) {
      return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    }

    const context = await authorizeWithFreshAuthContext(event, freshAuth, 'agreement', 'read', async ({ context }) => {
      const canRead = await canAccessAgreement(context, 'read', agreementContext.scope, db)
      if (canRead) return { bypass: true, data: agreementContext }
      return { scope: agreementContext.scope }
    })

    const agreement = await db
      .selectFrom('Funding_Case_Agreement_Profile')
      .innerJoin(
        'Transfer_Payment_Stream',
        'Transfer_Payment_Stream.id',
        'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'
      )
      .innerJoin(
        'Transfer_Payment_Profile',
        'Transfer_Payment_Profile.id',
        'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
      )
      .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
      .innerJoin('Transfer_Payment_Stream_Holdback_Basis', 'Transfer_Payment_Stream_Holdback_Basis.id', 'Funding_Case_Agreement_Profile.egcs_fc_holdbackbasis')
      .innerJoin('Agency_Holdback_Basis', 'Agency_Holdback_Basis.id', 'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_agencyholdback')
      .innerJoin(
        'Transfer_Payment_Agreement_Subtype',
        join => join
          .onRef('Transfer_Payment_Agreement_Subtype.id', '=', 'Funding_Case_Agreement_Profile.egcs_fc_agreementsubtype')
          .onRef(
            'Transfer_Payment_Agreement_Subtype.egcs_tp_transferpaymentstream',
            '=',
            'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'
          )
      )
      .innerJoin(
        'Agency_Agreement_Type',
        'Agency_Agreement_Type.id',
        'Transfer_Payment_Agreement_Subtype.egcs_tp_agreementtype'
      )
      .leftJoin('Transfer_Payment_Stream_Risk_Rating', join => join
        .onRef(
          'Transfer_Payment_Stream_Risk_Rating.egcs_tp_transferpaymentstream',
          '=',
          'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'
        )
        .onRef(
          'Transfer_Payment_Stream_Risk_Rating.egcs_tp_riskscore',
          '=',
          'Funding_Case_Agreement_Profile.egcs_fc_riskscore'
        )
        .on('Transfer_Payment_Stream_Risk_Rating._deleted', '=', false))
      .where('Funding_Case_Agreement_Profile.id', '=', id)
      .where('Funding_Case_Agreement_Profile._deleted', '=', false)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .where('Agency_Profile._deleted', '=', false)
      .where('Transfer_Payment_Agreement_Subtype._deleted', '=', false)
      .where('Agency_Agreement_Type._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Profile.id as id',
        'Funding_Case_Agreement_Profile.egcs_fc_status as egcs_fc_status',
        'Funding_Case_Agreement_Profile.egcs_fc_agreementnumber as egcs_fc_agreementnumber',
        'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream as egcs_fc_transferpaymentstream',
        'Funding_Case_Agreement_Profile.egcs_fc_financialsystemnumber as egcs_fc_financialsystemnumber',
        'Funding_Case_Agreement_Profile.egcs_fc_title_en as egcs_fc_title_en',
        'Funding_Case_Agreement_Profile.egcs_fc_title_fr as egcs_fc_title_fr',
        'Funding_Case_Agreement_Profile.egcs_fc_description_en as egcs_fc_description_en',
        'Funding_Case_Agreement_Profile.egcs_fc_description_fr as egcs_fc_description_fr',
        'Funding_Case_Agreement_Profile.egcs_fc_agreementtype as egcs_fc_agreementtype',
        'Funding_Case_Agreement_Profile.egcs_fc_agreementsubtype as egcs_fc_agreementsubtype',
        'Funding_Case_Agreement_Profile.egcs_fc_furtherdistribution as egcs_fc_furtherdistribution',
        'Funding_Case_Agreement_Profile.egcs_fc_holdback as egcs_fc_holdback',
        'Funding_Case_Agreement_Profile.egcs_fc_holdbackbasis as egcs_fc_holdbackbasis',
        'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_en as holdback_basis_name_en',
        'Transfer_Payment_Stream_Holdback_Basis.egcs_tp_name_fr as holdback_basis_name_fr',
        'Agency_Holdback_Basis.egcs_ay_languageindependentcode as holdback_basis_code',
        'Funding_Case_Agreement_Profile.egcs_fc_riskscore as egcs_fc_riskscore',
        'Funding_Case_Agreement_Profile.egcs_fc_authorizedassistancestartdate as egcs_fc_authorizedassistancestartdate',
        'Funding_Case_Agreement_Profile.egcs_fc_authorizedassistanceenddate as egcs_fc_authorizedassistanceenddate',
        'Transfer_Payment_Profile.egcs_tp_agency as agency_id',
        'Transfer_Payment_Profile.id as program_id',
        'Agency_Profile.egcs_ay_name_en as agency_name_en',
        'Agency_Profile.egcs_ay_name_fr as agency_name_fr',
        'Transfer_Payment_Profile.egcs_tp_name_en as program_name_en',
        'Transfer_Payment_Profile.egcs_tp_name_fr as program_name_fr',
        'Transfer_Payment_Stream.egcs_tp_name_en as stream_name_en',
        'Transfer_Payment_Stream.egcs_tp_name_fr as stream_name_fr',
        'Agency_Agreement_Type.egcs_ay_name_en as agreement_subtype_name_en',
        'Agency_Agreement_Type.egcs_ay_name_fr as agreement_subtype_name_fr',
        'Transfer_Payment_Stream_Risk_Rating.egcs_tp_name_en as risk_rating_name_en',
        'Transfer_Payment_Stream_Risk_Rating.egcs_tp_name_fr as risk_rating_name_fr'
      ])
      .executeTakeFirst()

    if (!agreement) {
      return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    }

    const [agreementWithState] = await withBusinessRecordState(db, 'fundingcaseagreement', [agreement])

    const [canCreateChildRecords, canUpdate, canDelete] = await Promise.all([
      canAccessAgreement(context, 'create', agreementContext.scope, db),
      canAccessAgreement(context, 'update', agreementContext.scope, db),
      canAccessAgreement(context, 'delete', agreementContext.scope, db)
    ])

    return {
      ...agreementWithState,
      risk_workflow_managed: await isAgreementRiskRatingWorkflowManaged(db, String(agreement.egcs_fc_transferpaymentstream)),
      has_risk_rating_runs: await hasAgreementRiskRatingRuns(db, id),
      latest_risk_rating_run: await resolveLatestAgreementRiskRating(db, id),
      can_update: canUpdate,
      can_delete: canDelete,
      can_create_child_records: canCreateChildRecords,
      can_update_child_records: canUpdate,
      can_delete_child_records: canDelete
    }
  })
})
