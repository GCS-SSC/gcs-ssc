import { sql, type RawBuilder } from 'kysely'
import { z } from 'zod'
import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PaginationSchema } from '~~/shared/types/schemas'

const Query = PaginationSchema.extend({ view: z.enum(['available', 'mine']) })
type GroupWorkRow = {
  kind: 'review' | 'additional_reviewer' | 'approval' | 'intake'
  id: string
  review_id: string | null
  entity_type: string
  entity_id: string
  variant: 'checklist' | 'assessment' | null
  group_id: string
  name_en: string
  name_fr: string
  detail_name_en: string | null
  detail_name_fr: string | null
  parent_en: string | null
  parent_fr: string | null
  group_name_en: string
  group_name_fr: string
  agreement_id: string | null
  claimed_by: string | null
  total_count: number
}

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const query = await getValidatedQueryI18n(event, Query)
  return await event.context.$db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    const actor = await resolveCurrentCommonUser(event, trx)
    if (!actor) return { items: [], page: query.page, limit: query.limit, total: 0, has_membership: false }
    const membership = await trx.selectFrom('Common_Group_Member as member')
      .innerJoin('Common_Group as grp', 'grp.id', 'member.egcs_cn_group')
      .select('member.id')
      .where('member.egcs_cn_user', '=', actor.id)
      .where('member._deleted', '=', false)
      .where('grp._deleted', '=', false)
      .executeTakeFirst()
    const hasMembership = Boolean(membership)
    if (query.view === 'available' && !hasMembership) {
      return { items: [], page: query.page, limit: query.limit, total: 0, has_membership: false }
    }
    const readGrants = auth.userAbilities.getGrants().filter(grant => grant.action === 'read')
    /**
     * Builds the parent read predicate for one authorization subject.
     * @param subject Authorization subject.
     * @param agencyColumn SQL reference to the parent Agency.
     * @param programColumn SQL reference to the parent Program.
     * @returns Scoped read predicate.
     */
    const scopedRead = (subject: string, agencyColumn: string, programColumn: string): RawBuilder<boolean> => {
      const predicates = readGrants.filter(grant => grant.subject === subject).map(grant => {
        if (grant.scope.type === 'global') return sql`TRUE`
        if (grant.scope.type === 'agency') return sql`${sql.ref(agencyColumn)} = ${grant.scope.agencyId}::bigint`
        return sql`${sql.ref(agencyColumn)} = ${grant.scope.agencyId}::bigint
          AND ${sql.ref(programColumn)} = ${grant.scope.transferPaymentId}::bigint`
      })
      return predicates.length > 0 ? sql<boolean>`(${sql.join(predicates, sql` OR `)})` : sql<boolean>`FALSE`
    }
    const agreementRead = scopedRead('agreement', 'agreement_program.egcs_tp_agency', 'agreement_program.id')
    const proponentRead = readGrants.some(grant => grant.subject === 'applicant_recipient')
    const streamRead = scopedRead('transfer_payment', 'stream_program.egcs_tp_agency', 'stream_program.id')
    const intakeRead = scopedRead('funding_case', 'intake_program.egcs_tp_agency', 'intake_program.id')
    const agencyRead = scopedRead('agency', 'review_agency.id', 'review_agency.id')
    const work = await sql<GroupWorkRow>`
      WITH active_membership AS (
        SELECT member.egcs_cn_group FROM "Common_Group_Member" member
        JOIN "Common_Group" grp ON grp.id = member.egcs_cn_group AND grp._deleted = false
        WHERE member.egcs_cn_user = ${actor.id}::bigint AND member._deleted = false
      ), work AS (
        SELECT 'review'::text kind, review.id, review.id review_id, 'commonreview'::text entity_type, review.id entity_id,
          CASE WHEN EXISTS (SELECT 1 FROM "Common_Checklist" checklist WHERE checklist.egcs_cn_review = review.id AND checklist._deleted = false)
            THEN 'checklist' ELSE 'assessment' END::text variant,
          review.egcs_cn_group group_id, review.egcs_cn_groupclaimedby claimed_by,
          ('#' || review.id::text) name_en, ('#' || review.id::text) name_fr
        FROM "Common_Review" review
        JOIN "Common_Runtime_Item" item ON item.id = review.egcs_cn_runtimeitem
        WHERE review._deleted = false AND review.egcs_cn_group IS NOT NULL
          AND item.egcs_cn_state IN ('active', 'awaiting_action')
        UNION ALL
        SELECT 'additional_reviewer', reviewer.id, reviewer.egcs_cn_entityid, 'commonreview', reviewer.egcs_cn_entityid,
          CASE WHEN EXISTS (SELECT 1 FROM "Common_Checklist" checklist WHERE checklist.egcs_cn_review = reviewer.egcs_cn_entityid AND checklist._deleted = false)
            THEN 'checklist' ELSE 'assessment' END,
          reviewer.egcs_cn_group, reviewer.egcs_cn_user,
          ('#' || reviewer.egcs_cn_entityid::text), ('#' || reviewer.egcs_cn_entityid::text)
        FROM "Common_Additional_Reviewers" reviewer
        JOIN "Common_Review" review ON review.id = reviewer.egcs_cn_entityid AND review._deleted = false
        JOIN "Common_Runtime_Item" item ON item.id = review.egcs_cn_runtimeitem
        WHERE reviewer._deleted = false AND reviewer.egcs_cn_group IS NOT NULL
          AND reviewer.egcs_cn_completedat IS NULL AND item.egcs_cn_state IN ('active', 'awaiting_action')
        UNION ALL
        SELECT 'approval', approval.id,
          CASE WHEN slip.egcs_cn_entitytype = 'commonreview' THEN slip.egcs_cn_entityid ELSE NULL END,
          slip.egcs_cn_entitytype, slip.egcs_cn_entityid,
          CASE WHEN slip.egcs_cn_entitytype = 'commonreview' THEN
            CASE WHEN EXISTS (SELECT 1 FROM "Common_Checklist" checklist
              WHERE checklist.egcs_cn_review = slip.egcs_cn_entityid AND checklist._deleted = false)
              THEN 'checklist' ELSE 'assessment' END ELSE NULL END,
          approval.egcs_cn_assignedgroup, approval.egcs_cn_assigneduser,
          approval.egcs_cn_name_en, approval.egcs_cn_name_fr
        FROM "Common_Approval" approval
        JOIN "Common_Routing_Slip" slip ON slip.id = approval.egcs_cn_routingslip AND slip._deleted = false
        JOIN "Common_Runtime_Item" item ON item.id = approval.egcs_cn_runtimeitem
        WHERE approval.egcs_cn_assignedgroup IS NOT NULL AND approval.egcs_cn_approvalvalue IS NULL
          AND item.egcs_cn_state = 'awaiting_action'
        UNION ALL
        SELECT 'intake', intake.id, NULL, 'fundingcaseintake', intake.id, NULL,
          intake.egcs_fi_group, intake.egcs_fi_groupclaimedby,
          intake.egcs_fi_applicationid::text, intake.egcs_fi_applicationid::text
        FROM "Funding_Case_Intake_Profile" intake
        JOIN "Common_Status" status ON status.id = intake.egcs_fi_status AND status._deleted = false
        WHERE intake._deleted = false AND intake.egcs_fi_group IS NOT NULL
          AND status.egcs_cn_readonly = false AND status.egcs_cn_terminal = false
          AND NOT EXISTS (SELECT 1 FROM "Common_Completion" completion
            WHERE completion.egcs_cn_entitytype = 'fundingcaseintake'
              AND completion.egcs_cn_entityid = intake.id AND completion._deleted = false)
      )
      SELECT work.*, grp.egcs_cn_name_en group_name_en, grp.egcs_cn_name_fr group_name_fr,
        CASE WHEN work.kind IN ('approval', 'intake') THEN work.name_en ELSE review_schema.egcs_cn_name_en END detail_name_en,
        CASE WHEN work.kind IN ('approval', 'intake') THEN work.name_fr ELSE review_schema.egcs_cn_name_fr END detail_name_fr,
        COALESCE(
          CASE WHEN ${agreementRead} THEN to_jsonb(agreement)->>'egcs_fc_agreementnumber' END,
          CASE WHEN ${proponentRead} AND proponent.id IS NOT NULL THEN COALESCE(
            to_jsonb(proponent)->>'egcs_ar_legalname_en', to_jsonb(proponent)->>'egcs_ar_operatingname_en',
            to_jsonb(proponent)->>'egcs_ar_legalname_fr', to_jsonb(proponent)->>'egcs_ar_operatingname_fr', '#' || proponent.id::text) END,
          CASE WHEN ${streamRead} THEN to_jsonb(stream)->>'egcs_tp_name_en' END,
          CASE WHEN ${intakeRead} THEN to_jsonb(intake_opportunity)->>'egcs_fo_name_en' END,
          CASE WHEN agreement.id IS NULL AND proponent.id IS NULL AND stream.id IS NULL
            AND ${agencyRead} THEN to_jsonb(review_agency)->>'egcs_ay_name_en' END) parent_en,
        COALESCE(
          CASE WHEN ${agreementRead} THEN to_jsonb(agreement)->>'egcs_fc_agreementnumber' END,
          CASE WHEN ${proponentRead} AND proponent.id IS NOT NULL THEN COALESCE(
            to_jsonb(proponent)->>'egcs_ar_legalname_fr', to_jsonb(proponent)->>'egcs_ar_operatingname_fr',
            to_jsonb(proponent)->>'egcs_ar_legalname_en', to_jsonb(proponent)->>'egcs_ar_operatingname_en', '#' || proponent.id::text) END,
          CASE WHEN ${streamRead} THEN to_jsonb(stream)->>'egcs_tp_name_fr' END,
          CASE WHEN ${intakeRead} THEN to_jsonb(intake_opportunity)->>'egcs_fo_name_fr' END,
          CASE WHEN agreement.id IS NULL AND proponent.id IS NULL AND stream.id IS NULL
            AND ${agencyRead} THEN to_jsonb(review_agency)->>'egcs_ay_name_fr' END) parent_fr,
        CASE
          WHEN work.entity_type = 'fundingcaseagreement' THEN work.entity_id
          WHEN work.entity_type = 'fundingcaseagreementclaim' THEN (SELECT egcs_fc_fundingagreement FROM "Funding_Case_Agreement_Claim" WHERE id = work.entity_id)
          WHEN work.entity_type = 'fundingcasepayment' THEN (SELECT egcs_fc_fundingagreement FROM "Funding_Case_Agreement_Payment" WHERE id = work.entity_id)
          WHEN work.entity_type = 'fundingcaseforecast' THEN (SELECT egcs_fc_fundingagreement FROM "Funding_Case_Agreement_Forecast" WHERE id = work.entity_id)
          WHEN work.entity_type = 'fundingcasemonitor' THEN (SELECT egcs_fc_fundingagreement FROM "Funding_Case_Agreement_Monitor" WHERE id = work.entity_id)
          WHEN work.entity_type = 'fundingcaseagreementcommitment' THEN (SELECT egcs_fc_fundingagreement FROM "Funding_Case_Agreement_Commitment" WHERE id = work.entity_id)
          WHEN work.entity_type = 'fundingcaseagreementcloseout' THEN (SELECT egcs_fc_fundingagreement FROM "Funding_Case_Agreement_Closeout" WHERE id = work.entity_id)
          WHEN work.entity_type = 'fundingcaseamendment' THEN (SELECT egcs_fc_fundingagreement FROM "Funding_Case_Agreement_Amendment" WHERE id = work.entity_id)
          ELSE NULL
        END agreement_id,
        count(*) OVER()::integer total_count
      FROM work LEFT JOIN active_membership member ON member.egcs_cn_group = work.group_id
      JOIN "Common_Group" grp ON grp.id = work.group_id
      LEFT JOIN "Common_Recommendation" approval_recommendation ON approval_recommendation.id = work.entity_id
        AND work.kind = 'approval' AND work.entity_type = 'commonrecommendation'
      LEFT JOIN LATERAL (SELECT
        CASE WHEN approval_recommendation.id IS NOT NULL THEN approval_recommendation.egcs_cn_entitytype::text ELSE work.entity_type END entity_type,
        CASE WHEN approval_recommendation.id IS NOT NULL THEN approval_recommendation.egcs_cn_entityid ELSE work.entity_id END entity_id
      ) target ON TRUE
      LEFT JOIN "Common_Review" source_review ON source_review.id = COALESCE(work.review_id,
        CASE WHEN target.entity_type = 'commonreview' THEN target.entity_id END)
      LEFT JOIN "Common_Review_Schema" review_schema ON review_schema.id = source_review.egcs_cn_reviewschema
      LEFT JOIN "Agency_Profile" review_agency ON review_agency.id = review_schema.egcs_cn_agency AND review_agency._deleted = false
      LEFT JOIN "Common_Review_Set" source_review_set ON source_review_set.id = source_review.egcs_cn_reviewset
      LEFT JOIN "Common_Extension_Entity_Owner" review_binding ON review_binding.egcs_cn_entityid = source_review_set.egcs_cn_entityid
        AND review_binding.egcs_cn_entitytype::text = source_review_set.egcs_cn_entitytype::text
      LEFT JOIN "Funding_Case_Agreement_Claim" review_claim ON review_claim.id = source_review_set.egcs_cn_entityid
        AND source_review_set.egcs_cn_entitytype::text = 'fundingcaseagreementclaim'
      LEFT JOIN "Funding_Case_Agreement_Claim_Reconcile" review_reconcile ON review_reconcile.id = source_review_set.egcs_cn_entityid
        AND source_review_set.egcs_cn_entitytype::text = 'fundingclaimreconcile'
      LEFT JOIN "Funding_Case_Agreement_Claim" reconciled_claim ON reconciled_claim.id = review_reconcile.egcs_fc_fundingagreementclaim
      LEFT JOIN "Funding_Case_Agreement_Payment" review_payment ON review_payment.id = source_review_set.egcs_cn_entityid
        AND source_review_set.egcs_cn_entitytype::text = 'fundingcasepayment'
      LEFT JOIN "Funding_Case_Agreement_Forecast" review_forecast ON review_forecast.id = source_review_set.egcs_cn_entityid
        AND source_review_set.egcs_cn_entitytype::text = 'fundingcaseforecast'
      LEFT JOIN "Funding_Case_Agreement_Monitor" review_monitor ON review_monitor.id = source_review_set.egcs_cn_entityid
        AND source_review_set.egcs_cn_entitytype::text = 'fundingcasemonitor'
      LEFT JOIN "Funding_Case_Agreement_Commitment" review_commitment ON review_commitment.id = source_review_set.egcs_cn_entityid
        AND source_review_set.egcs_cn_entitytype::text = 'fundingcaseagreementcommitment'
      LEFT JOIN "Funding_Case_Agreement_Amendment" review_amendment ON review_amendment.id = source_review_set.egcs_cn_entityid
        AND source_review_set.egcs_cn_entitytype::text = 'fundingcaseamendment'
      LEFT JOIN "Funding_Case_Agreement_Closeout" review_closeout ON review_closeout.id = source_review_set.egcs_cn_entityid
        AND source_review_set.egcs_cn_entitytype::text = 'fundingcaseagreementcloseout'
      LEFT JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = COALESCE(
        CASE WHEN target.entity_type = 'fundingcaseagreement' THEN target.entity_id END,
        CASE WHEN source_review_set.egcs_cn_entitytype::text = 'fundingcaseagreement' THEN source_review_set.egcs_cn_entityid END,
        CASE WHEN review_binding.egcs_cn_ownertype = 'fundingcaseagreement' THEN review_binding.egcs_cn_ownerid END,
        review_claim.egcs_fc_fundingagreement, reconciled_claim.egcs_fc_fundingagreement,
        review_payment.egcs_fc_fundingagreement, review_forecast.egcs_fc_fundingagreement,
        review_monitor.egcs_fc_fundingagreement, review_commitment.egcs_fc_fundingagreement,
        review_amendment.egcs_fc_fundingagreement, review_closeout.egcs_fc_fundingagreement,
        CASE WHEN target.entity_type = 'fundingcaseagreementclaim' THEN (SELECT egcs_fc_fundingagreement FROM "Funding_Case_Agreement_Claim" WHERE id = target.entity_id) END,
        CASE WHEN target.entity_type = 'fundingclaimreconcile' THEN (SELECT claim.egcs_fc_fundingagreement FROM "Funding_Case_Agreement_Claim_Reconcile" reconcile
          JOIN "Funding_Case_Agreement_Claim" claim ON claim.id = reconcile.egcs_fc_fundingagreementclaim WHERE reconcile.id = target.entity_id) END,
        CASE WHEN target.entity_type = 'fundingcasepayment' THEN (SELECT egcs_fc_fundingagreement FROM "Funding_Case_Agreement_Payment" WHERE id = target.entity_id) END,
        CASE WHEN target.entity_type = 'fundingcaseforecast' THEN (SELECT egcs_fc_fundingagreement FROM "Funding_Case_Agreement_Forecast" WHERE id = target.entity_id) END,
        CASE WHEN target.entity_type = 'fundingcasemonitor' THEN (SELECT egcs_fc_fundingagreement FROM "Funding_Case_Agreement_Monitor" WHERE id = target.entity_id) END,
        CASE WHEN target.entity_type = 'fundingcaseagreementcommitment' THEN (SELECT egcs_fc_fundingagreement FROM "Funding_Case_Agreement_Commitment" WHERE id = target.entity_id) END,
        CASE WHEN target.entity_type = 'fundingcaseagreementcloseout' THEN (SELECT egcs_fc_fundingagreement FROM "Funding_Case_Agreement_Closeout" WHERE id = target.entity_id) END,
        CASE WHEN target.entity_type = 'fundingcaseamendment' THEN (SELECT egcs_fc_fundingagreement FROM "Funding_Case_Agreement_Amendment" WHERE id = target.entity_id) END)
        AND agreement._deleted = false
      LEFT JOIN "Transfer_Payment_Stream" agreement_stream ON agreement_stream.id = agreement.egcs_fc_transferpaymentstream
        AND agreement_stream._deleted = false
      LEFT JOIN "Transfer_Payment_Profile" agreement_program ON agreement_program.id = agreement_stream.egcs_tp_transferpaymentprofile
        AND agreement_program._deleted = false
      LEFT JOIN "Applicant_Recipient_Profile" proponent ON proponent.id = CASE
        WHEN target.entity_type = 'applicantrecipient' THEN target.entity_id
        WHEN source_review_set.egcs_cn_entitytype::text = 'applicantrecipient' THEN source_review_set.egcs_cn_entityid
        WHEN review_binding.egcs_cn_ownertype = 'applicantrecipient' THEN review_binding.egcs_cn_ownerid END
        AND proponent._deleted = false
      LEFT JOIN "Transfer_Payment_Stream" stream ON stream.id = CASE
        WHEN target.entity_type = 'transferpaymentstream' THEN target.entity_id
        WHEN source_review_set.egcs_cn_entitytype::text = 'transferpaymentstream' THEN source_review_set.egcs_cn_entityid END
        AND stream._deleted = false
      LEFT JOIN "Transfer_Payment_Profile" stream_program ON stream_program.id = stream.egcs_tp_transferpaymentprofile
        AND stream_program._deleted = false
      LEFT JOIN "Funding_Case_Intake_Profile" intake_work ON intake_work.id = work.entity_id
        AND work.kind = 'intake' AND intake_work._deleted = false
      LEFT JOIN "Funding_Opportunity_Profile" intake_opportunity ON intake_opportunity.id = intake_work.egcs_fi_fundingopportunity
        AND intake_opportunity._deleted = false
      LEFT JOIN "Transfer_Payment_Stream" intake_stream ON intake_stream.id = intake_opportunity.egcs_fo_transferpaymentstream
        AND intake_stream._deleted = false
      LEFT JOIN "Transfer_Payment_Profile" intake_program ON intake_program.id = intake_stream.egcs_tp_transferpaymentprofile
        AND intake_program._deleted = false
      WHERE ((${query.view} = 'mine' AND work.claimed_by = ${actor.id}::bigint)
        OR (${query.view} = 'available' AND work.claimed_by IS NULL AND member.egcs_cn_group IS NOT NULL))
        AND (work.kind <> 'intake' OR ${intakeRead})
      ORDER BY work.kind, work.id
      LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
    `.execute(trx)
    return {
      items: work.rows.map(row => ({ ...row, id: String(row.id), entity_id: String(row.entity_id), review_id: row.review_id ? String(row.review_id) : null,
        group_id: String(row.group_id), claimed_by: row.claimed_by ? String(row.claimed_by) : null,
        agreement_id: row.agreement_id ? String(row.agreement_id) : null })),
      total: work.rows[0]?.total_count ?? 0, page: query.page, limit: query.limit,
      has_membership: hasMembership
    }
  })
})
