import { sql } from 'kysely'
import { authorizeGroup, authorizeFreshGroup } from '~~/server/utils/groups'
import { badRequest, notFound } from '~~/server/utils/api-errors'

// eslint-disable-next-line local/require-authorize -- authorizeGroup applies the agency-scoped group grant.
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeGroup(event, event.context.$db, id, 'delete')
  return await event.context.$db.transaction().execute(async trx => {
    await authorizeFreshGroup(event, trx, id, 'delete')
    // Assignment writers lock this row before checking membership and writing a reference.
    // Lock before scanning references so either operation sees the other's committed result.
    const group = await trx.selectFrom('Common_Group').select('id')
      .where('id', '=', id).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!group) return await notFound(event, 'GROUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const references = await Promise.all([
      trx.selectFrom('Common_Data_Collection').select('id').where('egcs_cn_group', '=', id).where('_deleted', '=', false).executeTakeFirst(),
      trx.selectFrom('Common_Recommendation').select('id').where('egcs_cn_group', '=', id).where('_deleted', '=', false).executeTakeFirst(),
      trx.selectFrom('Common_Workflow_Setup_Member_Owner as owner')
        .innerJoin('Common_Workflow_Setup_Member as member', 'member.id', 'owner.egcs_cn_workflowsetupmember')
        .innerJoin('Common_Workflow_Setup as workflow', 'workflow.id', 'member.egcs_cn_workflowsetup')
        .select('owner.id').where('owner.egcs_cn_defaultgroup', '=', id)
        .where('owner._deleted', '=', false).where('member._deleted', '=', false).where('workflow._deleted', '=', false).executeTakeFirst(),
      trx.selectFrom('Common_Review').select('id').where('egcs_cn_group', '=', id).where('_deleted', '=', false).executeTakeFirst(),
      trx.selectFrom('Common_Review_Setup').select('id').where('egcs_cn_defaultgroup', '=', id).where('_deleted', '=', false).executeTakeFirst(),
      trx.selectFrom('Common_Approval_Step').select('id').where('egcs_cn_defaultgroup', '=', id).where('_deleted', '=', false).executeTakeFirst(),
      trx.selectFrom('Common_Approval').select('id').where('egcs_cn_assignedgroup', '=', id).executeTakeFirst(),
      trx.selectFrom('Common_Approval').select('id').where('egcs_cn_defaultgroup', '=', id).executeTakeFirst(),
      trx.selectFrom('Common_Additional_Reviewers').select('id').where('egcs_cn_group', '=', id).where('_deleted', '=', false).executeTakeFirst(),
      trx.selectFrom('Funding_Case_Intake_Profile').select('id')
        .where('egcs_fi_group', '=', id).where('_deleted', '=', false).executeTakeFirst()
    ])
    const publishedWorkflowReference = await sql<{ id: string }>`
      SELECT workflow.id FROM "Common_Workflow_Setup" workflow
      JOIN "Common_Publication" publication ON publication.id = workflow.id
        AND publication.egcs_cn_kind = 'workflow_setup' AND publication.egcs_cn_state = 'published' AND NOT publication._deleted
      JOIN "Common_Publication_Version" version ON version.id = publication.egcs_cn_currentversion
      WHERE NOT workflow._deleted AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(version.egcs_cn_definition->'members') member,
          jsonb_array_elements(member->'owners') owner
        WHERE owner->>'defaultGroup' = ${id}
      ) LIMIT 1
    `.execute(trx)
    if (publishedWorkflowReference.rows.length || references.some(Boolean)) return await badRequest(event, 'GROUP_IN_USE', 'apiErrors.request.invalid')
    await trx.updateTable('Common_Group_Member').set({ _deleted: true }).where('egcs_cn_group', '=', id).where('_deleted', '=', false).execute()
    await trx.updateTable('Common_Group').set({ _deleted: true }).where('id', '=', id).execute()
    return { id }
  })
})
