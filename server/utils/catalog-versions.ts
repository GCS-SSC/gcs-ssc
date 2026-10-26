/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Catalog metadata uses the caller's existing read grants. */
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { StaticPermissionGrant } from '~~/shared/types/auth'
import { CATALOG_GROUPS, type CatalogGroup, type CatalogVersionsEnvelope } from '~~/shared/utils/catalog-cache'

/** Resolves version metadata visible through an existing read permission. */
const groupsForGrant = (grant: StaticPermissionGrant): readonly CatalogGroup[] => {
  if (grant.action !== 'read') return []
  switch (grant.subject) {
    case 'agency':
    case 'transfer_payment':
    case 'agreement':
      return CATALOG_GROUPS
    case 'account_receivable':
      return ['chart-of-accounts', 'fiscal-years', 'receivable-types', 'approval-behalf-types']
    case 'applicant_recipient':
    case 'funding_case':
    case 'journal_voucher':
    case 'correction':
      return ['approval-behalf-types']
    default:
      return []
  }
}

/** Filters revisions by existing business/catalog read scopes and exact approval assignments. */
export const readCatalogVersions = async (
  db: Kysely<Database>,
  userId: string,
  grants: StaticPermissionGrant[]
): Promise<CatalogVersionsEnvelope['agencies']> => {
  const [agencies, programs, approvalAgencies] = await Promise.all([
    db.selectFrom('Agency_Profile').select('id').where('_deleted', '=', false).execute(),
    db.selectFrom('Transfer_Payment_Profile').select(['id', 'egcs_tp_agency']).where('_deleted', '=', false).execute(),
    db.selectFrom('Common_User as person')
      .innerJoin('Common_Approval as approval', join => join.on(eb => eb.or([
        eb('approval.egcs_cn_assigneduser', '=', eb.ref('person.id')),
        eb.and([
          eb('approval.egcs_cn_assigneduser', 'is', null),
          eb('approval.egcs_cn_defaultuser', '=', eb.ref('person.id'))
        ])
      ])))
      .innerJoin('Common_Routing_Slip as slip', 'slip.id', 'approval.egcs_cn_routingslip')
      .innerJoin('Common_Approval_Template as template', 'template.id', 'slip.egcs_cn_approvaltemplate')
      .select('template.egcs_cn_agency as agencyId').distinct()
      .where('person.egcs_cn_authuserid', '=', userId).where('person._deleted', '=', false)
      .where('slip._deleted', '=', false).execute()
  ])
  const liveAgencyIds = new Set(agencies.map(row => String(row.id)))
  const programAgencies = new Map(programs.map(row => [String(row.id), String(row.egcs_tp_agency)]))
  const permitted = new Map<string, Set<CatalogGroup>>()
  /** Adds only existing Agencies to the permitted version projection. */
  const allow = (agencyId: string, groups: readonly CatalogGroup[]) => {
    if (!liveAgencyIds.has(agencyId) || groups.length === 0) return
    const agencyGroups = permitted.get(agencyId) ?? new Set<CatalogGroup>()
    for (const group of groups) agencyGroups.add(group)
    permitted.set(agencyId, agencyGroups)
  }
  for (const grant of grants) {
    const groups = groupsForGrant(grant)
    switch (grant.scope.type) {
      case 'global':
        for (const agencyId of liveAgencyIds) allow(agencyId, groups)
        break
      case 'agency':
        allow(grant.scope.agencyId, groups)
        break
      case 'program':
        if (programAgencies.get(grant.scope.transferPaymentId) === grant.scope.agencyId) allow(grant.scope.agencyId, groups)
        break
    }
  }
  for (const row of approvalAgencies) allow(String(row.agencyId), ['approval-behalf-types'])
  if (permitted.size === 0) return {}
  const revisions = await db.selectFrom('Agency_Catalog_Revision')
    .select(['egcs_ay_agency', 'egcs_ay_cataloggroup', 'egcs_ay_revision'])
    .where('egcs_ay_agency', 'in', [...permitted.keys()]).execute()
  const result: CatalogVersionsEnvelope['agencies'] = {}
  for (const row of revisions) {
    const agencyId = String(row.egcs_ay_agency)
    if (!permitted.get(agencyId)?.has(row.egcs_ay_cataloggroup)) continue
    const versionMap = result[agencyId] ?? {}
    versionMap[row.egcs_ay_cataloggroup] = row.egcs_ay_revision
    result[agencyId] = versionMap
  }
  return result
}
