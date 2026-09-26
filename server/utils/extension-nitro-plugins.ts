import type { Kysely } from 'kysely'
import { loadGcsExtensionModule } from '#gcs-extensions/server-registry'
import type { Database } from '~~/shared/types/database'
import type { GcsRegisteredExtension } from '~~/shared/utils/extensions'

type NitroApp = ReturnType<typeof import('nitropack/runtime').useNitroApp>

// Nitro keeps the app object across some development module reloads. Store activation
// on that object so re-importing this host module cannot register duplicate hooks.
const activationKey = Symbol.for('gcs-ssc.extension-nitro-plugin-activations')

/**
 * Returns the per-app activation registry retained across module reloads.
 * @param app - Current Nitro application.
 * @returns Active plugin promises for this app.
 */
const activationsFor = (app: NitroApp): Map<string, Promise<void>> => {
  const existing = Reflect.get(app, activationKey) as Map<string, Promise<void>> | undefined
  if (existing) return existing
  const active = new Map<string, Promise<void>>()
  Object.defineProperty(app, activationKey, { value: active })
  return active
}

/**
 * Starts installed extension hooks only after their enabled Agency migrations have completed.
 * @param db - Migrated application database.
 * @param app - Current Nitro application receiving extension hooks.
 * @param extensions - Validated installed extension registry.
 */
export const activateEnabledExtensionNitroPlugins = async (
  db: Kysely<Database>,
  app: NitroApp,
  extensions: GcsRegisteredExtension[]
): Promise<void> => {
  const enabledRows = await db.selectFrom('extensions.agency_enablement as enablement')
    .innerJoin('Agency_Profile as agency', 'agency.id', 'enablement.agency_id')
    .select('enablement.extension_key')
    .where('enablement.enabled', '=', true)
    .where('enablement._deleted', '=', false)
    .where('agency._deleted', '=', false)
    .distinct()
    .execute()
  const enabledKeys = new Set(enabledRows.map(row => row.extension_key))
  const active = activationsFor(app)

  for (const extension of extensions) {
    if (!extension.nitroPlugin || !enabledKeys.has(extension.key)) continue
    let activation = active.get(extension.key)
    if (!activation) {
      activation = (async () => {
        const module = await loadGcsExtensionModule(extension.nitroPlugin!.id) as {
          default?: (app: NitroApp) => Promise<void> | void
        }
        if (typeof module.default !== 'function') {
          throw new Error(`Extension "${extension.key}" Nitro plugin must export a default function`)
        }
        await module.default(app)
      })()
      active.set(extension.key, activation)
    }
    try {
      await activation
    } catch (error) {
      if (active.get(extension.key) === activation) active.delete(extension.key)
      throw error
    }
  }
}
