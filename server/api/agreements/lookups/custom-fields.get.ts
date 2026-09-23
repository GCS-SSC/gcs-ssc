import { authorize } from '~~/server/utils/authorize'
import { authorizeAgreementStreamLookupRoute, prepareAgreementStreamLookupRoute } from '~~/server/utils/agreement-stream-lookup-routes'
import { readAssignedAgencyCustomFieldDefinitions, readAgreementCustomFieldSections } from '~~/server/utils/agreement-custom-fields'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

export default defineEventHandler(async event => {
  return await executeFreshReadSnapshot(event, async db => {
    const lookup = await prepareAgreementStreamLookupRoute(event, db)
    if ('statusCode' in lookup) return lookup
    await authorize(event, 'agreement', lookup.permissionAction, async ({ context }) =>
      await authorizeAgreementStreamLookupRoute(db, lookup.permissionAction, lookup.streamId, lookup.streamScope, lookup.agreementContext, context))
    return { items: await readAssignedAgencyCustomFieldDefinitions(db, lookup.streamId), sections: await readAgreementCustomFieldSections(db, lookup.streamId) }
  })
})
