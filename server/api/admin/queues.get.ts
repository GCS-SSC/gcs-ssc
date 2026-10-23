import { setHeader } from 'h3'
import { authorize } from '~~/server/utils/authorize'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { readQueueSnapshot } from '~~/server/utils/queue-registry'

export default defineEventHandler(async event => await executeFreshReadSnapshot(event, async db => {
  await authorize(event, 'system', 'read', { type: 'global' })
  setHeader(event, 'Cache-Control', 'no-store')
  return await readQueueSnapshot(db, useNitroApp())
}, { authorization: 'snapshot' }))
