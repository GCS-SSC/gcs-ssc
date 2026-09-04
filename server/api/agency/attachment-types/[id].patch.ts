import { AgencyAttachmentTypeSchema } from '~~/shared/types/schemas'
import { authorizeActiveAgencySubentity, withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')

  const { agencyId } = await authorizeActiveAgencySubentity(
    event,
    'Common_Attachment_Types',
    id,
    'update',
    { code: 'ATTACHMENT_TYPE_NOT_FOUND', key: 'apiErrors.agency.attachment_type_not_found' }
  )
  const body = await readValidatedBodyI18n(event, AgencyAttachmentTypeSchema.partial())

  let result
  try {
    result = await withActiveAgencyMutationTransaction(event, agencyId, async trx => await trx
      .updateTable('Common_Attachment_Types')
      .set(body)
      .where('id', '=', id)
      .where('egcs_cn_agency', '=', agencyId)
      .where('_deleted', '=', false)
      .returningAll()
      .executeTakeFirst())
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }

  if (!result) return await notFound(event, 'ATTACHMENT_TYPE_NOT_FOUND', 'apiErrors.agency.attachment_type_not_found')
  return result
})
