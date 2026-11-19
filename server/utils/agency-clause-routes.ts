/* eslint-disable jsdoc/require-jsdoc -- Agency Clause route adapter. */
import { getRouterParam, type H3Event } from 'h3'
import type { Selectable, Transaction } from 'kysely'
import {
  AgencyClauseCreateSchema, AgencyClauseUpdateSchema, PublishedAgencyClauseSchema,
  type AgencyClauseItem, type AgencyClauseText
} from '~~/shared/types/schemas/agency-clause'
import type { Database } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { resolveCurrentCommonUser } from './additional-reviewer-runtime'
import { withActiveAgencyMutationTransaction, withActiveAgencyReadTransaction } from './agency-auth'
import { badRequest, notFound, throwApiError } from './api-errors'
import { readValidatedBodyI18n } from './api-validate'
import { authorize } from './authorize'
import { throwIfMappedConstraintError } from './database-constraint-errors'
import { publishDefinition, readPublicationMetadataBatch, retirePublication } from './system-publication'

type Action = 'list' | 'read' | 'create' | 'update' | 'publish' | 'retire' | 'delete'
type Clause = Selectable<Database['Agency_Clause']>
type ClauseText = Selectable<Database['Agency_Clause_Text']>

const selectClauses = (trx: Transaction<Database>, agencyId: string) =>
  trx.selectFrom('Agency_Clause').selectAll()
    .where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false)

const selectRows = (trx: Transaction<Database>) =>
  trx.selectFrom('Agency_Clause_Text').selectAll().where('_deleted', '=', false)
    .orderBy('egcs_ay_displayorder').orderBy('id')

const toDraftRow = (row: ClauseText): AgencyClauseText => ({
  id: String(row.id),
  egcs_ay_clause_en: row.egcs_ay_clause_en,
  egcs_ay_clause_fr: row.egcs_ay_clause_fr,
  egcs_ay_displayorder: row.egcs_ay_displayorder
})

const buildDefinition = (clause: Clause, rows: AgencyClauseText[]) => ({
  kind: 'agency_clause',
  clauseId: String(clause.id),
  agencyId: String(clause.egcs_ay_organizationagency),
  code: clause.egcs_ay_languageindependentcode,
  nameEn: clause.egcs_ay_name_en,
  nameFr: clause.egcs_ay_name_fr,
  descriptionEn: clause.egcs_ay_description_en,
  descriptionFr: clause.egcs_ay_description_fr,
  rows: rows.map(row => ({
    textEn: row.egcs_ay_clause_en,
    textFr: row.egcs_ay_clause_fr,
    displayOrder: row.egcs_ay_displayorder
  }))
})

const projectClauses = async (trx: Transaction<Database>, clauses: Clause[]): Promise<AgencyClauseItem[]> => {
  if (!clauses.length) return []
  const rowsByClause = new Map<string, AgencyClauseText[]>()
  for (const row of await selectRows(trx).where('egcs_ay_clause', 'in', clauses.map(clause => clause.id)).execute()) {
    const clauseId = String(row.egcs_ay_clause)
    const rows = rowsByClause.get(clauseId) ?? []
    rows.push(toDraftRow(row))
    rowsByClause.set(clauseId, rows)
  }
  const metadata = await readPublicationMetadataBatch(trx, clauses.map(clause => ({
    publicationId: String(clause.id),
    workingDefinition: buildDefinition(clause, rowsByClause.get(String(clause.id)) ?? [])
  })))
  return clauses.map(clause => {
    const id = String(clause.id)
    const publication = metadata.get(id)
    if (!publication) throw new Error(`Missing publication for Agency Clause ${id}`)
    return {
      id,
      egcs_ay_languageindependentcode: clause.egcs_ay_languageindependentcode,
      egcs_ay_name_en: clause.egcs_ay_name_en,
      egcs_ay_name_fr: clause.egcs_ay_name_fr,
      egcs_ay_description_en: clause.egcs_ay_description_en,
      egcs_ay_description_fr: clause.egcs_ay_description_fr,
      egcs_ay_active: clause.egcs_ay_active,
      rows: rowsByClause.get(id) ?? [],
      publicationState: publication.publicationState,
      hasUnpublishedChanges: publication.publicationState !== 'retired' && publication.hasUnpublishedChanges
    }
  })
}

const saveRows = async (event: H3Event, trx: Transaction<Database>, clauseId: string, rows: AgencyClauseText[]) => {
  const existing = await selectRows(trx).where('egcs_ay_clause', '=', clauseId).execute()
  const remaining = new Set(existing.map(row => String(row.id)))
  for (const { id, ...text } of rows) {
    if (id === undefined) {
      await trx.insertInto('Agency_Clause_Text').values({ ...text, egcs_ay_clause: clauseId }).execute()
    } else {
      if (!remaining.delete(id)) {
        return await badRequest(event, 'INVALID_CLAUSE_ROW', 'apiErrors.request.invalid_resource')
      }
      await trx.updateTable('Agency_Clause_Text').set(text).where('id', '=', id)
        .where('egcs_ay_clause', '=', clauseId).execute()
    }
  }
  if (remaining.size) {
    await trx.updateTable('Agency_Clause_Text').set({ _deleted: true })
      .where('egcs_ay_clause', '=', clauseId).where('id', 'in', [...remaining]).execute()
  }
}

const clauseNotFound = async (event: H3Event) => await notFound(event, 'CLAUSE_NOT_FOUND', 'clauses.not_found')
const invalidPublicationState = async (event: H3Event) => await throwApiError(event, {
  statusCode: 409, code: 'INVALID_CLAUSE_PUBLICATION_STATE', key: 'apiErrors.request.invalid_status'
})

const runAgencyClauseRoute = async (event: H3Event, action: Action) => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const clauseId = getRouterParam(event, 'clauseId') ?? ''
  if (!isPositivePostgresBigintText(agencyId)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }
  const reading = action === 'list' || action === 'read'
  await authorize(event, 'agency', reading ? 'read' : 'update', { type: 'agency', agencyId })

  if (action === 'list') {
    return await withActiveAgencyReadTransaction(event, agencyId, async trx => ({
      items: await projectClauses(trx, await selectClauses(trx, agencyId).orderBy('id', 'desc').execute())
    }))
  }
  if (action === 'create') {
    const { rows, ...draft } = await readValidatedBodyI18n(event, AgencyClauseCreateSchema)
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      const clause = await trx.insertInto('Agency_Clause').values({
        ...draft, egcs_ay_organizationagency: agencyId
      }).returningAll().executeTakeFirstOrThrow()
      await saveRows(event, trx, String(clause.id), rows)
      return (await projectClauses(trx, [clause]))[0]
    })
  }
  if (!isPositivePostgresBigintText(clauseId)) return await clauseNotFound(event)
  if (action === 'read') {
    return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
      const clause = await selectClauses(trx, agencyId).where('id', '=', clauseId).executeTakeFirst()
      if (!clause) return await clauseNotFound(event)
      return (await projectClauses(trx, [clause]))[0]
    })
  }

  const body = action === 'update' ? await readValidatedBodyI18n(event, AgencyClauseUpdateSchema) : null
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const clause = await selectClauses(trx, agencyId).where('id', '=', clauseId).forUpdate().executeTakeFirst()
    if (!clause) return await clauseNotFound(event)
    const publication = await trx.selectFrom('Common_Publication').select('egcs_cn_state')
      .where('id', '=', clauseId).where('egcs_cn_kind', '=', 'agency_clause').forUpdate().executeTakeFirstOrThrow()
    if (publication.egcs_cn_state === 'retired') return await invalidPublicationState(event)
    if (body) {
      const { rows, ...draft } = body
      const updated = await trx.updateTable('Agency_Clause').set(draft).where('id', '=', clauseId)
        .returningAll().executeTakeFirstOrThrow()
      await saveRows(event, trx, clauseId, rows)
      return (await projectClauses(trx, [updated]))[0]
    }
    if (action === 'delete') {
      if (publication.egcs_cn_state !== 'draft') return await invalidPublicationState(event)
      await trx.updateTable('Agency_Clause_Text').set({ _deleted: true })
        .where('egcs_ay_clause', '=', clauseId).where('_deleted', '=', false).execute()
      await trx.updateTable('Agency_Clause').set({ _deleted: true }).where('id', '=', clauseId).execute()
      await trx.updateTable('Common_Publication').set({ _deleted: true }).where('id', '=', clauseId).execute()
      return { success: true }
    }

    const actor = await resolveCurrentCommonUser(event, trx)
    if (!actor) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (action === 'retire') {
      return await retirePublication(trx, { publicationId: clauseId, kind: 'agency_clause', actorId: actor.id })
    }
    const rows = await selectRows(trx).where('egcs_ay_clause', '=', clauseId).execute()
    const parsed = PublishedAgencyClauseSchema.safeParse(buildDefinition(clause, rows.map(toDraftRow)))
    if (!parsed.success) return await badRequest(event, 'INCOMPLETE_CLAUSE', 'clauses.incomplete')
    return await publishDefinition(trx, { publicationId: clauseId, kind: 'agency_clause', definition: parsed.data, actorId: actor.id })
  })
}

export const agencyClauseRoute = async (event: H3Event, action: Action) => {
  try {
    return await runAgencyClauseRoute(event, action)
  } catch (error) {
    return await throwIfMappedConstraintError(event, error, ['23505'], {
      ay_uq_clauseagencycode: { code: 'DUPLICATE_CLAUSE_CODE', key: 'clauses.duplicate_code' }
    })
  }
}
