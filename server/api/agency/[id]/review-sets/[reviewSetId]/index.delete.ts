import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id') ?? ''
  const reviewSetupId = getRouterParam(event, 'reviewSetId') ?? ''
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  if (!isPositivePostgresBigintText(reviewSetupId)) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')

  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const publication = await trx.selectFrom('Common_Publication')
      .innerJoin('Common_Review_Set_Setup', 'Common_Review_Set_Setup.id', 'Common_Publication.id')
      .select(['Common_Publication.id', 'Common_Publication.egcs_cn_state'])
      .where('Common_Publication.id', '=', reviewSetupId)
      .where('Common_Review_Set_Setup.egcs_cn_agency', '=', agencyId)
      .where('Common_Publication._deleted', '=', false)
      .where('Common_Review_Set_Setup._deleted', '=', false)
      .forUpdate('Common_Publication')
      .executeTakeFirst()
    if (!publication) {
      return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
    }
    if (publication.egcs_cn_state !== 'draft') {
      return await badRequest(event, 'REVIEW_SETUP_DELETE_NOT_ALLOWED', 'apiErrors.request.invalid_status')
    }
    await trx.updateTable('Common_Publication').set({ _deleted: true }).where('id', '=', reviewSetupId).execute()
    const updatedSetup = await trx
      .updateTable('Common_Review_Set_Setup')
      .set({ _deleted: true })
      .where('id', '=', reviewSetupId)
      .where('egcs_cn_agency', '=', agencyId)
      .where('_deleted', '=', false)
      .returning('id')
      .executeTakeFirst()

    if (updatedSetup) {
      await trx
        .updateTable('Common_Review_Setup')
        .set({ _deleted: true })
        .where('egcs_cn_reviewset', '=', reviewSetupId)
        .where('_deleted', '=', false)
        .execute()
    }

    if (!updatedSetup) {
      return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
    }
    return { success: true }
  }
  )
})
