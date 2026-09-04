import { authorize } from '~~/server/utils/authorize'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { runExtensionAgreementDeleteGuards } from '~~/server/utils/extensions'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const id = getRouterParam(event, 'id')

  if (!id) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const agreementContext = await resolveAgreementScopeContext(id, db)
  if (!agreementContext) {
    return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  await authorize(event, 'agreement', 'delete', async ({ context }) => {
    const canDelete = await canAccessAgreement(context, 'delete', agreementContext.scope, db)
    if (canDelete) return { bypass: true }
    return { denied: true }
  })

  await executeFreshAuthorizedAgreementWrite(event, db, id, agreementContext, async (trx, currentContext) => {
    await runExtensionAgreementDeleteGuards(event, trx, {
      agreementId: id,
      agencyId: currentContext.agencyId,
      streamId: currentContext.streamId
    })

    await trx
      .updateTable('Funding_Case_Agreement_Profile')
      .set({ _deleted: true })
      .where('id', '=', id)
      .where('_deleted', '=', false)
      .execute()
  }, { action: 'delete', blocksApprovalSubmission: true })

  return { success: true }
})
