import type { H3Event } from 'h3'
import { authorize } from '~~/server/utils/authorize'
import { dispatchExtensionServerRoute } from '~~/server/utils/extension-dispatch-route'

export default defineEventHandler(async (event: H3Event) => {
  const authContext = await authorize(event, 'system', 'read', async () => ({ bypass: true }))

  return await dispatchExtensionServerRoute(event, authContext)
})
