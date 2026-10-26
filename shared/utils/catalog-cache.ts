import { z } from 'zod'

export const CATALOG_GROUPS = [
  'chart-of-accounts', 'fiscal-years', 'receivable-types', 'outcomes', 'address-types',
  'document-templates', 'amendment-types', 'cost-categories', 'commitment-types',
  'funding-subtypes', 'monitor-types', 'agreement-subtypes', 'custom-fields',
  'holdback-bases', 'streams', 'approval-behalf-types', 'review-setups'
] as const

export type CatalogGroup = typeof CATALOG_GROUPS[number]

export const CatalogVersionsEnvelopeSchema = z.object({
  accountId: z.string().min(1),
  sessionId: z.string().min(1),
  agencies: z.record(z.string(), z.partialRecord(z.enum(CATALOG_GROUPS), z.string().min(1)))
})
export type CatalogVersionsEnvelope = z.infer<typeof CatalogVersionsEnvelopeSchema>

export const CATALOG_CACHE_QUERY_KEYS = ['catalogRevision', 'catalogAgencies', 'catalogAccount', 'catalogSession'] as const

interface CatalogCacheRule {
  id: string
  group: CatalogGroup
  maxAge: number
  pattern: RegExp
}

const hour = 60 * 60
const day = 24 * hour
const week = 7 * day
const agreement = '/api/agreements/[^/]+'

export const CATALOG_CACHE_RULES: readonly CatalogCacheRule[] = [
  { id: 'C002', group: 'chart-of-accounts', maxAge: hour, pattern: /^\/api\/account-receivable-credit-memos\/lookups\/chart-of-accounts$/ },
  { id: 'C004', group: 'chart-of-accounts', maxAge: hour, pattern: /^\/api\/account-receivables\/[^/]+\/lookups\/charts$/ },
  { id: 'C007', group: 'fiscal-years', maxAge: day, pattern: new RegExp(`^${agreement}/account-receivables/lookups/fiscal-years$`) },
  { id: 'C011', group: 'receivable-types', maxAge: hour, pattern: new RegExp(`^${agreement}/account-receivables/lookups/types$`) },
  { id: 'C012', group: 'outcomes', maxAge: day, pattern: new RegExp(`^${agreement}/activities/lookups/outcomes$`) },
  { id: 'C014', group: 'address-types', maxAge: week, pattern: new RegExp(`^${agreement}/addresses/lookups/address-types$`) },
  { id: 'C017', group: 'document-templates', maxAge: week, pattern: new RegExp(`^${agreement}/amendments/[^/]+/document-templates$`) },
  { id: 'C019', group: 'amendment-types', maxAge: week, pattern: new RegExp(`^${agreement}/amendments/lookups/subtypes$`) },
  { id: 'C020', group: 'amendment-types', maxAge: week, pattern: new RegExp(`^${agreement}/amendments/lookups/types$`) },
  { id: 'C023', group: 'cost-categories', maxAge: hour, pattern: new RegExp(`^${agreement}/budget-line-items/lookups/organization-cost-categories$`) },
  { id: 'C027', group: 'document-templates', maxAge: week, pattern: new RegExp(`^${agreement}/closeouts/[^/]+/document-templates$`) },
  { id: 'C028', group: 'chart-of-accounts', maxAge: hour, pattern: new RegExp(`^${agreement}/commitment-lines/lookups/chart-of-accounts$`) },
  { id: 'C029', group: 'commitment-types', maxAge: week, pattern: new RegExp(`^${agreement}/commitments/lookups/types$`) },
  { id: 'C033', group: 'document-templates', maxAge: week, pattern: new RegExp(`^${agreement}/document-templates$`) },
  { id: 'C036', group: 'funding-subtypes', maxAge: week, pattern: new RegExp(`^${agreement}/funding-subtypes$`) },
  { id: 'C038', group: 'fiscal-years', maxAge: week, pattern: new RegExp(`^${agreement}/monitors/lookups/fiscal-years$`) },
  { id: 'C039', group: 'monitor-types', maxAge: week, pattern: new RegExp(`^${agreement}/monitors/lookups/monitor-types$`) },
  { id: 'C044', group: 'agreement-subtypes', maxAge: week, pattern: /^\/api\/agreements\/lookups\/agreement-subtypes$/ },
  { id: 'C046', group: 'custom-fields', maxAge: week, pattern: /^\/api\/agreements\/lookups\/custom-fields$/ },
  { id: 'C048', group: 'holdback-bases', maxAge: week, pattern: /^\/api\/agreements\/lookups\/holdback-bases$/ },
  { id: 'C051', group: 'streams', maxAge: week, pattern: /^\/api\/agreements\/lookups\/streams$/ },
  { id: 'C056', group: 'approval-behalf-types', maxAge: week, pattern: /^\/api\/approvals\/lookups\/behalf-types$/ },
  { id: 'C068', group: 'review-setups', maxAge: week, pattern: /^\/api\/review-sets\/lookups\/setups$/ }
]

/**
 * Selects only approved catalog request variants, retaining every caller filter.
 * @param url - Lookup URL with its original query parameters.
 * @returns The approved response rule, or null for excluded requests.
 */
export const getCatalogCacheRule = (url: URL): CatalogCacheRule | null => {
  const rule = CATALOG_CACHE_RULES.find(candidate => candidate.pattern.test(url.pathname))
  if (!rule) return null
  const query = url.searchParams
  if (rule.id === 'C014' && query.has('selected_ids') && query.get('permission_action') === 'update' && query.has('address_id')) return null
  if (rule.id === 'C051' && ((query.get('permission_action') ?? 'create') !== 'create' || query.has('agreement_id'))) return null
  if (rule.id === 'C068' && query.get('entityType') !== 'fundingcaseagreement') return null
  return rule
}
