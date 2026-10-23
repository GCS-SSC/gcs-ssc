import { acquireDbLease } from '../utils/db'
import { registerAuditQueueHandlers } from '../utils/audit-queue'

export default defineNitroPlugin(async app => {
  let stopped = false
  let activeLease: Awaited<ReturnType<typeof acquireDbLease>> | undefined
  let unregister: (() => void) | undefined
  app.hooks.hookOnce('close', async () => {
    stopped = true
    unregister?.()
    const closingLease = activeLease
    activeLease = undefined
    await closingLease?.release()
  })
  const lease = await acquireDbLease()
  if (stopped) {
    await lease.release()
    return
  }
  activeLease = lease
  try {
    unregister = registerAuditQueueHandlers(lease.database, app)
  } catch (error) {
    unregister?.()
    activeLease = undefined
    await lease.release()
    throw error
  }
})
