/* eslint-disable jsdoc/require-jsdoc -- Agreement note route helpers. */
import type { H3Event } from 'h3'
import { authorizeAgreementResource } from './agreement'
import { executeFreshAuthorizedAgreementWrite } from './agreement-write-transaction'
import { assertAgreementExists } from './agreement-child-resources'
import { notFound } from './api-errors'
import { resolveAssignmentCommonUserId } from './entity-assignment'
import { executeFreshReadSnapshot } from './fresh-read-snapshot'
import { escapeLikePattern } from './sql-like'
import { getValidatedQueryI18n, parseI18n, readValidatedBodyI18n } from './api-validate'
import { FundingCaseAgreementNoteCreateSchema, FundingCaseAgreementNotePatchSchema, PaginationSchema } from '~~/shared/types/schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const parentId = (event: H3Event) => getRouterParam(event, 'id') ?? ''
const noteId = (event: H3Event) => getRouterParam(event, 'noteId') ?? ''
const missing = async (event: H3Event) => await notFound(event, 'AGREEMENT_NOTE_NOT_FOUND', 'apiErrors.agreement.not_found')

export const listAgreementNotes = async (event: H3Event) => await executeFreshReadSnapshot(event, async db => {
  const agreementId = parentId(event)
  if (!isPositivePostgresBigintText(agreementId)) return await missing(event)
  await authorizeAgreementResource(event, 'read', agreementId, db, { freshAuth: true })
  await assertAgreementExists(event, agreementId, db)
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const base = db.selectFrom('Funding_Case_Agreement_Note')
    .where('Funding_Case_Agreement_Note.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Note._deleted', '=', false)
  const filtered = search
    ? base.where(eb => eb.or([
        eb('egcs_fc_subject_en', 'ilike', `%${escapeLikePattern(search)}%`),
        eb('egcs_fc_subject_fr', 'ilike', `%${escapeLikePattern(search)}%`),
        eb('egcs_fc_body_en', 'ilike', `%${escapeLikePattern(search)}%`),
        eb('egcs_fc_body_fr', 'ilike', `%${escapeLikePattern(search)}%`)
      ]))
    : base
  const [items, count] = await Promise.all([
    filtered.innerJoin('Common_User as author', 'author.id', 'Funding_Case_Agreement_Note.egcs_fc_createdby')
      .innerJoin('user as author_user', 'author_user.id', 'author.egcs_cn_auth_user_id')
      .innerJoin('Common_User as editor', 'editor.id', 'Funding_Case_Agreement_Note.egcs_fc_updatedby')
      .innerJoin('user as editor_user', 'editor_user.id', 'editor.egcs_cn_auth_user_id')
      .selectAll('Funding_Case_Agreement_Note').select(['author_user.name as author_name', 'editor_user.name as modified_by_name'])
      .orderBy('egcs_fc_createdat', 'desc').orderBy('Funding_Case_Agreement_Note.id', 'desc')
      .limit(limit).offset((page - 1) * limit).execute(),
    filtered.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
  ])
  const total = Number(count?.total ?? 0)
  return { items, total, stats: { total, active: total }, page, limit }
})

export const createAgreementNote = async (event: H3Event) => {
  const agreementId = parentId(event)
  if (!isPositivePostgresBigintText(agreementId)) return await missing(event)
  const db = event.context.$db
  const context = await authorizeAgreementResource(event, 'create', agreementId, db)
  if (!context) return await missing(event)
  const body = await readValidatedBodyI18n(event, FundingCaseAgreementNoteCreateSchema)
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async (trx, _, auth) => {
    const actor = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!actor) return await missing(event)
    return await trx.insertInto('Funding_Case_Agreement_Note').values({
      egcs_fc_fundingagreement: agreementId,
      egcs_fc_subject_en: body.egcs_fc_subject_en ?? null,
      egcs_fc_subject_fr: body.egcs_fc_subject_fr ?? null,
      egcs_fc_body_en: body.egcs_fc_body_en ?? null,
      egcs_fc_body_fr: body.egcs_fc_body_fr ?? null,
      egcs_fc_createdby: actor, egcs_fc_updatedby: actor
    }).returningAll().executeTakeFirstOrThrow()
  }, { action: 'create' })
}

export const updateAgreementNote = async (event: H3Event) => {
  const agreementId = parentId(event)
  if (!isPositivePostgresBigintText(agreementId) || !isPositivePostgresBigintText(noteId(event))) return await missing(event)
  const db = event.context.$db
  const context = await authorizeAgreementResource(event, 'update', agreementId, db)
  if (!context) return await missing(event)
  const patch = await readValidatedBodyI18n(event, FundingCaseAgreementNotePatchSchema)
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async (trx, _, auth) => {
    const existing = await trx.selectFrom('Funding_Case_Agreement_Note').selectAll()
      .where('id', '=', noteId(event)).where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!existing) return await missing(event)
    const merged = await parseI18n(event, FundingCaseAgreementNoteCreateSchema, { ...existing, ...patch })
    const actor = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!actor) return await missing(event)
    return await trx.updateTable('Funding_Case_Agreement_Note').set({
      egcs_fc_subject_en: merged.egcs_fc_subject_en ?? null,
      egcs_fc_subject_fr: merged.egcs_fc_subject_fr ?? null,
      egcs_fc_body_en: merged.egcs_fc_body_en ?? null,
      egcs_fc_body_fr: merged.egcs_fc_body_fr ?? null,
      egcs_fc_updatedby: actor, egcs_fc_updatedat: new Date()
    }).where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow()
  }, { action: 'update' })
}

export const deleteAgreementNote = async (event: H3Event) => {
  const agreementId = parentId(event)
  if (!isPositivePostgresBigintText(agreementId) || !isPositivePostgresBigintText(noteId(event))) return await missing(event)
  const db = event.context.$db
  const context = await authorizeAgreementResource(event, 'delete', agreementId, db)
  if (!context) return await missing(event)
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async (trx, _, auth) => {
    const existing = await trx.selectFrom('Funding_Case_Agreement_Note').select('id')
      .where('id', '=', noteId(event)).where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!existing) return await missing(event)
    const actor = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!actor) return await missing(event)
    await trx.updateTable('Funding_Case_Agreement_Note').set({ _deleted: true, egcs_fc_updatedby: actor, egcs_fc_updatedat: new Date() })
      .where('id', '=', existing.id).execute()
    return { success: true }
  }, { action: 'delete' })
}
