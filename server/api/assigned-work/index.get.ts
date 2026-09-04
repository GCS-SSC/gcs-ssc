import { sql, type RawBuilder } from 'kysely'
import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { notFound } from '~~/server/utils/api-errors'
import { AssignedWorkQuerySchema } from '~~/shared/types/schemas'
import type { AssignableEntityType } from '~~/shared/types/database'
import {
  ASSIGNABLE_ENGINE_OPEN_QUEUE_STATUSES,
  ENTITY_AUTHORIZATION_POLICIES,
  ASSIGNED_WORK_ENGINE_STATUS_SEARCH_LABELS,
  buildAssignedWorkRoute
} from '~~/shared/utils/entity-assignments'
import { WORKFLOW_TARGET_ENTITY_TYPE_ENUM } from '~~/shared/constants/enums'

type AssignedWorkRow = {
  entity_id: string
  entity_type: AssignableEntityType
  status: string
  identifier_en: string
  identifier_fr: string
  agreement_id: string | null
  variant: string | null
  is_primary: boolean
  isCompleted: boolean
  total_count: number
}

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const query = await getValidatedQueryI18n(event, AssignedWorkQuerySchema)
  return await event.context.$db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    const commonUser = await resolveCurrentCommonUser(event, trx)
    if (!commonUser) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const actor = { auth, commonUserId: commonUser.id }
    const readGrants = actor.auth.userAbilities.getGrants().filter(grant => grant.action === 'read')
    const authorizationPredicates: RawBuilder<unknown>[] = readGrants.map(grant => {
      if (grant.scope.type === 'global') return sql`work.owner_subject = ${grant.subject}`
      if (grant.scope.type === 'agency') {
        return sql`work.owner_subject = ${grant.subject} AND work.agency_id = ${grant.scope.agencyId}::bigint`
      }
      return sql`work.owner_subject = ${grant.subject} AND work.agency_id = ${grant.scope.agencyId}::bigint
      AND work.program_id = ${grant.scope.transferPaymentId}::bigint`
    })
    if (authorizationPredicates.length === 0) {
      return { items: [], page: query.page, limit: query.limit, total: 0 }
    }
    const search = `%${query.search ?? ''}%`
    const normalizedSearch = query.search?.trim().toLocaleLowerCase() ?? ''
    const matchesSearch = (labels: readonly string[]): boolean => labels.some(label =>
      label.toLocaleLowerCase().includes(normalizedSearch)
    )
    const matchingEntityTypes = Object.entries(ENTITY_AUTHORIZATION_POLICIES)
      .filter(([, metadata]) => normalizedSearch.length > 0 && matchesSearch(metadata.searchLabels))
      .map(([entityType]) => entityType)
    const matchingStatuses = Object.entries(ASSIGNED_WORK_ENGINE_STATUS_SEARCH_LABELS)
      .filter(([, labels]) => normalizedSearch.length > 0 && matchesSearch(labels))
      .map(([status]) => status)
    const localizedLabelPredicates = []
    if (matchingEntityTypes.length > 0) {
      localizedLabelPredicates.push(sql`work.entity_type IN (${sql.join(matchingEntityTypes)})`)
    }
    if (matchingStatuses.length > 0) {
      localizedLabelPredicates.push(sql`work.status IN (${sql.join(matchingStatuses)})`)
    }
    let localizedLabelPredicate = sql`FALSE`
    if (localizedLabelPredicates.length > 0) {
      localizedLabelPredicate = sql`(${sql.join(localizedLabelPredicates, sql` OR `)})`
    }
    const businessEntityTypes = [...WORKFLOW_TARGET_ENTITY_TYPE_ENUM]
    const offset = (query.page - 1) * query.limit
    /**
   * Executes one authorized queue page.
   * @param limit Maximum rows to return.
   * @param pageOffset Rows to skip.
   * @returns Query result containing the page and its full filtered count.
   */
    const executePage = async (limit: number, pageOffset: number) => await sql<AssignedWorkRow>`
    WITH base_work AS (
      SELECT profile.id, 'applicantrecipient'::text entity_type,
        CASE WHEN profile.egcs_ar_active THEN 'active' ELSE 'inactive' END status,
        COALESCE(profile.egcs_ar_legalname_en, profile.egcs_ar_operatingname_en, profile.id::text) identifier_en,
        COALESCE(profile.egcs_ar_legalname_fr, profile.egcs_ar_operatingname_fr, profile.id::text) identifier_fr,
        NULL::bigint agreement_id, NULL::text variant, 'applicant_recipient'::text owner_subject,
        profile.egcs_ar_leadagency agency_id, NULL::bigint program_id
      FROM "Applicant_Recipient_Profile" profile
      JOIN "Agency_Profile" agency ON agency.id = profile.egcs_ar_leadagency AND agency._deleted = false
      WHERE profile._deleted = false
      UNION ALL
      SELECT agreement.id, 'fundingcaseagreement', agreement.egcs_fc_status::text,
        agreement.egcs_fc_title_en, agreement.egcs_fc_title_fr, agreement.id, NULL::text,
        'agreement', program.egcs_tp_agency, program.id
      FROM "Funding_Case_Agreement_Profile" agreement
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND stream._deleted = false
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      WHERE agreement._deleted = false
      UNION ALL
      SELECT claim.id, 'fundingcaseagreementclaim'::text entity_type, claim.egcs_fc_status::text status,
        ('#' || claim.id::text) identifier_en, ('#' || claim.id::text) identifier_fr,
        claim.egcs_fc_fundingagreement agreement_id, NULL::text variant,
        'agreement', program.egcs_tp_agency, program.id
      FROM "Funding_Case_Agreement_Claim" claim
      JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = claim.egcs_fc_fundingagreement AND agreement._deleted = false
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND stream._deleted = false
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      WHERE claim._deleted = false
      UNION ALL
      SELECT reconcile.id, 'fundingclaimreconcile', reconcile.egcs_fc_status::text, '#' || reconcile.id::text,
        '#' || reconcile.id::text, claim.egcs_fc_fundingagreement, NULL::text,
        'agreement', program.egcs_tp_agency, program.id
      FROM "Funding_Case_Agreement_Claim_Reconcile" reconcile
      JOIN "Funding_Case_Agreement_Claim" claim ON claim.id = reconcile.egcs_fc_fundingagreementclaim AND claim._deleted = false
      JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = claim.egcs_fc_fundingagreement AND agreement._deleted = false
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND stream._deleted = false
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      WHERE reconcile._deleted = false
      UNION ALL
      SELECT child.id, child.entity_type, child.status, '#' || child.id::text, '#' || child.id::text,
        child.agreement_id, NULL::text, 'agreement', program.egcs_tp_agency, program.id
      FROM (
        SELECT payment.id, 'fundingcasepayment'::text entity_type, payment.egcs_fc_status::text status,
          payment.egcs_fc_fundingagreement agreement_id, payment._deleted FROM "Funding_Case_Agreement_Payment" payment
        UNION ALL SELECT forecast.id, 'fundingcaseforecast', forecast.egcs_fc_status::text,
          forecast.egcs_fc_fundingagreement, forecast._deleted FROM "Funding_Case_Agreement_Forecast" forecast
        UNION ALL SELECT monitor.id, 'fundingcasemonitor', monitor.egcs_fc_status::text,
          monitor.egcs_fc_fundingagreement, monitor._deleted FROM "Funding_Case_Agreement_Monitor" monitor
        UNION ALL SELECT commitment.id, 'fundingcaseagreementcommitment', commitment.egcs_fc_status::text,
          commitment.egcs_fc_fundingagreement, commitment._deleted FROM "Funding_Case_Agreement_Commitment" commitment
        UNION ALL SELECT closeout.id, 'fundingcaseagreementcloseout', closeout.egcs_fc_status::text,
          closeout.egcs_fc_fundingagreement, closeout._deleted FROM "Funding_Case_Agreement_Closeout" closeout
      ) child
      JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = child.agreement_id AND agreement._deleted = false
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND stream._deleted = false
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      WHERE child._deleted = false
      UNION ALL
      SELECT amendment.id, 'fundingcaseamendment', amendment.egcs_fc_status::text,
        amendment.egcs_fc_name_en, amendment.egcs_fc_name_fr, amendment.egcs_fc_fundingagreement,
        NULL::text, 'agreement', program.egcs_tp_agency, program.id
      FROM "Funding_Case_Agreement_Amendment" amendment
      JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = amendment.egcs_fc_fundingagreement AND agreement._deleted = false
      JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND stream._deleted = false
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      WHERE amendment._deleted = false
    ), review_work AS (
      SELECT review.id, 'commonreview'::text entity_type, runtime_item.egcs_cn_state::text status,
        '#' || review.id::text identifier_en, '#' || review.id::text identifier_fr, source.agreement_id,
        CASE WHEN checklist.id IS NULL THEN 'assessment' ELSE 'checklist' END variant,
        COALESCE(source.owner_subject, CASE WHEN stream.id IS NOT NULL THEN 'transfer_payment' ELSE 'agency' END) owner_subject,
        COALESCE(source.agency_id, program.egcs_tp_agency, schema.egcs_cn_agency) agency_id,
        COALESCE(source.program_id, program.id) program_id
      FROM "Common_Review" review
      JOIN "Common_Runtime_Item" runtime_item ON runtime_item.id = review.egcs_cn_runtimeitem
      JOIN "Common_Review_Set" review_set ON review_set.id = review.egcs_cn_reviewset AND review_set._deleted = false
      JOIN "Common_Review_Schema" schema ON schema.id = review.egcs_cn_reviewschema AND schema._deleted = false
      LEFT JOIN base_work source ON source.id = review_set.egcs_cn_entityid
        AND source.entity_type = review_set.egcs_cn_entitytype::text
      LEFT JOIN "Transfer_Payment_Stream" stream ON review_set.egcs_cn_entitytype::text = 'transferpaymentstream'
        AND stream.id = review_set.egcs_cn_entityid AND stream._deleted = false
      LEFT JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      LEFT JOIN "Common_Checklist" checklist ON checklist.egcs_cn_review = review.id AND checklist._deleted = false
      WHERE review._deleted = false AND (source.id IS NOT NULL OR stream.id IS NOT NULL OR schema.egcs_cn_agency IS NOT NULL)
    ), source_work AS (
      SELECT * FROM base_work UNION ALL SELECT * FROM review_work
    ), recommendation_work AS (
      SELECT recommendation.id, 'commonrecommendation'::text entity_type, runtime_item.egcs_cn_state::text status,
        '#' || recommendation.id::text identifier_en, '#' || recommendation.id::text identifier_fr,
        source.agreement_id, NULL::text variant,
        COALESCE(source.owner_subject, CASE WHEN stream.id IS NOT NULL THEN 'transfer_payment' ELSE 'agency' END) owner_subject,
        COALESCE(source.agency_id, program.egcs_tp_agency, schema.egcs_cn_agency) agency_id,
        COALESCE(source.program_id, program.id) program_id
      FROM "Common_Recommendation" recommendation
      JOIN "Common_Runtime_Item" runtime_item ON runtime_item.id = recommendation.egcs_cn_runtimeitem
      JOIN "Common_Recommendation_Schema" schema
        ON schema.id = runtime_item.egcs_cn_publication AND schema._deleted = false
      LEFT JOIN source_work source ON source.id = recommendation.egcs_cn_entityid
        AND source.entity_type = recommendation.egcs_cn_entitytype::text
      LEFT JOIN "Transfer_Payment_Stream" stream ON recommendation.egcs_cn_entitytype::text = 'transferpaymentstream'
        AND stream.id = recommendation.egcs_cn_entityid AND stream._deleted = false
      LEFT JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
      WHERE recommendation._deleted = false
        AND (source.id IS NOT NULL OR stream.id IS NOT NULL OR schema.egcs_cn_agency IS NOT NULL)
    ), work AS (
      SELECT * FROM source_work UNION ALL SELECT * FROM recommendation_work
    )
    SELECT work.id::text entity_id, work.entity_type, work.status, work.identifier_en, work.identifier_fr,
      work.agreement_id::text agreement_id, work.variant, assignment.egcs_cn_isprimary is_primary,
      (completion.id IS NOT NULL) AS "isCompleted",
      count(*) OVER ()::int total_count
    FROM work JOIN "Common_Entity_Assignment" assignment
      ON assignment.egcs_cn_entityid = work.id AND assignment.egcs_cn_entitytype::text = work.entity_type
    LEFT JOIN "Common_Status" business_status
      ON business_status.id::text = work.status
      AND work.entity_type IN (${sql.join(businessEntityTypes)})
    LEFT JOIN "Common_Completion" completion
      ON completion.egcs_cn_entityid = work.id
      AND completion.egcs_cn_entitytype::text = work.entity_type
      AND completion._deleted = false
    WHERE assignment.egcs_cn_user = ${actor.commonUserId}::bigint AND assignment._deleted = false
      AND (${sql.join(authorizationPredicates, sql` OR `)})
      AND (
        (work.entity_type = 'applicantrecipient' AND work.status = 'active')
        OR (work.entity_type = 'commonreview' AND work.status IN (${sql.join([...ASSIGNABLE_ENGINE_OPEN_QUEUE_STATUSES.commonreview])}))
        OR (work.entity_type = 'commonrecommendation' AND work.status IN (${sql.join([...ASSIGNABLE_ENGINE_OPEN_QUEUE_STATUSES.commonrecommendation])}))
        OR (
          work.entity_type IN (${sql.join(businessEntityTypes)})
          AND business_status.id IS NOT NULL
          AND business_status._deleted = false
          AND business_status.egcs_cn_readonly = false
          AND business_status.egcs_cn_terminal = false
          AND completion.id IS NULL
        )
      )
      AND (${query.entityType ?? null}::text IS NULL OR work.entity_type = ${query.entityType ?? null}::text)
      AND (
        work.identifier_en ILIKE ${search}
        OR work.identifier_fr ILIKE ${search}
        OR work.entity_type ILIKE ${search}
        OR work.status ILIKE ${search}
        OR business_status.egcs_cn_name_en ILIKE ${search}
        OR business_status.egcs_cn_name_fr ILIKE ${search}
        OR ${localizedLabelPredicate}
      )
    ORDER BY assignment.egcs_cn_isprimary DESC, work.entity_type, work.id
    LIMIT ${limit} OFFSET ${pageOffset}
  `.execute(trx)
    const result = await executePage(query.limit, offset)
    const countProbe = result.rows.length === 0 && offset > 0 ? await executePage(1, 0) : null
    const total = result.rows[0]?.total_count ?? countProbe?.rows[0]?.total_count ?? 0
    const items = result.rows.map(({ total_count: _totalCount, ...row }) => ({
      ...row,
      url: buildAssignedWorkRoute(row.entity_type, row.entity_id, row.agreement_id, row.variant)
    }))
    return { items, page: query.page, limit: query.limit, total }
  })
})
