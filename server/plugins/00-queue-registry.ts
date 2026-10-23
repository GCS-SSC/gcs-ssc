import { getRegisteredExtensions } from '../utils/extensions'
import { initializeQueueRegistry } from '../utils/queue-registry'

export default defineNitroPlugin(async app => {
  initializeQueueRegistry(app, await getRegisteredExtensions())
})
