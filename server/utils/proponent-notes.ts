/* eslint-disable jsdoc/require-jsdoc -- Route helpers express the note authorization boundary. */
import type { H3Event } from 'h3'
import { sql } from 'kysely'
import { authorize, requireAuthContext } from './authorize'
import { notFound } from './api-errors'
import { canAccessApplicantRecipient, executeFreshAuthorizedApplicantRecipientWrite, resolveApplicantRecipientVisibility } from './applicant-recipient-auth'
import { assertApplicantRecipientProfileExists } from './applicant-recipient-child-resources'
import { resolveAssignmentCommonUserId } from './entity-assignment'
import { executeFreshReadSnapshot } from './fresh-read-snapshot'
import { escapeLikePattern } from './sql-like'
import { getValidatedQueryI18n, parseI18n, readValidatedBodyI18n } from './api-validate'
import { ApplicantRecipientNoteCreateSchema, ApplicantRecipientNotePatchSchema, PaginationSchema } from '~~/shared/types/schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const noteId = (event: H3Event) => getRouterParam(event, 'noteId') ?? ''
const parentId = (event: H3Event) => getRouterParam(event, 'id') ?? ''
const noteNotFound = async (event: H3Event) => await notFound(event, 'PROPONENT_NOTE_NOT_FOUND', 'apiErrors.request.not_found')

const authorizeParent = async (event: H3Event, action: 'read' | 'create' | 'update' | 'delete') => {
  const id = parentId(event)
  if (!isPositivePostgresBigintText(id)) return await noteNotFound(event)
  return await authorize(event, 'applicant_recipient', action, async ({ context }) =>
    await canAccessApplicantRecipient(context, id, action, event.context.$db)
      ? { bypass: true as const, data: context }
      : { denied: true as const })
}

export const listProponentNotes = async (event: H3Event) => {
  await requireAuthContext(event)
  return await executeFreshReadSnapshot(event, async db => {
    const auth = await authorizeParent(event, 'read')
    const visibility = await resolveApplicantRecipientVisibility(auth.data!, 'read', db)
    const profile = await assertApplicantRecipientProfileExists(event, parentId(event), db)
    if (!profile || !('id' in profile)) return profile
    const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
    if (!visibility.hasGlobalAccess && visibility.agencyIds.length === 0) {
      return { items: [], total: 0, stats: { total: 0, active: 0 }, page, limit }
    }
    const agencyPredicate = visibility.hasGlobalAccess
      ? sql`TRUE`
      : sql`note.egcs_ar_agency IN (${sql.join(visibility.agencyIds)})`
    const searchTerm = search ? `%${escapeLikePattern(search)}%` : ''
    const searchPredicate = search
      ? sql`(note.egcs_ar_subject_en ILIKE ${searchTerm} OR note.egcs_ar_subject_fr ILIKE ${searchTerm}
          OR note.egcs_ar_body_en ILIKE ${searchTerm} OR note.egcs_ar_body_fr ILIKE ${searchTerm})`
      : sql`TRUE`
    const [rows, count] = await Promise.all([
      sql<Record<string, unknown>>`
        SELECT note.*, creator.name AS author_name, editor.name AS modified_by_name,
          agency.egcs_ay_name_en AS agency_name_en, agency.egcs_ay_name_fr AS agency_name_fr
        FROM "Applicant_Recipient_Note" note
        JOIN "Agency_Profile" agency ON agency.id = note.egcs_ar_agency
        JOIN "Common_User" created_user ON created_user.id = note.egcs_ar_createdby
        JOIN "user" creator ON creator.id = created_user.egcs_cn_auth_user_id
        JOIN "Common_User" modified_user ON modified_user.id = note.egcs_ar_updatedby
        JOIN "user" editor ON editor.id = modified_user.egcs_cn_auth_user_id
        WHERE note.egcs_ar_applicantrecipient = ${parentId(event)} AND NOT note._deleted
          AND ${agencyPredicate} AND ${searchPredicate}
        ORDER BY note.egcs_ar_createdat DESC, note.id DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}`.execute(db),
      sql<{ total: string }>`SELECT count(*)::text AS total FROM "Applicant_Recipient_Note" note
        WHERE note.egcs_ar_applicantrecipient = ${parentId(event)} AND NOT note._deleted
          AND ${agencyPredicate} AND ${searchPredicate}`.execute(db)
    ])
    const total = Number(count.rows[0]?.total ?? 0)
    return { items: rows.rows, total, stats: { total, active: total }, page, limit }
  })
}

export const createProponentNote = async (event: H3Event) => {
  await requireAuthContext(event)
  await authorizeParent(event, 'create')
  const validated = await readValidatedBodyI18n(event, ApplicantRecipientNoteCreateSchema)
  const db = event.context.$db
  return await executeFreshAuthorizedApplicantRecipientWrite(event, db, parentId(event), 'create', async (trx, auth) => {
    const agencyId = validated.egcs_ar_agency
    if (!auth.userAbilities.authorize('applicant_recipient', 'create', { type: 'agency', agencyId })) return await noteNotFound(event)
    const agency = await trx.selectFrom('Agency_Profile').select('id').where('id', '=', agencyId)
      .where('_deleted', '=', false).where('egcs_ay_active', '=', true).forShare().executeTakeFirst()
    if (!agency) return await noteNotFound(event)
    const actorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    return await trx.insertInto('Applicant_Recipient_Note').values({
      egcs_ar_applicantrecipient: parentId(event), egcs_ar_agency: agencyId,
      egcs_ar_subject_en: validated.egcs_ar_subject_en ?? null,
      egcs_ar_subject_fr: validated.egcs_ar_subject_fr ?? null,
      egcs_ar_body_en: validated.egcs_ar_body_en ?? null,
      egcs_ar_body_fr: validated.egcs_ar_body_fr ?? null,
      egcs_ar_createdby: actorId, egcs_ar_updatedby: actorId
    }).returningAll().executeTakeFirstOrThrow()
  })
}

export const updateProponentNote = async (event: H3Event) => {
  await requireAuthContext(event)
  await authorizeParent(event, 'update')
  if (!isPositivePostgresBigintText(noteId(event))) return await noteNotFound(event)
  const patch = await readValidatedBodyI18n(event, ApplicantRecipientNotePatchSchema)
  return await executeFreshAuthorizedApplicantRecipientWrite(event, event.context.$db, parentId(event), 'update', async (trx, auth) => {
    const existing = await trx.selectFrom('Applicant_Recipient_Note').selectAll()
      .where('id', '=', noteId(event)).where('egcs_ar_applicantrecipient', '=', parentId(event))
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!existing || !auth.userAbilities.authorize('applicant_recipient', 'update', {
      type: 'agency', agencyId: String(existing.egcs_ar_agency)
    })) return await noteNotFound(event)
    const merged = await parseI18n(event, ApplicantRecipientNoteCreateSchema, {
      ...existing, ...patch
    })
    const actorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    return await trx.updateTable('Applicant_Recipient_Note').set({
      egcs_ar_subject_en: merged.egcs_ar_subject_en ?? null,
      egcs_ar_subject_fr: merged.egcs_ar_subject_fr ?? null,
      egcs_ar_body_en: merged.egcs_ar_body_en ?? null,
      egcs_ar_body_fr: merged.egcs_ar_body_fr ?? null,
      egcs_ar_updatedby: actorId, egcs_ar_updatedat: new Date()
    }).where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow()
  })
}

export const deleteProponentNote = async (event: H3Event) => {
  await requireAuthContext(event)
  await authorizeParent(event, 'delete')
  if (!isPositivePostgresBigintText(noteId(event))) return await noteNotFound(event)
  return await executeFreshAuthorizedApplicantRecipientWrite(event, event.context.$db, parentId(event), 'delete', async (trx, auth) => {
    const existing = await trx.selectFrom('Applicant_Recipient_Note').select(['id', 'egcs_ar_agency'])
      .where('id', '=', noteId(event)).where('egcs_ar_applicantrecipient', '=', parentId(event))
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!existing || !auth.userAbilities.authorize('applicant_recipient', 'delete', {
      type: 'agency', agencyId: String(existing.egcs_ar_agency)
    })) return await noteNotFound(event)
    const actorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!actorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    await trx.updateTable('Applicant_Recipient_Note').set({ _deleted: true, egcs_ar_updatedby: actorId, egcs_ar_updatedat: new Date() })
      .where('id', '=', existing.id).execute()
    return { success: true }
  })
}
