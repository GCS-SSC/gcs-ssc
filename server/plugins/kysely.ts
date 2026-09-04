export default defineNitroPlugin(async nitroApp => {
  const dbLease = await acquireDbLease()

  nitroApp.hooks.hook('request', event => {
    event.context.$db = dbLease.database
    event.context.$dbHealthCheck = dbLease.healthCheck
  })

  nitroApp.hooks.hookOnce('close', async () => {
    await dbLease.release()
  })
})
