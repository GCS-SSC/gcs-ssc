/* eslint-disable jsdoc/require-jsdoc -- Agency rule queries and route adapter. */
import { useTranslation } from '@intlify/h3'
import { getRouterParam, type H3Event } from 'h3'
import { sql, type Kysely } from 'kysely'
import { z } from 'zod'
import type { Database } from '~~/shared/types/database'
import { AgencyReviewClauseRuleSchema } from '~~/shared/types/schemas/agency-review-clause-rule'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { readAssessmentClauseOutcomes } from './assessment-clause-outcomes'
import { publishedAgencyClauses } from './agreement-clauses'
import { withActiveAgencyMutationTransaction, withActiveAgencyReadTransaction } from './agency-auth'
import { badRequest, notFound, throwApiError } from './api-errors'
import { getValidatedQueryI18n, readValidatedBodyI18n } from './api-validate'
import { authorize } from './authorize'
import { resolveRequestLocale } from './request-locale'
import { escapeLikePattern } from './sql-like'

const agencyAgreementReviews = (db: Kysely<Database>, agencyId: string) => db
  .selectFrom('Common_Review_Schema as checklist')
  .innerJoin('Common_Publication as publication', 'publication.id', 'checklist.id')
  .where('checklist.egcs_cn_agency', '=', agencyId)
  .where('checklist.egcs_cn_entitytype', '=', 'fundingcaseagreement')
  .where('checklist._deleted', '=', false)
  .where('publication._deleted', '=', false)

const clauseNameEn = sql<string>`version.egcs_cn_definition ->> 'nameEn'`
const clauseNameFr = sql<string>`version.egcs_cn_definition ->> 'nameFr'`

const activeRules = (db: Kysely<Database>, agencyId: string) => db
  .selectFrom('Agency_Review_Clause_Rule as rule')
  .where('rule.egcs_ay_organizationagency', '=', agencyId)
  .where('rule._deleted', '=', false)

const selectRuleNames = (db: Kysely<Database>, agencyId: string) => activeRules(db, agencyId)
  .innerJoin('Common_Review_Schema as checklist', 'checklist.id', 'rule.egcs_ay_reviewschema')
  .innerJoin('Agency_Clause as clause', 'clause.id', 'rule.egcs_ay_clause')
  .innerJoin('Common_Publication as publication', 'publication.id', 'clause.id')
  .innerJoin('Common_Publication_Version as version', 'version.id', 'publication.egcs_cn_currentversion')
  .leftJoin('Common_Publication as reviewPublication', 'reviewPublication.id', 'checklist.id')
  .leftJoin('Common_Publication_Version as reviewVersion', 'reviewVersion.id', 'reviewPublication.egcs_cn_currentversion')

export const assertAgencyClauseHasNoActiveReviewRules = async (
  event: H3Event, db: Kysely<Database>, agencyId: string, clauseId: string
) => {
  const conflicts = await activeRules(db, agencyId)
    .innerJoin('Common_Review_Schema as checklist', 'checklist.id', 'rule.egcs_ay_reviewschema')
    .where('rule.egcs_ay_clause', '=', clauseId)
    .select([
      'rule.egcs_ay_result as result', 'rule.egcs_ay_strategy as strategy', 'checklist.egcs_cn_name_en as nameEn', 'checklist.egcs_cn_name_fr as nameFr'
    ])
    .orderBy('rule.id').execute()
  if (!conflicts.length) return
  const t = await useTranslation(event)
  const locale = resolveRequestLocale(event)
  const names = conflicts.map(rule => `${locale === 'fr' ? rule.nameFr : rule.nameEn} (${rule.result ? t(`checklist.result.${rule.result}`) : rule.strategy})`)
  const rules = new Intl.ListFormat(locale).format(names)
  await throwApiError(event, {
    statusCode: 409, code: 'CLAUSE_HAS_REVIEW_RULES', key: 'review_clause_rules.clause_in_use', params: { rules }
  })
}

const ReviewScopeQuerySchema = PaginationSchema.extend({
  review_schema_id: PositivePostgresBigintIdSchema.optional()
})

const LookupsQuerySchema = ReviewScopeQuerySchema.extend({
  kind: z.enum(['checklist', 'clause', 'outcome'], { error: 'validation.required' }),
  selected_ids: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema).max(100)]).optional()
})

const queryList = async (event: H3Event, agencyId: string) => {
  const { page, limit, search, review_schema_id: schemaId } = await getValidatedQueryI18n(event, ReviewScopeQuerySchema)
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    let query = selectRuleNames(trx, agencyId)
    if (schemaId) query = query.where('rule.egcs_ay_reviewschema', '=', schemaId)
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      query = query.where(eb => eb.or([
        eb('checklist.egcs_cn_name_en', 'ilike', pattern), eb('checklist.egcs_cn_name_fr', 'ilike', pattern),
        eb(clauseNameEn, 'ilike', pattern), eb(clauseNameFr, 'ilike', pattern)
      ]))
    }
    const [items, count] = await Promise.all([
      query.select([
        'rule.id', 'rule.egcs_ay_reviewschema', 'rule.egcs_ay_result', 'rule.egcs_ay_outcome', 'rule.egcs_ay_strategy', 'rule.egcs_ay_clause', 'rule.egcs_ay_protected',
        'checklist.egcs_cn_name_en as checklistNameEn', 'checklist.egcs_cn_name_fr as checklistNameFr',
        clauseNameEn.as('clauseNameEn'), clauseNameFr.as('clauseNameFr'), 'reviewVersion.egcs_cn_definition as reviewDefinition'
      ]).orderBy('rule.id', 'desc').limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => eb.fn.count('rule.id').as('total')).executeTakeFirstOrThrow()
    ])
    return {
      items: items.map(({ reviewDefinition, ...row }) => {
        const outcome = readAssessmentClauseOutcomes(reviewDefinition).find(item => item.id === row.egcs_ay_outcome)
        const strategy = outcome?.strategies.find(item => item.value === row.egcs_ay_strategy)
        return {
          ...row,
          outcomeNameEn: outcome?.label_en, outcomeNameFr: outcome?.label_fr,
          strategyNameEn: strategy?.label.en, strategyNameFr: strategy?.label.fr
        }
      }),
      total: Number(count.total), page, limit
    }
  })
}

const queryLookups = async (event: H3Event, agencyId: string) => {
  const { kind, page, limit, search, selected_ids: selectedIds, review_schema_id: schemaId } = await getValidatedQueryI18n(event, LookupsQuerySchema)
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    if (kind === 'outcome') {
      const review = schemaId
        ? await agencyAgreementReviews(trx, agencyId)
            .innerJoin('Common_Publication_Version as reviewVersion', 'reviewVersion.id', 'publication.egcs_cn_currentversion')
            .select('reviewVersion.egcs_cn_definition as definition')
            .where('checklist.id', '=', schemaId)
            .where('checklist.egcs_cn_reviewtype', '=', 'assessment')
            .where('publication.egcs_cn_state', 'in', ['published', 'retired'])
            .executeTakeFirst()
        : null
      const items = review ? readAssessmentClauseOutcomes(review.definition) : []
      return { items, total: items.length, page: 1, limit: items.length }
    }
    const options = kind === 'checklist'
      ? agencyAgreementReviews(trx, agencyId)
          .where('checklist.egcs_cn_reviewtype', '=', 'checklist')
          .where('publication.egcs_cn_state', 'in', selectedIds ? ['published', 'retired'] : ['published'])
          .select([
            'checklist.id', 'checklist.egcs_cn_name_en as label_en', 'checklist.egcs_cn_name_fr as label_fr'
          ])
      : publishedAgencyClauses(trx, agencyId).select(['clause.id', clauseNameEn.as('label_en'), clauseNameFr.as('label_fr')])
    let query = trx.selectFrom(options.as('option'))
    if (selectedIds) query = query.where('id', 'in', Array.isArray(selectedIds) ? selectedIds : [selectedIds])
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      query = query.where(eb => eb.or([eb('label_en', 'ilike', pattern), eb('label_fr', 'ilike', pattern)]))
    }
    const [items, count] = await Promise.all([
      query.selectAll().orderBy('label_en').orderBy('id').limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => eb.fn.count('id').as('total')).executeTakeFirstOrThrow()
    ])
    return { items, total: Number(count.total), page, limit }
  })
}

type Action = 'list' | 'lookups' | 'create' | 'update' | 'disable'
const ruleNotFound = (event: H3Event) => notFound(event, 'REVIEW_CLAUSE_RULE_NOT_FOUND', 'review_clause_rules.not_found')

export const agencyReviewClauseRuleRoute = async (event: H3Event, action: Action) => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  if (!isPositivePostgresBigintText(agencyId)) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  await authorize(event, 'agency', action === 'list' || action === 'lookups' ? 'read' : 'update', { type: 'agency', agencyId })
  if (action === 'list') return await queryList(event, agencyId)
  if (action === 'lookups') return await queryLookups(event, agencyId)

  const id = getRouterParam(event, 'ruleId') ?? ''
  if (action !== 'create' && !isPositivePostgresBigintText(id)) return await ruleNotFound(event)
  const draft = action === 'disable' ? null : await readValidatedBodyI18n(event, AgencyReviewClauseRuleSchema.strict())
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const update = trx.updateTable('Agency_Review_Clause_Rule')
      .where('id', '=', id).where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false)

    const current = action === 'create'
      ? null
      : await activeRules(trx, agencyId).select('rule.egcs_ay_reviewschema')
          .where('rule.id', '=', id).executeTakeFirst()
    if (current === undefined) return await ruleNotFound(event)
    if (!draft) {
      await update.set({ _deleted: true }).execute()
      return { success: true }
    }

    const review = await agencyAgreementReviews(trx, agencyId)
      .innerJoin('Common_Publication_Version as reviewVersion', 'reviewVersion.id', 'publication.egcs_cn_currentversion')
      .select(['checklist.egcs_cn_reviewtype as type', 'reviewVersion.egcs_cn_definition as definition'])
      .where('checklist.id', '=', draft.egcs_ay_reviewschema)
      .where('publication.egcs_cn_state', 'in', current?.egcs_ay_reviewschema === draft.egcs_ay_reviewschema
        ? ['published', 'retired']
        : ['published'])
      .executeTakeFirst()
    if (!review) return await badRequest(event, 'INVALID_RULE_CHECKLIST', 'review_clause_rules.invalid_checklist')
    const result = draft.egcs_ay_result ?? null
    const outcome = draft.egcs_ay_outcome ?? null
    const strategy = draft.egcs_ay_strategy ?? null
    const validTrigger = review.type === 'checklist'
      ? result !== null && outcome === null && strategy === null
      : result === null && readAssessmentClauseOutcomes(review.definition)
        .some(item => item.id === outcome && item.strategies.some(option => option.value === strategy))
    if (!validTrigger) return await badRequest(event, 'INVALID_RULE_RESULT', 'review_clause_rules.invalid_outcome')
    const values = { ...draft, egcs_ay_result: result, egcs_ay_outcome: outcome, egcs_ay_strategy: strategy }
    const clause = await publishedAgencyClauses(trx, agencyId).select('clause.id')
      .where('clause.id', '=', draft.egcs_ay_clause).executeTakeFirst()
    if (!clause) return await badRequest(event, 'INVALID_RULE_CLAUSE', 'review_clause_rules.invalid_clause')

    let duplicates = activeRules(trx, agencyId).select('rule.id')
      .where('rule.egcs_ay_reviewschema', '=', draft.egcs_ay_reviewschema)
      .where('rule.egcs_ay_result', result === null ? 'is' : '=', result)
      .where('rule.egcs_ay_outcome', outcome === null ? 'is' : '=', outcome)
      .where('rule.egcs_ay_strategy', strategy === null ? 'is' : '=', strategy)
      .where('rule.egcs_ay_clause', '=', draft.egcs_ay_clause)
    if (action === 'update') duplicates = duplicates.where('rule.id', '!=', id)
    if (await duplicates.executeTakeFirst()) return await badRequest(event, 'DUPLICATE_REVIEW_CLAUSE_RULE', 'review_clause_rules.duplicate')

    if (action === 'create') {
      return await trx.insertInto('Agency_Review_Clause_Rule')
        .values({ ...values, egcs_ay_organizationagency: agencyId }).returning('id').executeTakeFirstOrThrow()
    }
    return await update.set(values).returning('id').executeTakeFirstOrThrow()
  })
}
