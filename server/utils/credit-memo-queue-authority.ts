/* eslint-disable jsdoc/require-jsdoc -- Standalone Credit Memo queues inherit their Agency financial authority. */
import { sql, type RawBuilder } from 'kysely'
import type { StaticAuthorizationGrant } from '@gcs-ssc/authorization'

export const creditMemoQueueAuthority = (grants: StaticAuthorizationGrant[], workAlias = 'work') => {
  const predicates = grants.filter(grant => grant.subject === 'account_receivable' && grant.action === 'read').flatMap(grant => {
    if (grant.scope.type === 'global') return [sql`TRUE`]
    if (grant.scope.type === 'agency') return [sql`memo.egcs_fc_agency = ${grant.scope.agencyId}::bigint`]
    return []
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
      assigned_role.agency_id IS NULL OR (assigned_role.agency_id = memo.egcs_fc_agency
        AND NOT EXISTS (SELECT 1 FROM role_transfer_payment_scope role_scope WHERE role_scope.role_id = assigned_role.id AND NOT role_scope._deleted))
    )
  )`, workAlias, idColumn)

const filterCreditMemoQueueOwners = (allowed: RawBuilder<unknown>, workAlias = 'work', idColumn = 'id') => sql<boolean>`NOT EXISTS (
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
  LEFT JOIN "Funding_Case_Account_Receivable_Credit_Memo" memo ON memo.id = source.id AND NOT memo._deleted
  LEFT JOIN "Agency_Profile" agency ON agency.id = memo.egcs_fc_agency AND NOT agency._deleted
  WHERE source.entity_type = 'fundingcaseaccountreceivablecreditmemo'
    AND (memo.id IS NULL OR agency.id IS NULL OR memo.egcs_fc_agency <> ${sql.ref(`${workAlias}.agency_id`)} OR NOT ${allowed})
)`
