import { QUEUE_LEVELS } from '../../shared/utils/queue-levels'

/**
 * Reads queue switches once at runner startup; explicit values override platform defaults.
 * @param env - Deployment environment.
 * @returns Enabled host queue definitions.
 */
export const resolveEnabledQueueLevels = (env: NodeJS.ProcessEnv = process.env) => QUEUE_LEVELS.filter(({ level }) => {
  const key = `GCS_QUEUE_LEVEL_${level}_ENABLED`
  const value = env[key]
  if (value === 'true') return true
  if (value === 'false') return false
  if (value !== undefined) throw new Error(`${key} must be true or false`)
  return !(env.RAILWAY_PROJECT_ID && level < 2)
})

/**
 * Keeps fast queues responsive while letting slow-only deployments remain network-idle.
 * @param levels - Enabled host definitions.
 * @param now - Current application clock in milliseconds.
 * @returns Delay until the next housekeeping pass.
 */
export const queuePollDelayMs = (levels: ReturnType<typeof resolveEnabledQueueLevels>, now: number): number => {
  const cadence = Math.min(...levels.map(level => level.cadenceMs))
  return cadence <= 300_000 ? 5000 : cadence - now % cadence
}
