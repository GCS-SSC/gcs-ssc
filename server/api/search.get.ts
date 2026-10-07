import { requireAuthContext } from '~~/server/utils/authorize'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { searchRecords } from '~~/server/utils/search-records'
import { searchAssignedWork } from '~~/server/utils/assigned-work-search'
import { SearchQuerySchema } from '~~/shared/types/schemas/search'
import type { SearchResponse } from '~~/shared/types/search'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const { search = '' } = await getValidatedQueryI18n(event, SearchQuerySchema)
  return await executeFreshReadSnapshot(event, async db => {
    const auth = await requireAuthContext(event)
    // Both projections use this single fresh snapshot. Empty input never visits record sources.
    const records = search ? await searchRecords(db, auth, search) : { items: [], hasMore: false }
    const myWork = await searchAssignedWork(db, event, auth, search)
    return {
      records: records.items,
      myWork: myWork.items,
      hasMore: { records: records.hasMore, myWork: myWork.hasMore }
    } satisfies SearchResponse
  }, { authorization: 'snapshot' })
})
