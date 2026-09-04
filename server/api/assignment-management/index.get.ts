import { sql, type RawBuilder } from 'kysely'
import { requireAuthContext } from '~~/server/utils/authorize'
import { AssignedWorkQuerySchema } from '~~/shared/types/schemas'
import type { AssignableEntityType } from '~~/shared/types/database'
import { WORKFLOW_TARGET_ENTITY_TYPE_ENUM } from '~~/shared/constants/enums'

type CandidateRow = {
  entity_id: string
  entity_type: AssignableEntityType
  stable_reference: string
  label_en: string
  label_fr: string
  status: string
  primary_assignee: string
  primary_eligible: boolean
  assignee_count: number
  agency_name_en: string
  agency_name_fr: string
  program_name_en: string | null
  program_name_fr: string | null
  isCompleted: boolean
  total_count: number
}

export default defineEventHandler(async event => {
  const query = await getValidatedQueryI18n(event, AssignedWorkQuerySchema)
  const context = await requireAuthContext(event)
  const managementGrants = context.userAbilities.getGrants()
    .filter(grant => grant.action === 'manage_assignments')

  const authorizationPredicates: RawBuilder<unknown>[] = managementGrants.flatMap(grant => {
    const subject = grant.subject === 'applicant_recipient'
      ? 'applicant_recipient'
      : grant.subject === 'agreement' ? 'agreement' : null
    if (!subject) return []
    if (grant.scope.type === 'global') return [sql`work.owner_subject = ${subject}`]
    if (grant.scope.type === 'agency') {
      return [sql`work.owner_subject = ${subject} AND work.agency_id = ${grant.scope.agencyId}::bigint`]
    }
    return [sql`work.owner_subject = ${subject} AND work.agency_id = ${grant.scope.agencyId}::bigint
      AND work.program_id = ${grant.scope.transferPaymentId}::bigint`]
  })

  if (authorizationPredicates.length === 0) {
    return { items: [], total: 0, stats: { total: 0, active: 0 }, page: query.page, limit: query.limit }
  }

  const offset = (query.page - 1) * query.limit
  const businessEntityTypes = [...WORKFLOW_TARGET_ENTITY_TYPE_ENUM]
  /**
   * Executes the authorization-filtered projection at one page boundary.
   * @param limit Maximum rows to return.
   * @param pageOffset Number of authorized rows to skip.
   * @returns The projected rows and windowed total.
   */
  const executePage = async (limit: number, pageOffset: number) => await sql<CandidateRow>`
    WITH base_work AS (
      SELECT profile.id, 'applicantrecipient'::text entity_type,
        CASE WHEN profile.egcs_ar_active THEN 'active' ELSE 'inactive' END status,
        profile.id::text stable_reference,
        COALESCE(profile.egcs_ar_legalname_en, profile.egcs_ar_operatingname_en, profile.id::text) label_en,
        COALESCE(profile.egcs_ar_legalname_fr, profile.egcs_ar_operatingname_fr, profile.id::text) label_fr,
        'applicant_recipient'::text owner_subject, profile.egcs_ar_leadagency agency_id, NULL::bigint program_id,
        agency.egcs_ay_name_en agency_name_en, agency.egcs_ay_name_fr agency_name_fr,
        NULL::varchar program_name_en, NULL::varchar program_name_fr
      FROM "Applicant_Recipient_Profile" profile
      JOIN "Agency_Profile" agency ON agency.id = profile.egcs_ar_leadagency AND agency._deleted = false
      WHERE profile._deleted = false
      UNION ALL
      SELECT agreement.id, 'fundingcaseagreement', agreement.egcs_fc_status::text,
        agreement.egcs_fc_agreementnumber, agreement.egcs_fc_title_en, agreement.egcs_fc_title_fr,
        'agreement', program.egcs_tp_agency, program.id,
        agency.egcs_ay_name_en, agency.egcs_ay_name_fr, program.egcs_tp_name_en, program.egcs_tp_name_fr
      FROM "Funding_Case_Agreement_Profile" agreement
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND stream._deleted = false
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      JOIN "Agency_Profile" agency ON agency.id = program.egcs_tp_agency AND agency._deleted = false
      WHERE agreement._deleted = false
      UNION ALL
      SELECT claim.id, 'fundingcaseagreementclaim', claim.egcs_fc_status::text, claim.id::text,
        '#' || claim.id::text, '#' || claim.id::text, 'agreement', program.egcs_tp_agency, program.id,
        agency.egcs_ay_name_en, agency.egcs_ay_name_fr, program.egcs_tp_name_en, program.egcs_tp_name_fr
      FROM "Funding_Case_Agreement_Claim" claim
      JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = claim.egcs_fc_fundingagreement AND agreement._deleted = false
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND stream._deleted = false
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      JOIN "Agency_Profile" agency ON agency.id = program.egcs_tp_agency AND agency._deleted = false
      WHERE claim._deleted = false
      UNION ALL
      SELECT reconcile.id, 'fundingclaimreconcile', reconcile.egcs_fc_status::text, reconcile.id::text,
        '#' || reconcile.id::text, '#' || reconcile.id::text, 'agreement', program.egcs_tp_agency, program.id,
        agency.egcs_ay_name_en, agency.egcs_ay_name_fr, program.egcs_tp_name_en, program.egcs_tp_name_fr
      FROM "Funding_Case_Agreement_Claim_Reconcile" reconcile
      JOIN "Funding_Case_Agreement_Claim" claim ON claim.id = reconcile.egcs_fc_fundingagreementclaim AND claim._deleted = false
      JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = claim.egcs_fc_fundingagreement AND agreement._deleted = false
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND stream._deleted = false
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      JOIN "Agency_Profile" agency ON agency.id = program.egcs_tp_agency AND agency._deleted = false
      WHERE reconcile._deleted = false
      UNION ALL
      SELECT payment.id, 'fundingcasepayment', payment.egcs_fc_status::text, payment.id::text,
        '#' || payment.id::text, '#' || payment.id::text, 'agreement', program.egcs_tp_agency, program.id,
        agency.egcs_ay_name_en, agency.egcs_ay_name_fr, program.egcs_tp_name_en, program.egcs_tp_name_fr
      FROM "Funding_Case_Agreement_Payment" payment
      JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = payment.egcs_fc_fundingagreement AND agreement._deleted = false
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND stream._deleted = false
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      JOIN "Agency_Profile" agency ON agency.id = program.egcs_tp_agency AND agency._deleted = false
      WHERE payment._deleted = false
      UNION ALL
      SELECT forecast.id, 'fundingcaseforecast', forecast.egcs_fc_status::text, forecast.id::text,
        '#' || forecast.id::text, '#' || forecast.id::text, 'agreement', program.egcs_tp_agency, program.id,
        agency.egcs_ay_name_en, agency.egcs_ay_name_fr, program.egcs_tp_name_en, program.egcs_tp_name_fr
      FROM "Funding_Case_Agreement_Forecast" forecast
      JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = forecast.egcs_fc_fundingagreement AND agreement._deleted = false
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND stream._deleted = false
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      JOIN "Agency_Profile" agency ON agency.id = program.egcs_tp_agency AND agency._deleted = false
      WHERE forecast._deleted = false
      UNION ALL
      SELECT monitor.id, 'fundingcasemonitor', monitor.egcs_fc_status::text, monitor.id::text,
        '#' || monitor.id::text, '#' || monitor.id::text, 'agreement', program.egcs_tp_agency, program.id,
        agency.egcs_ay_name_en, agency.egcs_ay_name_fr, program.egcs_tp_name_en, program.egcs_tp_name_fr
      FROM "Funding_Case_Agreement_Monitor" monitor
      JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = monitor.egcs_fc_fundingagreement AND agreement._deleted = false
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND stream._deleted = false
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      JOIN "Agency_Profile" agency ON agency.id = program.egcs_tp_agency AND agency._deleted = false
      WHERE monitor._deleted = false
      UNION ALL
      SELECT amendment.id, 'fundingcaseamendment', amendment.egcs_fc_status::text, amendment.id::text,
        COALESCE(amendment.egcs_fc_name_en, '#' || amendment.id::text), COALESCE(amendment.egcs_fc_name_fr, '#' || amendment.id::text),
        'agreement', program.egcs_tp_agency, program.id, agency.egcs_ay_name_en, agency.egcs_ay_name_fr,
        program.egcs_tp_name_en, program.egcs_tp_name_fr
      FROM "Funding_Case_Agreement_Amendment" amendment
      JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = amendment.egcs_fc_fundingagreement AND agreement._deleted = false
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND stream._deleted = false
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      JOIN "Agency_Profile" agency ON agency.id = program.egcs_tp_agency AND agency._deleted = false
      WHERE amendment._deleted = false
      UNION ALL
      SELECT commitment.id, 'fundingcaseagreementcommitment', commitment.egcs_fc_status::text, commitment.id::text,
        '#' || commitment.id::text, '#' || commitment.id::text, 'agreement', program.egcs_tp_agency, program.id,
        agency.egcs_ay_name_en, agency.egcs_ay_name_fr, program.egcs_tp_name_en, program.egcs_tp_name_fr
      FROM "Funding_Case_Agreement_Commitment" commitment
      JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = commitment.egcs_fc_fundingagreement AND agreement._deleted = false
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND stream._deleted = false
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      JOIN "Agency_Profile" agency ON agency.id = program.egcs_tp_agency AND agency._deleted = false
      WHERE commitment._deleted = false
      UNION ALL
      SELECT closeout.id, 'fundingcaseagreementcloseout', closeout.egcs_fc_status::text, closeout.id::text,
        'Closeout #' || closeout.egcs_fc_closeoutnumber::text, 'Clôture no ' || closeout.egcs_fc_closeoutnumber::text,
        'agreement', program.egcs_tp_agency, program.id, agency.egcs_ay_name_en, agency.egcs_ay_name_fr,
        program.egcs_tp_name_en, program.egcs_tp_name_fr
      FROM "Funding_Case_Agreement_Closeout" closeout
      JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = closeout.egcs_fc_fundingagreement AND agreement._deleted = false
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND stream._deleted = false
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      JOIN "Agency_Profile" agency ON agency.id = program.egcs_tp_agency AND agency._deleted = false
      WHERE closeout._deleted = false
    ), review_work AS (
      SELECT review.id, 'commonreview'::text entity_type, runtime_item.egcs_cn_state::text status, review.id::text stable_reference,
        '#' || review.id::text label_en, '#' || review.id::text label_fr, source.owner_subject, source.agency_id,
        source.program_id, source.agency_name_en, source.agency_name_fr, source.program_name_en, source.program_name_fr
      FROM "Common_Review" review
      JOIN "Common_Runtime_Item" runtime_item ON runtime_item.id = review.egcs_cn_runtimeitem
      JOIN "Common_Review_Set" review_set ON review_set.id = review.egcs_cn_reviewset AND review_set._deleted = false
      JOIN base_work source ON source.id = review_set.egcs_cn_entityid
        AND source.entity_type = review_set.egcs_cn_entitytype::text
      WHERE review._deleted = false
    ), source_work AS (
      SELECT * FROM base_work UNION ALL SELECT * FROM review_work
    ), recommendation_work AS (
      SELECT recommendation.id, 'commonrecommendation'::text entity_type, runtime_item.egcs_cn_state::text status,
        recommendation.id::text stable_reference, '#' || recommendation.id::text label_en,
        '#' || recommendation.id::text label_fr, source.owner_subject, source.agency_id, source.program_id,
        source.agency_name_en, source.agency_name_fr, source.program_name_en, source.program_name_fr
      FROM "Common_Recommendation" recommendation
      JOIN "Common_Runtime_Item" runtime_item ON runtime_item.id = recommendation.egcs_cn_runtimeitem
      JOIN source_work source ON source.id = recommendation.egcs_cn_entityid
        AND source.entity_type = recommendation.egcs_cn_entitytype::text
      WHERE recommendation._deleted = false
    ), work AS (
      SELECT * FROM source_work UNION ALL SELECT * FROM recommendation_work
    ), roster AS (
      SELECT work.id::text entity_id, work.entity_type, work.stable_reference, work.label_en, work.label_fr,
        work.status, work.owner_subject, work.agency_id, work.program_id, work.agency_name_en, work.agency_name_fr,
        work.program_name_en, work.program_name_fr, primary_user.egcs_cn_name primary_assignee,
        primary_user.egcs_cn_auth_user_id primary_auth_user_id, primary_user._deleted primary_deleted,
        count(assignment.id)::int assignee_count
      FROM work
      JOIN "Common_Entity_Assignment" assignment ON assignment.egcs_cn_entityid = work.id
        AND assignment.egcs_cn_entitytype::text = work.entity_type AND assignment._deleted = false
      JOIN "Common_Entity_Assignment" primary_assignment ON primary_assignment.egcs_cn_entityid = work.id
        AND primary_assignment.egcs_cn_entitytype::text = work.entity_type
        AND primary_assignment.egcs_cn_isprimary = true AND primary_assignment._deleted = false
      JOIN "Common_User" primary_user ON primary_user.id = primary_assignment.egcs_cn_user
      WHERE (${query.entityType ?? null}::text IS NULL OR work.entity_type = ${query.entityType ?? null})
        AND (${query.search ?? ''} = '' OR work.stable_reference ILIKE ${`%${query.search ?? ''}%`}
          OR work.label_en ILIKE ${`%${query.search ?? ''}%`} OR work.label_fr ILIKE ${`%${query.search ?? ''}%`}
          OR work.status ILIKE ${`%${query.search ?? ''}%`})
        AND (${sql.join(authorizationPredicates, sql` OR `)})
      GROUP BY work.id, work.entity_type, work.stable_reference, work.label_en, work.label_fr, work.status,
        work.owner_subject, work.agency_id, work.program_id, work.agency_name_en, work.agency_name_fr,
        work.program_name_en, work.program_name_fr, primary_user.id, primary_user.egcs_cn_name,
        primary_user.egcs_cn_auth_user_id, primary_user._deleted
    )
    SELECT roster.entity_id, roster.entity_type, roster.stable_reference, roster.label_en, roster.label_fr,
      roster.status, roster.primary_assignee, roster.assignee_count, roster.agency_name_en, roster.agency_name_fr,
      roster.program_name_en, roster.program_name_fr,
      CASE WHEN roster.entity_type IN (${sql.join(businessEntityTypes)}) THEN EXISTS (
        SELECT 1
        FROM "Common_Completion" completion
        WHERE completion.egcs_cn_entityid = roster.entity_id::bigint
          AND completion.egcs_cn_entitytype::text = roster.entity_type
          AND completion._deleted = false
      ) ELSE false END AS "isCompleted",
      (roster.primary_deleted = false AND EXISTS (
        SELECT 1
        FROM "user" application_user
        JOIN user_role_assignment assignment ON assignment.user_id = application_user.id AND assignment._deleted = false
        JOIN role assigned_role ON assigned_role.id = assignment.role_id AND assigned_role._deleted = false
        JOIN role_permission permission ON permission.role_id = assigned_role.id AND permission._deleted = false
          AND permission.subject = roster.owner_subject AND permission.access_level IN ('contributor', 'manager')
        WHERE application_user.id = roster.primary_auth_user_id AND application_user._deleted = false
          AND (
            assigned_role.agency_id IS NULL
            OR (assigned_role.agency_id = roster.agency_id AND (
              NOT EXISTS (
                SELECT 1 FROM role_transfer_payment_scope role_scope
                WHERE role_scope.role_id = assigned_role.id AND role_scope._deleted = false
              )
              OR (roster.program_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM role_transfer_payment_scope role_scope
                WHERE role_scope.role_id = assigned_role.id AND role_scope._deleted = false
                  AND role_scope.transfer_payment_profile_id = roster.program_id
              ))
            ))
          )
      )) primary_eligible,
      count(*) OVER ()::int total_count
    FROM roster
    ORDER BY roster.entity_type, roster.entity_id::bigint
    LIMIT ${limit} OFFSET ${pageOffset}
  `.execute(event.context.$db)

  const result = await executePage(query.limit, offset)
  const items = result.rows.map(({ total_count: _totalCount, ...row }) => row)
  const total = result.rows[0]?.total_count
    ?? (offset > 0 ? (await executePage(1, 0)).rows[0]?.total_count ?? 0 : 0)
  return { items, total, stats: { total, active: total }, page: query.page, limit: query.limit }
})
