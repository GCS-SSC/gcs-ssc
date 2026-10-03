/* eslint-disable jsdoc/require-jsdoc -- Queue filtering must cover every allocated Agreement before pagination. */
import { sql, type RawBuilder } from 'kysely'
import type { StaticAuthorizationGrant } from '@gcs-ssc/authorization'

export const creditMemoQueueAuthority = (grants: StaticAuthorizationGrant[], workAlias = 'work') => {
  const predicates = grants.filter(grant => grant.subject === 'account_receivable').map(grant => {
    if (grant.scope.type === 'global') return sql`TRUE`
    if (grant.scope.type === 'agency') return sql`program.egcs_tp_agency = ${grant.scope.agencyId}::bigint`
    return sql`program.egcs_tp_agency = ${grant.scope.agencyId}::bigint AND program.id = ${grant.scope.transferPaymentId}::bigint`
  })
  const allowed = predicates.length ? sql`(${sql.join(predicates, sql` OR `)})` : sql`FALSE`
  return filterCreditMemoQueueOwners(allowed, workAlias)
}

export const creditMemoQueueContributorAuthority = (userId: RawBuilder<unknown>, workAlias: string, idColumn: string) =>
  filterCreditMemoQueueOwners(sql`EXISTS (
    SELECT 1 FROM "user" actor
    JOIN user_role_assignment assignment ON assignment.user_id = actor.id AND NOT assignment._deleted
    JOIN role assigned_role ON assigned_role.id = assignment.role_id AND NOT assigned_role._deleted
    JOIN role_permission permission ON permission.role_id = assigned_role.id AND NOT permission._deleted
      AND permission.subject = 'account_receivable' AND permission.access_level IN ('contributor', 'manager')
    WHERE actor.id = ${userId} AND NOT actor._deleted AND (
      assigned_role.agency_id IS NULL OR (assigned_role.agency_id = program.egcs_tp_agency AND (
        NOT EXISTS (SELECT 1 FROM role_transfer_payment_scope role_scope WHERE role_scope.role_id = assigned_role.id AND NOT role_scope._deleted)
        OR EXISTS (SELECT 1 FROM role_transfer_payment_scope role_scope WHERE role_scope.role_id = assigned_role.id
          AND role_scope.transfer_payment_profile_id = program.id AND NOT role_scope._deleted)
      ))
    )
  )`, workAlias, idColumn)

const filterCreditMemoQueueOwners = (allowed: RawBuilder<unknown>, workAlias = 'work', idColumn = 'id') => {
  return sql<boolean>`NOT EXISTS (
    WITH RECURSIVE source (id, entity_type) AS (
      SELECT ${sql.ref(`${workAlias}.${idColumn}`)}::bigint, ${sql.ref(`${workAlias}.entity_type`)}::text
      UNION
      SELECT edge.entity_id, edge.entity_type FROM source
      JOIN (
        SELECT review.id, 'commonreview'::text source_type, review_set.egcs_cn_entityid entity_id,
          review_set.egcs_cn_entitytype::text entity_type
        FROM "Common_Review" review
        JOIN "Common_Review_Set" review_set ON review_set.id = review.egcs_cn_reviewset AND NOT review_set._deleted
        WHERE NOT review._deleted
        UNION ALL
        SELECT recommendation.id, 'commonrecommendation', recommendation.egcs_cn_entityid,
          recommendation.egcs_cn_entitytype::text
        FROM "Common_Recommendation" recommendation WHERE NOT recommendation._deleted
      ) edge ON edge.id = source.id AND edge.source_type = source.entity_type
    )
    SELECT 1 FROM source
    JOIN "Funding_Case_Account_Receivable_Credit_Memo" memo ON source.entity_type = 'fundingcaseaccountreceivablecreditmemo' AND memo.id = source.id
    CROSS JOIN LATERAL (
      SELECT memo.egcs_fc_fundingagreement agreement_id
      UNION
      SELECT allocation.egcs_fc_fundingagreement FROM "Funding_Case_Account_Receivable_Recovery" recovery
      JOIN "Funding_Case_Account_Receivable_Allocation" allocation ON allocation.egcs_fc_recovery = recovery.id AND NOT allocation._deleted
      WHERE recovery.egcs_fc_creditmemo = memo.id AND NOT recovery._deleted
    ) affected
    LEFT JOIN "Funding_Case_Agreement_Profile" agreement ON agreement.id = affected.agreement_id AND NOT agreement._deleted
    LEFT JOIN "Transfer_Payment_Stream" stream ON stream.id = agreement.egcs_fc_transferpaymentstream AND NOT stream._deleted
    LEFT JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND NOT program._deleted
    LEFT JOIN "Agency_Profile" agency ON agency.id = program.egcs_tp_agency AND NOT agency._deleted
    WHERE memo._deleted OR agreement.id IS NULL OR stream.id IS NULL OR program.id IS NULL OR agency.id IS NULL
      OR program.egcs_tp_agency <> ${sql.ref(`${workAlias}.agency_id`)} OR NOT ${allowed}
  )`
}
