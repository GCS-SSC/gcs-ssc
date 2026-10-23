/** Host-owned background cadences; handler registrations select a level only. */
export const QUEUE_LEVELS = [
  { level: 0, cadenceMs: 10_000, retry: { initialDelayMs: 10_000, maximumDelayMs: 300_000 } },
  { level: 1, cadenceMs: 300_000, retry: { initialDelayMs: 300_000, maximumDelayMs: 3_600_000 } },
  { level: 2, cadenceMs: 1_800_000, retry: null },
  { level: 3, cadenceMs: 3_600_000, retry: null }
] as const satisfies ReadonlyArray<{
  level: number
  cadenceMs: number
  retry: { initialDelayMs: number; maximumDelayMs: number } | null
}>

export type QueueLevel = typeof QUEUE_LEVELS[number]['level']

/**
 * Resolves supported levels from the authoritative host catalog.
 * @param level - Requested queue level.
 * @returns The host definition when supported.
 */
export const getQueueLevel = (level: number) => QUEUE_LEVELS.find(definition => definition.level === level)

/**
 * Finds the aligned UTC cycle containing a timestamp.
 * @param date - Timestamp to align.
 * @param cadenceMs - Host-owned cycle duration.
 * @returns The beginning of the containing cycle.
 */
export const queueCycleAt = (date: Date, cadenceMs: number): Date =>
  new Date(Math.floor(date.getTime() / cadenceMs) * cadenceMs)

/**
 * Resolves a capped delay after consecutive completed failures.
 * @param definition - Host-owned policy for the selected level.
 * @param failures - Consecutive completed failures, starting at one.
 * @returns Delay before the next permitted aligned cycle, or zero for ordinary scheduling.
 */
export const queueRetryDelayMs = (definition: typeof QUEUE_LEVELS[number], failures: number): number => {
  if (!definition.retry) return 0
  const { initialDelayMs, maximumDelayMs } = definition.retry
  return Math.min(maximumDelayMs, initialDelayMs * 2 ** Math.min(Math.max(failures - 1, 0), 32))
}

/**
 * Finds the first shared beat at or after a retry deadline and after the consumed cycle.
 * @param options - Shared cadence and the handler's consumed cycle and retry deadline.
 * @param options.cadenceMs - Fixed host cadence.
 * @param options.lastCycleAt - Latest consumed aligned cycle.
 * @param options.retryNotBefore - Optional completion-based retry deadline.
 * @returns Effective scheduled retry time.
 */
export const queueNextRunAt = (options: {
  cadenceMs: number; lastCycleAt: Date; retryNotBefore: Date | null
}): Date => new Date(Math.max(
  options.lastCycleAt.getTime() + options.cadenceMs,
  options.retryNotBefore ? Math.ceil(options.retryNotBefore.getTime() / options.cadenceMs) * options.cadenceMs : 0
))
