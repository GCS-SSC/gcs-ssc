import { authorize } from '~~/server/utils/authorize'
import { assertActiveAgencyProfile, withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { cleanupTemplateUploads, createAgencyDocumentTemplate } from '~~/server/utils/document-template-routes'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import type { StoredFileRecord } from '~~/server/utils/file-storage'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  if (!agencyId) return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  if (!isPositivePostgresBigintText(agencyId)) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  await assertActiveAgencyProfile(event, agencyId)
  const uploads: StoredFileRecord[] = []
  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx =>
      await createAgencyDocumentTemplate(event, trx, agencyId, stored => uploads.push(stored))
    )
  } catch (error) {
    await cleanupTemplateUploads(event, event.context.$db, agencyId, uploads)
    throw error
  }
})
