import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { nanoid } from 'nanoid'
import type { Kysely } from 'kysely'
import type { Database } from '../../shared/types/database'
import { registerQueueHandler } from '../utils/queue-registry'
import { processNotificationBatch } from '../utils/notification-runtime'
import { resolveAuthRuntimeConfig } from '../utils/auth'

export default defineNitroPlugin(app => {
  registerQueueHandler({
    id: 'host:notifications',
    queueLevel: 1,
    run: async ({ db }) => {
      const { authUrl } = resolveAuthRuntimeConfig(useRuntimeConfig())
      await processNotificationBatch(db as Kysely<Database>, `queue:${nanoid()}`, 60, undefined, authUrl ?? '')
    }
  }, app)
})
