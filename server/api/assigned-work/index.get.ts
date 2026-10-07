import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { queryAssignedWorkDashboard } from '~~/server/utils/assigned-work-query'
import { AssignedWorkQuerySchema } from '~~/shared/types/schemas'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const query = await getValidatedQueryI18n(event, AssignedWorkQuerySchema)
  return await event.context.$db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    return await queryAssignedWorkDashboard(trx, event, auth, query)
  })
})
