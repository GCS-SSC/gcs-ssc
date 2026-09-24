import { sql } from 'kysely'
import { z } from 'zod'
import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PaginationSchema } from '~~/shared/types/schemas'

const Query = PaginationSchema.extend({ view: z.enum(['available', 'mine']) })
type GroupWorkRow = {
  kind: 'review' | 'additional_reviewer' | 'approval'
  id: string
  review_id: string | null
  entity_type: string
  entity_id: string
  variant: 'checklist' | 'assessment' | null
  group_id: string
  name_en: string
  name_fr: string
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
    await requireFreshAuthContext(event, trx)
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
          NULL, approval.egcs_cn_assignedgroup, approval.egcs_cn_assigneduser,
          approval.egcs_cn_name_en, approval.egcs_cn_name_fr
        FROM "Common_Approval" approval
        JOIN "Common_Routing_Slip" slip ON slip.id = approval.egcs_cn_routingslip AND slip._deleted = false
        JOIN "Common_Runtime_Item" item ON item.id = approval.egcs_cn_runtimeitem
        WHERE approval.egcs_cn_assignedgroup IS NOT NULL AND approval.egcs_cn_approvalvalue IS NULL
          AND item.egcs_cn_state = 'awaiting_action'
      )
      SELECT work.*, grp.egcs_cn_name_en group_name_en, grp.egcs_cn_name_fr group_name_fr,
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
      WHERE (${query.view} = 'mine' AND work.claimed_by = ${actor.id}::bigint)
        OR (${query.view} = 'available' AND work.claimed_by IS NULL AND member.egcs_cn_group IS NOT NULL)
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
