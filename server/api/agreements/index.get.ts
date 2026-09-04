import { z } from 'zod'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { canAccessAgreement, resolveAgreementVisibility } from '~~/server/utils/agreement'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { PaginationSchema } from '~~/shared/types/schemas'

const AgreementsPaginationSchema = PaginationSchema.extend({
  agency_id: z.coerce.string().optional()
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  const { data: visibility } = await authorize(event, 'agreement', 'read', async ({ context }) => {
    const resolved = await resolveAgreementVisibility(context, 'read', db)
    const hasVisibleRecords = resolved.hasGlobalAccess
      || resolved.agencyIds.length > 0
      || resolved.transferPaymentIds.length > 0
      || resolved.agreementIds.length > 0

    if (hasVisibleRecords) {
      return { bypass: true, data: resolved }
    }

    return { scope: { type: 'global' } }
  })

  const query = await getValidatedQueryI18n(event, AgreementsPaginationSchema)
  const { page, limit, search, agency_id } = query
  const offset = (page - 1) * limit
  const escapedSearch = search ? escapeLikePattern(search) : ''

  let baseQuery = db
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
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .where('Transfer_Payment_Agreement_Subtype._deleted', '=', false)
    .where('Agency_Agreement_Type._deleted', '=', false)

  if (!visibility?.hasGlobalAccess) {
    baseQuery = baseQuery.where(eb => eb.or([
      ...(visibility?.agencyIds.length
        ? [eb('Transfer_Payment_Profile.egcs_tp_agency', 'in', visibility.agencyIds)]
        : []),
      ...(visibility?.transferPaymentIds.length
        ? [eb('Transfer_Payment_Profile.id', 'in', visibility.transferPaymentIds)]
        : []),
      ...(visibility?.agreementIds.length
        ? [eb('Funding_Case_Agreement_Profile.id', 'in', visibility.agreementIds)]
        : [])
    ]))
  }

  if (agency_id) {
    baseQuery = baseQuery.where('Transfer_Payment_Profile.egcs_tp_agency', '=', agency_id)
  }

  if (escapedSearch) {
    baseQuery = baseQuery.where(eb => eb.or([
      eb('Funding_Case_Agreement_Profile.egcs_fc_agreementnumber', 'ilike', `%${escapedSearch}%`),
      eb('Funding_Case_Agreement_Profile.egcs_fc_title_en', 'ilike', `%${escapedSearch}%`),
      eb('Funding_Case_Agreement_Profile.egcs_fc_title_fr', 'ilike', `%${escapedSearch}%`),
      eb('Transfer_Payment_Stream.egcs_tp_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Transfer_Payment_Stream.egcs_tp_name_fr', 'ilike', `%${escapedSearch}%`),
      eb('Transfer_Payment_Profile.egcs_tp_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Transfer_Payment_Profile.egcs_tp_name_fr', 'ilike', `%${escapedSearch}%`),
      eb('Agency_Profile.egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Agency_Profile.egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`),
      eb('Agency_Agreement_Type.egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Agency_Agreement_Type.egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [items, countResult] = await Promise.all([
    baseQuery
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
      .orderBy('Funding_Case_Agreement_Profile.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Funding_Case_Agreement_Profile.id').as('total')).executeTakeFirst()
  ])

  const context = await requireAuthContext(event)
  const itemsWithState = await withBusinessRecordState(db, 'fundingcaseagreement', items)
  const itemsWithPermissions = await Promise.all(itemsWithState.map(async item => {
    const canUpdate = await canAccessAgreement(context, 'update', {
      type: 'entity',
      agencyId: String(item.agency_id),
      path: [
        { type: 'transfer_payment', id: String(item.program_id) },
        { type: 'transfer_payment_stream', id: String(item.egcs_fc_transferpaymentstream) },
        { type: 'fundingcaseagreement', id: String(item.id) }
      ]
    }, db)

    const canDelete = await canAccessAgreement(context, 'delete', {
      type: 'entity',
      agencyId: String(item.agency_id),
      path: [
        { type: 'transfer_payment', id: String(item.program_id) },
        { type: 'transfer_payment_stream', id: String(item.egcs_fc_transferpaymentstream) },
        { type: 'fundingcaseagreement', id: String(item.id) }
      ]
    }, db)
    return {
      ...item,
      can_update: canUpdate,
      can_delete: canDelete
    }
  }))

  const total = Number(countResult?.total || 0)

  return {
    items: itemsWithPermissions,
    total,
    stats: {
      total,
      active: total
    },
    page,
    limit
  }
})
