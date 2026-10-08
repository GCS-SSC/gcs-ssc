import { buildAssignedWorkExtensionSources } from '~~/server/utils/assigned-work-extension-sources'
import { sql, type Kysely, type RawBuilder } from 'kysely'
import type { H3Event } from 'h3'
import type { z } from 'zod'
import type { AuthContext } from '~~/server/utils/authorize'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { notFound } from '~~/server/utils/api-errors'
import type { AssignedWorkQuerySchema } from '~~/shared/types/schemas'
import type { AssignableEntityType, Database } from '~~/shared/types/database'
import {
  ASSIGNABLE_ENGINE_OPEN_QUEUE_STATUSES,
  ENTITY_AUTHORIZATION_POLICIES,
  ASSIGNED_WORK_ENGINE_STATUS_SEARCH_LABELS,
  buildAssignedWorkRoute
} from '~~/shared/utils/entity-assignments'
import { ASSIGNABLE_ENTITY_TYPE_ENUM, WORKFLOW_TARGET_ENTITY_TYPE_ENUM } from '~~/shared/constants/enums'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { creditMemoQueueAuthority } from '~~/server/utils/credit-memo-queue-authority'

type AssignedWorkRow = {
  entity_id: string
  entity_type: AssignableEntityType
  status: string
  identifier_en: string
  identifier_fr: string
  agreement_id: string | null
  proponent_id: string | null
  variant: string | null
  parent_en: string | null
  parent_fr: string | null
  secondary_en: string | null
  secondary_fr: string | null
  detail_name_en: string | null
  detail_name_fr: string | null
  detail_number: number | null
  claim_id: string | null
  fiscal_year: string | null
  period_start: number | null
  period_end: number | null
  payment_type: string | null
  is_primary: boolean
  isCompleted: boolean
  total_count: number
}

/**
 * Builds the existing queue read policy against a resolved work owner.
 * @param readGrants Fresh read grants for the current actor.
 * @returns Owner-scope SQL predicates against the work alias.
 */
export const buildAssignedWorkReadPredicates = (readGrants: ReturnType<AuthContext['userAbilities']['getGrants']>): RawBuilder<unknown>[] => {
  return readGrants.map(grant => {
    if (grant.subject === 'applicant_recipient') {
      if (grant.scope.type === 'global') return sql`work.owner_subject = 'applicant_recipient'`
      return sql`work.owner_subject = 'applicant_recipient' AND (
        work.entity_type = 'applicantrecipient' OR work.agency_id = ${grant.scope.agencyId}::bigint
      )`
    }
    if (grant.scope.type === 'global') return sql`work.owner_subject = ${grant.subject}`
    if (grant.scope.type === 'agency') {
      return sql`work.owner_subject = ${grant.subject} AND work.agency_id = ${grant.scope.agencyId}::bigint`
    }
    return sql`work.owner_subject = ${grant.subject} AND work.agency_id = ${grant.scope.agencyId}::bigint
    AND work.program_id = ${grant.scope.transferPaymentId}::bigint`
  })
}

/**
 * Applies the shared open-target policy without changing the dashboard's writable queue.
 * @param options Named lifecycle mode.
 * @param options.mode Dashboard keeps normal writable targets; palette includes unfinished read-only targets.
 * @returns Target eligibility predicate against the queue aliases.
 */
export const buildAssignedWorkOpenPredicate = (options: { mode: 'dashboard' | 'palette' }): RawBuilder<unknown> => sql`(
  (work.entity_type = 'applicantrecipient' AND work.status = 'active')
  OR (work.entity_type = 'commonreview' AND work.status IN (${sql.join([...ASSIGNABLE_ENGINE_OPEN_QUEUE_STATUSES.commonreview])}))
  OR (work.entity_type = 'commonrecommendation' AND work.status IN (${sql.join([...ASSIGNABLE_ENGINE_OPEN_QUEUE_STATUSES.commonrecommendation])}))
  OR (work.entity_type = 'commondatacollection' AND work.status IN (${sql.join([...ASSIGNABLE_ENGINE_OPEN_QUEUE_STATUSES.commondatacollection])}))
  OR (
    work.entity_type IN (${sql.join([...WORKFLOW_TARGET_ENTITY_TYPE_ENUM])})
    AND business_status.id IS NOT NULL
    AND business_status._deleted = false
    AND ${options.mode === 'dashboard' ? sql`business_status.egcs_cn_readonly = false` : sql`TRUE`}
    AND business_status.egcs_cn_terminal = false
    AND completion.id IS NULL
  )
)`

/**
 * Executes the dashboard's existing authorized pagination, ordering, and counts.
 * @param trx Repeatable-read transaction used by the dashboard.
 * @param event Authenticated request.
 * @param auth Fresh authorization snapshot inside this transaction.
 * @param query Existing dashboard filters and pagination.
 * @returns The unchanged dashboard page and full filtered count.
 */
export const queryAssignedWorkDashboard = async (
  trx: Kysely<Database>,
  event: H3Event,
  auth: AuthContext,
  query: z.infer<typeof AssignedWorkQuerySchema>
) => {
  const commonUser = await resolveCurrentCommonUser(event, trx)
  if (!commonUser) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const actor = { auth, commonUserId: commonUser.id }
  const readGrants = actor.auth.userAbilities.getGrants().filter(grant => grant.action === 'read')
  const authorizationPredicates = buildAssignedWorkReadPredicates(readGrants)
  if (authorizationPredicates.length === 0) {
    return { items: [], page: query.page, limit: query.limit, total: 0 }
  }
  const agreementReadPredicates = readGrants.filter(grant => grant.subject === 'agreement').map(grant => {
    if (grant.scope.type === 'global') return sql`TRUE`
    if (grant.scope.type === 'agency') return sql`work.agency_id = ${grant.scope.agencyId}::bigint`
    return sql`work.agency_id = ${grant.scope.agencyId}::bigint
      AND work.program_id = ${grant.scope.transferPaymentId}::bigint`
  })
  const correctionParentRead = agreementReadPredicates.length > 0
    ? sql`(${sql.join(agreementReadPredicates, sql` OR `)})`
    : sql`FALSE`
  const search = `%${escapeLikePattern(query.search ?? '')}%`
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
  // These sources have an explicit owner; a missing parent must not change their subject.
  const typedOwnerSources = [...ASSIGNABLE_ENTITY_TYPE_ENUM, 'transferpaymentstream']
  const qualifiedBindings = await buildAssignedWorkExtensionSources()
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
      COALESCE(profile.egcs_ar_legalname_en, profile.egcs_ar_operatingname_en,
        profile.egcs_ar_legalname_fr, profile.egcs_ar_operatingname_fr, profile.id::text) identifier_en,
      COALESCE(profile.egcs_ar_legalname_fr, profile.egcs_ar_operatingname_fr,
        profile.egcs_ar_legalname_en, profile.egcs_ar_operatingname_en, profile.id::text) identifier_fr,
      NULL::bigint agreement_id, NULL::text variant, 'applicant_recipient'::text owner_subject,
      profile.egcs_ar_leadagency agency_id, NULL::bigint program_id
    FROM "Applicant_Recipient_Profile" profile
    LEFT JOIN "Agency_Profile" agency ON agency.id = profile.egcs_ar_leadagency
    WHERE profile._deleted = false
    UNION ALL
    SELECT intake.id, 'fundingcaseintake', intake.egcs_fi_status::text,
      'Application #' || intake.id::text,
      'Demande no ' || intake.id::text,
      NULL::bigint, NULL::text, 'funding_case', program.egcs_tp_agency, program.id
    FROM "Funding_Case_Intake_Profile" intake
    JOIN "Funding_Opportunity_Profile" opportunity ON opportunity.id = intake.egcs_fi_fundingopportunity AND opportunity._deleted = false
    JOIN "Transfer_Payment_Stream" stream ON stream.id = opportunity.egcs_fo_transferpaymentstream AND stream._deleted = false
    JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
    JOIN "Agency_Profile" agency ON agency.id = program.egcs_tp_agency AND agency._deleted = false
    WHERE intake._deleted = false
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
    SELECT correction.id, 'fundingcasecorrection', correction.egcs_fc_status::text,
      correction.egcs_fc_agreementnumber || '-COR-' || correction.egcs_fc_number::text,
      correction.egcs_fc_agreementnumber || '-COR-' || correction.egcs_fc_number::text,
      correction.egcs_fc_fundingagreement, NULL::text, 'correction', program.egcs_tp_agency, program.id
    FROM "Funding_Case_Agreement_Correction" correction
    JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = correction.egcs_fc_fundingagreement AND agreement._deleted = false
    JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND stream._deleted = false
    JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
    WHERE correction._deleted = false
    UNION ALL
    SELECT item.id, 'fundingcaseaccountreceivable', item.egcs_fc_status::text,
      item.egcs_fc_agreementnumber || '-AR-' || item.egcs_fc_number::text,
      item.egcs_fc_agreementnumber || '-AR-' || item.egcs_fc_number::text,
      item.egcs_fc_fundingagreement, NULL::text, 'account_receivable', program.egcs_tp_agency, program.id
    FROM "Funding_Case_Agreement_Account_Receivable" item
    JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = item.egcs_fc_fundingagreement AND NOT agreement._deleted
    JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND NOT stream._deleted
    JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND NOT program._deleted
    WHERE NOT item._deleted
    UNION ALL
    SELECT item.id, 'fundingcaseaccountreceivablecreditmemo', item.egcs_fc_status::text,
      'CM-' || coalesce((SELECT recovery.id FROM "Funding_Case_Account_Receivable_Recovery" recovery
        WHERE recovery.egcs_fc_creditmemo=item.id AND NOT recovery._deleted ORDER BY recovery.id DESC LIMIT 1),item.id)::text,
      'CM-' || coalesce((SELECT recovery.id FROM "Funding_Case_Account_Receivable_Recovery" recovery
        WHERE recovery.egcs_fc_creditmemo=item.id AND NOT recovery._deleted ORDER BY recovery.id DESC LIMIT 1),item.id)::text,
      NULL::bigint, NULL::text, 'account_receivable', item.egcs_fc_agency, NULL::bigint
    FROM "Funding_Case_Account_Receivable_Credit_Memo" item
    JOIN "Agency_Profile" agency ON agency.id = item.egcs_fc_agency AND NOT agency._deleted
    JOIN "Applicant_Recipient_Profile" debtor ON debtor.id = item.egcs_fc_applicantrecipient AND NOT debtor._deleted
    WHERE NOT item._deleted
    UNION ALL
    SELECT child.id, child.entity_type, child.status, '#' || child.id::text, '#' || child.id::text,
      child.agreement_id, NULL::text, CASE WHEN child.entity_type = 'fundingcasejournalvoucher' THEN 'journal_voucher' ELSE 'agreement' END, program.egcs_tp_agency, program.id
    FROM (
      SELECT payment.id, 'fundingcasepayment'::text entity_type, payment.egcs_fc_status::text status,
        payment.egcs_fc_fundingagreement agreement_id, payment._deleted FROM "Funding_Case_Agreement_Payment" payment
      UNION ALL SELECT jv.id, 'fundingcasejournalvoucher', jv.egcs_fc_status::text,
        jv.egcs_fc_fundingagreement, jv._deleted FROM "Funding_Case_Agreement_Journal_Voucher" jv
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
  ), qualified_bindings AS (${qualifiedBindings}), source_owners AS (
    SELECT * FROM base_work
    UNION ALL
    SELECT binding.entity_id, binding.entity_type, owner.status, owner.identifier_en, owner.identifier_fr, owner.agreement_id, owner.variant, owner.owner_subject, binding.agency_id, owner.program_id
    FROM qualified_bindings binding
    JOIN base_work owner ON owner.id = binding.owner_id AND owner.entity_type = binding.owner_type
  ), review_work AS (
    SELECT review.id, 'commonreview'::text entity_type, runtime_item.egcs_cn_state::text status,
      '#' || review.id::text identifier_en, '#' || review.id::text identifier_fr, source.agreement_id,
      CASE WHEN checklist.id IS NULL THEN 'assessment' ELSE 'checklist' END variant,
      COALESCE(source.owner_subject, CASE WHEN stream.id IS NOT NULL THEN 'transfer_payment' ELSE 'agency' END) owner_subject,
      CASE WHEN source.entity_type = 'applicantrecipient' THEN schema.egcs_cn_agency
        ELSE COALESCE(source.agency_id, program.egcs_tp_agency, schema.egcs_cn_agency) END agency_id,
      COALESCE(source.program_id, program.id) program_id
    FROM "Common_Review" review
    JOIN "Common_Runtime_Item" runtime_item ON runtime_item.id = review.egcs_cn_runtimeitem
    JOIN "Common_Review_Set" review_set ON review_set.id = review.egcs_cn_reviewset AND review_set._deleted = false
    JOIN "Common_Review_Schema" schema ON schema.id = review.egcs_cn_reviewschema AND schema._deleted = false
    LEFT JOIN source_owners source ON source.id = review_set.egcs_cn_entityid
      AND source.entity_type = review_set.egcs_cn_entitytype::text
    LEFT JOIN "Transfer_Payment_Stream" stream ON review_set.egcs_cn_entitytype::text = 'transferpaymentstream'
      AND stream.id = review_set.egcs_cn_entityid AND stream._deleted = false
    LEFT JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
    LEFT JOIN "Common_Checklist" checklist ON checklist.egcs_cn_review = review.id AND checklist._deleted = false
    WHERE review._deleted = false AND (
      source.id IS NOT NULL
      OR (stream.id IS NOT NULL AND program.id IS NOT NULL)
      OR (position(':' in review_set.egcs_cn_entitytype::text) = 0
        AND review_set.egcs_cn_entitytype::text NOT IN (${sql.join(typedOwnerSources)})
        AND schema.egcs_cn_agency IS NOT NULL)
    )
  ), source_work AS (
    SELECT * FROM source_owners UNION ALL SELECT * FROM review_work
  ), recommendation_work AS (
    SELECT recommendation.id, 'commonrecommendation'::text entity_type, runtime_item.egcs_cn_state::text status,
      '#' || recommendation.id::text identifier_en, '#' || recommendation.id::text identifier_fr,
      source.agreement_id, NULL::text variant,
      COALESCE(source.owner_subject, CASE WHEN stream.id IS NOT NULL THEN 'transfer_payment' ELSE 'agency' END) owner_subject,
      CASE WHEN source.entity_type = 'applicantrecipient' THEN schema.egcs_cn_agency
        ELSE COALESCE(source.agency_id, program.egcs_tp_agency, schema.egcs_cn_agency) END agency_id,
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
      AND (
        source.id IS NOT NULL
        OR (stream.id IS NOT NULL AND program.id IS NOT NULL)
        OR (position(':' in recommendation.egcs_cn_entitytype::text) = 0
          AND recommendation.egcs_cn_entitytype::text NOT IN (${sql.join(typedOwnerSources)})
          AND schema.egcs_cn_agency IS NOT NULL)
      )
  ), data_collection_work AS (
    SELECT collection.id, 'commondatacollection'::text entity_type, runtime_item.egcs_cn_state::text status,
      '#' || collection.id::text identifier_en, '#' || collection.id::text identifier_fr,
      source.agreement_id, NULL::text variant,
      COALESCE(source.owner_subject, CASE WHEN stream.id IS NOT NULL THEN 'transfer_payment' ELSE 'agency' END) owner_subject,
      CASE WHEN source.entity_type = 'applicantrecipient' THEN schema.egcs_cn_agency
        ELSE COALESCE(source.agency_id, program.egcs_tp_agency, schema.egcs_cn_agency) END agency_id,
      COALESCE(source.program_id, program.id) program_id
    FROM "Common_Data_Collection" collection
    JOIN "Common_Runtime_Item" runtime_item ON runtime_item.id = collection.egcs_cn_runtimeitem
    JOIN "Common_Data_Collection_Setup" schema
      ON schema.id = runtime_item.egcs_cn_publication AND schema._deleted = false
    LEFT JOIN source_work source ON source.id = collection.egcs_cn_entityid
      AND source.entity_type = collection.egcs_cn_entitytype::text
    LEFT JOIN "Transfer_Payment_Stream" stream ON collection.egcs_cn_entitytype::text = 'transferpaymentstream'
      AND stream.id = collection.egcs_cn_entityid AND stream._deleted = false
    LEFT JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
    WHERE collection._deleted = false
      AND (
        source.id IS NOT NULL
        OR (stream.id IS NOT NULL AND program.id IS NOT NULL)
        OR (position(':' in collection.egcs_cn_entitytype::text) = 0
          AND collection.egcs_cn_entitytype::text NOT IN (${sql.join(typedOwnerSources)})
          AND schema.egcs_cn_agency IS NOT NULL)
      )
  ), work AS (
    SELECT * FROM base_work UNION ALL SELECT * FROM review_work UNION ALL SELECT * FROM recommendation_work UNION ALL SELECT * FROM data_collection_work
  )
  SELECT work.id::text entity_id, work.entity_type, work.status,
    CASE WHEN work.entity_type = 'fundingcaseagreement' THEN COALESCE(to_jsonb(display_agreement)->>'egcs_fc_agreementnumber', work.identifier_en)
      ELSE work.identifier_en END identifier_en,
    CASE WHEN work.entity_type = 'fundingcaseagreement' THEN COALESCE(to_jsonb(display_agreement)->>'egcs_fc_agreementnumber', work.identifier_fr)
      ELSE work.identifier_fr END identifier_fr,
    work.agreement_id::text agreement_id, work.variant,
    display_credit_memo.egcs_fc_applicantrecipient::text proponent_id,
    COALESCE(to_jsonb(display_agreement)->>'egcs_fc_agreementnumber',
      to_jsonb(display_proponent)->>'egcs_ar_legalname_en', to_jsonb(display_proponent)->>'egcs_ar_operatingname_en',
      to_jsonb(display_proponent)->>'egcs_ar_legalname_fr', to_jsonb(display_proponent)->>'egcs_ar_operatingname_fr',
      '#' || display_proponent.id::text,
      to_jsonb(display_stream)->>'egcs_tp_name_en', to_jsonb(owner_agency)->>'egcs_ay_name_en') parent_en,
    COALESCE(to_jsonb(display_agreement)->>'egcs_fc_agreementnumber',
      to_jsonb(display_proponent)->>'egcs_ar_legalname_fr', to_jsonb(display_proponent)->>'egcs_ar_operatingname_fr',
      to_jsonb(display_proponent)->>'egcs_ar_legalname_en', to_jsonb(display_proponent)->>'egcs_ar_operatingname_en',
      '#' || display_proponent.id::text,
      to_jsonb(display_stream)->>'egcs_tp_name_fr', to_jsonb(owner_agency)->>'egcs_ay_name_fr') parent_fr,
    CASE WHEN work.entity_type = 'fundingcaseagreement' THEN to_jsonb(display_agreement)->>'egcs_fc_title_en'
      WHEN work.entity_type = 'applicantrecipient' THEN to_jsonb(display_proponent)->>'egcs_ar_operatingname_en' END secondary_en,
    CASE WHEN work.entity_type = 'fundingcaseagreement' THEN to_jsonb(display_agreement)->>'egcs_fc_title_fr'
      WHEN work.entity_type = 'applicantrecipient' THEN to_jsonb(display_proponent)->>'egcs_ar_operatingname_fr' END secondary_fr,
    CASE work.entity_type
      WHEN 'commonreview' THEN review_schema.egcs_cn_name_en
      WHEN 'commonrecommendation' THEN recommendation_schema.egcs_cn_name_en
      WHEN 'commondatacollection' THEN collection_version.egcs_cn_definition->>'nameEn'
      WHEN 'fundingcasemonitor' THEN monitor_type.egcs_ay_name_en
      WHEN 'fundingcaseagreementcommitment' THEN commitment_type.egcs_ay_name_en
      WHEN 'fundingcaseamendment' THEN to_jsonb(display_amendment)->>'egcs_fc_name_en'
    END detail_name_en,
    CASE work.entity_type
      WHEN 'commonreview' THEN review_schema.egcs_cn_name_fr
      WHEN 'commonrecommendation' THEN recommendation_schema.egcs_cn_name_fr
      WHEN 'commondatacollection' THEN collection_version.egcs_cn_definition->>'nameFr'
      WHEN 'fundingcasemonitor' THEN monitor_type.egcs_ay_name_fr
      WHEN 'fundingcaseagreementcommitment' THEN commitment_type.egcs_ay_name_fr
      WHEN 'fundingcaseamendment' THEN to_jsonb(display_amendment)->>'egcs_fc_name_fr'
    END detail_name_fr,
    CASE WHEN work.entity_type = 'fundingcaseamendment' THEN (to_jsonb(display_amendment)->>'egcs_fc_amendmentnumber')::int END detail_number,
    display_reconcile.egcs_fc_fundingagreementclaim::text claim_id,
    fiscal_year.egcs_ay_fiscalyeardisplay fiscal_year,
    COALESCE((to_jsonb(display_claim)->>'egcs_fc_periodstart')::int, (to_jsonb(display_payment)->>'egcs_fc_periodstart')::int) period_start,
    COALESCE((to_jsonb(display_claim)->>'egcs_fc_periodend')::int, (to_jsonb(display_payment)->>'egcs_fc_periodend')::int) period_end,
    to_jsonb(display_payment)->>'egcs_fc_paymenttype' payment_type,
    assignment.egcs_cn_isprimary is_primary,
    (completion.id IS NOT NULL) AS "isCompleted",
    count(*) OVER ()::int total_count
  FROM work JOIN "Common_Entity_Assignment" assignment
    ON assignment.egcs_cn_entityid = work.id AND assignment.egcs_cn_entitytype::text = work.entity_type
  LEFT JOIN "Agency_Profile" owner_agency ON owner_agency.id = work.agency_id AND owner_agency._deleted = false
  LEFT JOIN "Funding_Case_Agreement_Profile" display_agreement ON display_agreement.id = work.agreement_id
    AND display_agreement._deleted = false
    AND (work.owner_subject NOT IN ('correction','account_receivable') OR ${correctionParentRead})
  LEFT JOIN "Common_Review" display_review ON display_review.id = work.id AND work.entity_type = 'commonreview'
  LEFT JOIN "Common_Review_Set" display_review_set ON display_review_set.id = display_review.egcs_cn_reviewset
  LEFT JOIN "Common_Review_Schema" review_schema ON review_schema.id = display_review.egcs_cn_reviewschema
  LEFT JOIN "Common_Recommendation" display_recommendation ON display_recommendation.id = work.id
    AND work.entity_type = 'commonrecommendation'
  LEFT JOIN "Common_Runtime_Item" display_recommendation_item ON display_recommendation_item.id = display_recommendation.egcs_cn_runtimeitem
  LEFT JOIN "Common_Recommendation_Schema" recommendation_schema ON recommendation_schema.id = display_recommendation_item.egcs_cn_publication
  LEFT JOIN "Common_Data_Collection" display_collection ON display_collection.id = work.id
    AND work.entity_type = 'commondatacollection'
  LEFT JOIN "Common_Runtime_Item" display_collection_item ON display_collection_item.id = display_collection.egcs_cn_runtimeitem
  LEFT JOIN "Common_Publication_Version" collection_version ON collection_version.id = display_collection_item.egcs_cn_publicationversion
  LEFT JOIN "Common_Review" recommendation_review ON recommendation_review.id = display_recommendation.egcs_cn_entityid
    AND display_recommendation.egcs_cn_entitytype::text = 'commonreview'
  LEFT JOIN "Common_Review_Set" recommendation_review_set ON recommendation_review_set.id = recommendation_review.egcs_cn_reviewset
  LEFT JOIN qualified_bindings display_binding ON display_binding.entity_id = COALESCE(
    display_collection.egcs_cn_entityid, display_review_set.egcs_cn_entityid,
    CASE WHEN display_recommendation.egcs_cn_entitytype::text <> 'commonreview' THEN display_recommendation.egcs_cn_entityid END,
    recommendation_review_set.egcs_cn_entityid)
    AND display_binding.entity_type = COALESCE(display_collection.egcs_cn_entitytype::text, display_review_set.egcs_cn_entitytype::text,
      CASE WHEN display_recommendation.egcs_cn_entitytype::text <> 'commonreview' THEN display_recommendation.egcs_cn_entitytype::text END,
      recommendation_review_set.egcs_cn_entitytype::text)
    AND display_binding.owner_type = 'applicantrecipient'
  LEFT JOIN "Funding_Case_Account_Receivable_Credit_Memo" display_credit_memo ON display_credit_memo.id = CASE
    WHEN work.entity_type = 'fundingcaseaccountreceivablecreditmemo' THEN work.id
    WHEN display_review_set.egcs_cn_entitytype::text = 'fundingcaseaccountreceivablecreditmemo' THEN display_review_set.egcs_cn_entityid
    WHEN display_collection.egcs_cn_entitytype::text = 'fundingcaseaccountreceivablecreditmemo' THEN display_collection.egcs_cn_entityid
    WHEN display_recommendation.egcs_cn_entitytype::text = 'fundingcaseaccountreceivablecreditmemo' THEN display_recommendation.egcs_cn_entityid
    WHEN recommendation_review_set.egcs_cn_entitytype::text = 'fundingcaseaccountreceivablecreditmemo' THEN recommendation_review_set.egcs_cn_entityid END
    AND NOT display_credit_memo._deleted
  LEFT JOIN "Applicant_Recipient_Profile" display_proponent ON display_proponent.id = CASE
    WHEN work.entity_type = 'applicantrecipient' THEN work.id
    WHEN display_credit_memo.id IS NOT NULL THEN display_credit_memo.egcs_fc_applicantrecipient
    WHEN display_review_set.egcs_cn_entitytype::text = 'applicantrecipient' THEN display_review_set.egcs_cn_entityid
    WHEN display_collection.egcs_cn_entitytype::text = 'applicantrecipient' THEN display_collection.egcs_cn_entityid
    WHEN display_recommendation.egcs_cn_entitytype::text = 'applicantrecipient' THEN display_recommendation.egcs_cn_entityid
    WHEN recommendation_review_set.egcs_cn_entitytype::text = 'applicantrecipient' THEN recommendation_review_set.egcs_cn_entityid
    ELSE display_binding.owner_id END
    AND display_proponent._deleted = false
  LEFT JOIN "Transfer_Payment_Stream" display_stream ON display_stream.id = CASE
    WHEN display_review_set.egcs_cn_entitytype::text = 'transferpaymentstream' THEN display_review_set.egcs_cn_entityid
    WHEN display_collection.egcs_cn_entitytype::text = 'transferpaymentstream' THEN display_collection.egcs_cn_entityid
    WHEN display_recommendation.egcs_cn_entitytype::text = 'transferpaymentstream' THEN display_recommendation.egcs_cn_entityid
    WHEN recommendation_review_set.egcs_cn_entitytype::text = 'transferpaymentstream' THEN recommendation_review_set.egcs_cn_entityid END
    AND display_stream._deleted = false
  LEFT JOIN "Funding_Case_Agreement_Claim" display_claim ON display_claim.id = work.id AND work.entity_type = 'fundingcaseagreementclaim'
  LEFT JOIN "Funding_Case_Agreement_Claim_Reconcile" display_reconcile ON display_reconcile.id = work.id AND work.entity_type = 'fundingclaimreconcile'
  LEFT JOIN "Funding_Case_Agreement_Payment" display_payment ON display_payment.id = work.id AND work.entity_type = 'fundingcasepayment'
  LEFT JOIN "Funding_Case_Agreement_Forecast" display_forecast ON display_forecast.id = work.id AND work.entity_type = 'fundingcaseforecast'
  LEFT JOIN "Funding_Case_Agreement_Monitor" display_monitor ON display_monitor.id = work.id AND work.entity_type = 'fundingcasemonitor'
  LEFT JOIN "Transfer_Payment_Monitor_Type" stream_monitor_type ON stream_monitor_type.id::text = to_jsonb(display_monitor)->>'egcs_fc_type'
  LEFT JOIN "Agency_Monitor_Type" monitor_type ON monitor_type.id = stream_monitor_type.egcs_tp_agencymonitortype
  LEFT JOIN "Funding_Case_Agreement_Commitment" display_commitment ON display_commitment.id = work.id AND work.entity_type = 'fundingcaseagreementcommitment'
  LEFT JOIN "Transfer_Payment_Stream_Commitment_Type" stream_commitment_type ON stream_commitment_type.id::text = to_jsonb(display_commitment)->>'egcs_fc_type'
  LEFT JOIN "Agency_Commitment_Type" commitment_type ON commitment_type.id = stream_commitment_type.egcs_tp_agencycommitmenttype
  LEFT JOIN "Funding_Case_Agreement_Amendment" display_amendment ON display_amendment.id = work.id AND work.entity_type = 'fundingcaseamendment'
  LEFT JOIN "Agency_Fiscal_Year" fiscal_year ON fiscal_year.id = COALESCE(
    (to_jsonb(display_claim)->>'egcs_fc_fiscalyear')::bigint,
    (to_jsonb(display_payment)->>'egcs_fc_fiscalyear')::bigint,
    (to_jsonb(display_forecast)->>'egcs_fc_fiscalyear')::bigint)
  LEFT JOIN "Common_Status" business_status
    ON business_status.id::text = work.status
    AND work.entity_type IN (${sql.join(businessEntityTypes)})
  LEFT JOIN "Common_Completion" completion
    ON completion.egcs_cn_entityid = work.id
    AND completion.egcs_cn_entitytype::text = work.entity_type
    AND completion._deleted = false
  WHERE assignment.egcs_cn_user = ${actor.commonUserId}::bigint AND assignment._deleted = false
    AND (work.owner_subject = 'applicant_recipient' OR owner_agency.id IS NOT NULL)
    AND (${sql.join(authorizationPredicates, sql` OR `)})
    AND ${creditMemoQueueAuthority(readGrants)}
    AND ${buildAssignedWorkOpenPredicate({ mode: 'dashboard' })}
    AND (${query.entityType ?? null}::text IS NULL OR work.entity_type = ${query.entityType ?? null}::text)
    AND (
      work.identifier_en ILIKE ${search}
      OR work.identifier_fr ILIKE ${search}
      OR work.entity_type ILIKE ${search}
      OR work.status ILIKE ${search}
      OR business_status.egcs_cn_name_en ILIKE ${search}
      OR business_status.egcs_cn_name_fr ILIKE ${search}
      OR (to_jsonb(display_agreement)->>'egcs_fc_agreementnumber') ILIKE ${search}
      OR review_schema.egcs_cn_name_en ILIKE ${search}
      OR review_schema.egcs_cn_name_fr ILIKE ${search}
      OR recommendation_schema.egcs_cn_name_en ILIKE ${search}
      OR recommendation_schema.egcs_cn_name_fr ILIKE ${search}
      OR (collection_version.egcs_cn_definition->>'nameEn') ILIKE ${search}
      OR (collection_version.egcs_cn_definition->>'nameFr') ILIKE ${search}
      OR monitor_type.egcs_ay_name_en ILIKE ${search}
      OR monitor_type.egcs_ay_name_fr ILIKE ${search}
      OR commitment_type.egcs_ay_name_en ILIKE ${search}
      OR commitment_type.egcs_ay_name_fr ILIKE ${search}
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
    url: row.entity_type === 'fundingcaseaccountreceivablecreditmemo' && row.proponent_id
      ? `/proponents/edit/${row.proponent_id}/credit-memos/${row.entity_id}`
      : buildAssignedWorkRoute(row.entity_type, row.entity_id, row.agreement_id, row.variant)
  }))
  return { items, page: query.page, limit: query.limit, total }
}
