import type { H3Event } from 'h3'
import { sql, type Transaction } from 'kysely'
import { z } from 'zod'
import type { AgreementSubmissionEditSection } from '~~/shared/types/agreement-submission-database'
import type { Database } from '~~/shared/types/database'
import { SubmissionEditCommentSchema } from '~~/shared/types/schemas/funding-case-agreement'
import { forbidden } from './api-errors'
import { requireAuthContext } from './authorize'
import { parseI18n } from './api-validate'

/**
 * Records a staff edit on an external submission inside its financial write transaction.
 * @param event - Authenticated staff request.
 * @param trx - Transaction holding the Agreement and financial target locks.
 * @param target - Authorized financial record.
 * @param target.kind - Financial record kind.
 * @param target.id - Financial record identifier.
 * @param comments - Comment input for the edited amounts or changed custom field sections.
 * @returns After the comments are recorded, or when the target has no submission.
 */
export const recordSubmissionEditComments = async (
  event: H3Event,
  trx: Transaction<Database>,
  target: { kind: 'claim' | 'forecast'; id: string },
  comments: { kind: 'amounts' | 'details'; text: string | undefined }
    | { kind: 'custom-fields'; sections: ReadonlyMap<string, AgreementSubmissionEditSection>; texts: Record<string, string> | undefined }
) => {
  const submission = await trx.selectFrom('Funding_Case_Agreement_Submission')
    .select(['id', 'egcs_fc_sourcerevision', 'egcs_fc_formatversion'])
    .where('egcs_fc_target', '=', target.kind).where('egcs_fc_result', '=', target.id)
    .where('_deleted', '=', false).executeTakeFirst()
  if (!submission) return

  const descriptions = comments.kind === 'custom-fields'
    ? Object.entries((await parseI18n(event, z.object({
        customFieldComments: z.object(Object.fromEntries([...comments.sections.keys()].map(id => [id, SubmissionEditCommentSchema])))
      }), { customFieldComments: comments.texts ?? {} })).customFieldComments)
        .map(([key, description]) => ({ description, section: comments.sections.get(key) }))
    : [{ description: (await parseI18n(event, z.object({ editComment: SubmissionEditCommentSchema }), { editComment: comments.text })).editComment, section: undefined }]
  const auth = await requireAuthContext(event)
  const { resolveAssignmentCommonUserId } = await import('./entity-assignment')
  const actor = await resolveAssignmentCommonUserId(trx, auth.userId)
  if (!actor) return await forbidden(event)
  await trx.insertInto('Funding_Case_Agreement_Submission_Event').values(descriptions.map(({ description, section }) => ({
    egcs_fc_submission: submission.id,
    egcs_fc_kind: 'edited' as const,
    egcs_fc_sourcerevision: submission.egcs_fc_sourcerevision,
    egcs_fc_formatversion: submission.egcs_fc_formatversion,
    egcs_fc_payload: null,
    egcs_fc_description: description,
    egcs_fc_editsection: section ? sql<AgreementSubmissionEditSection>`${JSON.stringify(section)}::jsonb` : null,
    egcs_fc_actor: actor
  }))).execute()
}
