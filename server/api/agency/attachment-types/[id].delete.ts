import { authorizeActiveAgencySubentity, softDeleteActiveAgencySubentity } from '~~/server/utils/agency-auth'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')

  const { agencyId } = await authorizeActiveAgencySubentity(
    event,
    'Common_Attachment_Types',
    id,
    'delete',
    { code: 'ATTACHMENT_TYPE_NOT_FOUND', key: 'apiErrors.agency.attachment_type_not_found' }
  )
  const deleted = await event.context.$db.transaction().execute(async trx =>
    await softDeleteActiveAgencySubentity(event, trx, 'Common_Attachment_Types', id, agencyId)
  )

  if (!deleted) return await notFound(event, 'ATTACHMENT_TYPE_NOT_FOUND', 'apiErrors.agency.attachment_type_not_found')
  return { success: true }
})
