/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Internal scheduling helpers have explicit typed contracts. */
import { randomUUID } from 'node:crypto'
import { sql, type Kysely, type Selectable } from 'kysely'
import type { ClusterQueueHandler, HostQueueContext } from './queue-registry'
import type { Database } from '../../shared/types/database'
import { getQueueLevel, QUEUE_LEVELS, queueRetryDelayMs } from '../../shared/utils/queue-levels'

export const QUEUE_LEASE_MS = 120_000

const currentCycleSql = (cadenceMs: number) =>
  sql<Date>`to_timestamp(floor(extract(epoch from statement_timestamp()) * 1000 / ${cadenceMs}) * ${cadenceMs} / 1000)`

/** Publishes shared aligned cycles; new subscriptions join the next future beat. */
export const prepareQueueSchedules = async (db: Kysely<Database>, handlers: ClusterQueueHandler[]): Promise<void> => {
  await db.transaction().execute(async trx => {
    for (const definition of QUEUE_LEVELS) {
      const cycle = currentCycleSql(definition.cadenceMs)
      await trx.insertInto('background_queue_schedule').values({
        queue_level: definition.level,
        next_run_at: sql<Date>`${cycle} + ${definition.cadenceMs} * interval '1 millisecond'`
      }).onConflict(conflict => conflict.column('queue_level').doNothing()).execute()
    }
    // Plugin activation order can differ across replicas; acquire handler locks consistently.
    for (const handler of [...handlers].sort((first, second) => first.id.localeCompare(second.id))) {
      const definition = getQueueLevel(handler.queueLevel)
      if (!definition) throw new Error(`Invalid queue level for ${handler.id}: ${handler.queueLevel}`)
      await sql`INSERT INTO background_queue_handler (handler_id, queue_level, last_cycle_at)
        SELECT ${handler.id}, queue_level,
          greatest(current_cycle_at, ${currentCycleSql(definition.cadenceMs)})
        FROM background_queue_schedule WHERE queue_level = ${handler.queueLevel}
        ON CONFLICT (handler_id) DO UPDATE SET
          queue_level = EXCLUDED.queue_level,
          last_cycle_at = EXCLUDED.last_cycle_at,
          attempt_count = 0, last_error = NULL, retry_not_before = NULL,
          lease_owner = NULL, lease_expires_at = NULL, lease_cycle_at = NULL,
          updated_at = clock_timestamp()
        WHERE background_queue_handler.queue_level <> EXCLUDED.queue_level
          AND (background_queue_handler.lease_owner IS NULL
            OR background_queue_handler.lease_expires_at <= clock_timestamp())`.execute(trx)
    }
    for (const definition of QUEUE_LEVELS) {
      const cycle = currentCycleSql(definition.cadenceMs)
      await trx.updateTable('background_queue_schedule').set({
        current_cycle_at: cycle,
        next_run_at: sql<Date>`${cycle} + ${definition.cadenceMs} * interval '1 millisecond'`,
        updated_at: sql<Date>`clock_timestamp()`
      }).where('queue_level', '=', definition.level)
        .where('next_run_at', '<=', sql<Date>`statement_timestamp()`).execute()
    }
  })
}

/** Claims one current shared cycle without allowing concurrent ordinary execution. */
export const claimQueueHandler = async (db: Kysely<Database>, handler: ClusterQueueHandler, owner: string) => {
  const result = await sql<Selectable<Database['background_queue_handler']>>`
    UPDATE background_queue_handler AS handler SET
      lease_owner = ${owner},
      lease_expires_at = clock_timestamp() + ${QUEUE_LEASE_MS} * interval '1 millisecond',
      lease_cycle_at = schedule.current_cycle_at,
      updated_at = clock_timestamp()
    FROM background_queue_schedule AS schedule
    WHERE handler.handler_id = ${handler.id}
      AND handler.queue_level = ${handler.queueLevel}
      AND schedule.queue_level = handler.queue_level
      AND schedule.current_cycle_at IS NOT NULL
      AND (handler.last_cycle_at IS NULL OR handler.last_cycle_at < schedule.current_cycle_at)
      AND (handler.retry_not_before IS NULL OR handler.retry_not_before <= schedule.current_cycle_at)
      AND (handler.lease_owner IS NULL OR handler.lease_expires_at <= clock_timestamp())
    RETURNING handler.*`.execute(db)
  return result.rows[0]
}

/** Renews an individual lease while work runs, then consumes through the current cycle. */
export const runQueueHandler = async (
  db: Kysely<Database>, handler: ClusterQueueHandler, context: HostQueueContext, mayDispatch: () => boolean = () => true
): Promise<boolean> => {
  const definition = getQueueLevel(handler.queueLevel)
  if (!definition) throw new Error(`Invalid queue level for ${handler.id}: ${handler.queueLevel}`)
  const owner = randomUUID()
  const job = await claimQueueHandler(db, handler, owner)
  if (!job) return false
  // Registration and shutdown can change while the database claim is pending.
  if (!mayDispatch()) {
    await db.updateTable('background_queue_handler').set({
      lease_owner: null, lease_expires_at: null, lease_cycle_at: null,
      updated_at: sql<Date>`clock_timestamp()`
    }).where('id', '=', job.id).where('lease_owner', '=', owner).execute()
    return false
  }
  let renewal: Promise<unknown> = Promise.resolve()
  const heartbeat = setInterval(() => {
    renewal = renewal.then(() => db.updateTable('background_queue_handler').set({
      lease_expires_at: sql<Date>`clock_timestamp() + ${QUEUE_LEASE_MS} * interval '1 millisecond'`
    }).where('id', '=', job.id).where('lease_owner', '=', owner).execute())
      .catch(error => console.error(`Queue lease renewal failed for ${handler.id}`, error))
  }, QUEUE_LEASE_MS / 4)
  heartbeat.unref?.()
  let failed = false
  let failure: unknown
  try {
    await handler.run(context)
  } catch (error) {
    failed = true
    failure = error
  } finally {
    clearInterval(heartbeat)
    await renewal
  }
  await db.updateTable('background_queue_handler').set({
    last_cycle_at: sql<Date>`greatest(lease_cycle_at, ${currentCycleSql(definition.cadenceMs)})`,
    attempt_count: !failed ? 0 : Math.min(job.attempt_count + 1, 2_147_483_647),
    retry_not_before: failed && definition.retry
      ? sql<Date>`statement_timestamp() + ${queueRetryDelayMs(definition, job.attempt_count + 1)} * interval '1 millisecond'`
      : null,
    lease_owner: null,
    lease_expires_at: null,
    lease_cycle_at: null,
    last_error: !failed ? null : (failure instanceof Error ? failure.message : String(failure)).slice(0, 1000),
    updated_at: sql<Date>`clock_timestamp()`
  }).where('id', '=', job.id).where('lease_owner', '=', owner).execute()
  if (failed) console.error(`Queue handler failed: ${handler.id}`, failure)
  return true
}
