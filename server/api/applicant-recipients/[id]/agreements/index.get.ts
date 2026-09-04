import { authorizeWithFreshAuthContext, requireFreshAuthContext, type AuthContext } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import { resolveAgreementPageMutationPermissions, resolveAgreementVisibility } from '~~/server/utils/agreement'
import { assertApplicantRecipientProfileExists } from '~~/server/utils/applicant-recipient-child-resources'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema } from '~~/shared/types/schemas'
import { resolveApplicantRecipientAuthorization } from '~~/server/utils/applicant-recipient-auth'
import type { Database } from '~~/shared/types/database'
import type { Transaction } from 'kysely'

// eslint-disable-next-line local/require-authorize -- fresh authorization is performed inside the repeatable-read transaction.
export default defineEventHandler(async event => {
  const database = event.context.$db
  const applicantRecipientId = getRouterParam(event, 'id')

  if (!applicantRecipientId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  /** Reads the list and its authorization projection from one database snapshot.
   * @param db - Active repeatable-read transaction.
   * @param freshContext - Authentication and abilities loaded in that transaction.
   * @returns Paginated visible Agreements with mutation affordances.
   */
  const read = async (db: Transaction<Database>, freshContext: AuthContext) => {
    await authorizeWithFreshAuthContext(event, freshContext, 'applicant_recipient', 'read', async ({ context }) =>
      await resolveApplicantRecipientAuthorization(context, applicantRecipientId, 'read', db)
    )

    const profile = await assertApplicantRecipientProfileExists(event, applicantRecipientId, db)
    if (!profile || typeof profile !== 'object' || !('id' in profile)) {
      return profile
    }

    const { data: visibility } = await authorizeWithFreshAuthContext(event, freshContext, 'agreement', 'read', async ({ context }) => {
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

    const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
    const offset = (page - 1) * limit
    const escapedSearch = search ? escapeLikePattern(search) : ''

    let baseQuery = db
      .selectFrom('Funding_Case_Agreement_Applicant_Recipient')
      .innerJoin(
        'Funding_Case_Agreement_Profile',
        'Funding_Case_Agreement_Profile.id',
        'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_fundingagreement'
      )
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
      .where('Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient', '=', applicantRecipientId)
      .where('Funding_Case_Agreement_Applicant_Recipient._deleted', '=', false)
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
          'Agency_Agreement_Type.egcs_ay_name_fr as agreement_subtype_name_fr'
        ])
        .orderBy('Funding_Case_Agreement_Profile.id', 'asc')
        .limit(limit)
        .offset(offset)
        .execute(),
      baseQuery.select(eb => eb.fn.count('Funding_Case_Agreement_Profile.id').as('total')).executeTakeFirst()
    ])

    const permissions = await resolveAgreementPageMutationPermissions(freshContext, items.map(item => ({
      agreementId: String(item.id),
      agencyId: String(item.agency_id),
      programId: String(item.program_id),
      streamId: String(item.egcs_fc_transferpaymentstream)
    })), db)
    const itemsWithPermissions = items.map(item => {
      const itemPermissions = permissions.get(String(item.id))

      return {
        ...item,
        can_update: itemPermissions?.canUpdate === true,
        can_delete: itemPermissions?.canDelete === true
      }
    })

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
  }

  return await database.transaction().setIsolationLevel('repeatable read').execute(async trx =>
    await read(trx, await requireFreshAuthContext(event, trx)))
})
