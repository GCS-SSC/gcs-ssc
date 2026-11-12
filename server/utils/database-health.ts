import type { Pool, PoolClient } from 'pg'

export type PostgresHealthQuery = (client: PoolClient) => Promise<unknown>

type HealthQueryState =
  | { kind: 'acquiring' }
  | { kind: 'acquisition_expired' }
  | { kind: 'querying'; client: PoolClient }
  | { kind: 'query_expired'; client: PoolClient }
  | { kind: 'released' }

const defaultHealthQuery: PostgresHealthQuery = async client => await client.query('SELECT 1')

interface DestroyablePostgresClient extends PoolClient {
  end?: () => Promise<void>
  connection?: {
    stream?: {
      destroy: (error?: Error) => void
    }
  }
}

/**
 * Force-closes the transport for an over-budget checked-out client.
 *
 * @param client - Checked-out PostgreSQL pool client.
 * @param error - Deadline error associated with the forced close.
 */
export const destroyUnderlyingConnection = (client: PoolClient, error: Error): void => {
  const destroyableClient = client as DestroyablePostgresClient
  const stream = destroyableClient.connection?.stream
  if (!stream) {
    const ending = destroyableClient.end?.()
    if (ending) void ending.catch(() => {})
    return
  }
  stream.destroy(error)
}

/**
 * Executes a PostgreSQL readiness query within one absolute budget.
 *
 * The timer destroys the checked-out connection when active I/O does not
 * settle. The function continues awaiting that query rejection, so no database
 * work is abandoned in the background as it would be with a Promise race.
 *
 * @param pool - Dedicated one-connection health pool.
 * @param timeoutMs - Absolute connection-and-query budget.
 * @param executeQuery - Query executor; the production default is `SELECT 1`.
 */
export const executeBoundedPostgresHealthQuery = async (
  pool: Pool,
  timeoutMs: number,
  executeQuery: PostgresHealthQuery = defaultHealthQuery
): Promise<void> => {
  const deadlineError = new Error('PostgreSQL health query exceeded its configured deadline')
  let state: HealthQueryState = { kind: 'acquiring' }
  const deadlineExpired = (): boolean => state.kind === 'acquisition_expired' || state.kind === 'query_expired'
  /** Prevents a forced socket close from becoming an unhandled EventEmitter error. */
  const handleClientError = (): void => {}

  /**
   * Releases the checked-out client at most once.
   *
   * @param error - Optional error that removes the client from the pool.
   */
  const release = (error?: Error): void => {
    const current = state
    state = { kind: 'released' }
    if (current.kind !== 'querying' && current.kind !== 'query_expired') return
    current.client.release(error)
    current.client.removeListener('error', handleClientError)
  }

  const timer = setTimeout(() => {
    if (state.kind === 'acquiring') {
      state = { kind: 'acquisition_expired' }
    } else if (state.kind === 'querying') {
      const { client } = state
      state = { kind: 'query_expired', client }
      destroyUnderlyingConnection(client, deadlineError)
    }
  }, timeoutMs)
  timer.unref?.()

  try {
    const client = await pool.connect()
    state = { kind: deadlineExpired() ? 'query_expired' : 'querying', client }
    client.on('error', handleClientError)
    if (deadlineExpired()) throw deadlineError

    await executeQuery(client)
    if (deadlineExpired()) throw deadlineError
  } catch (error: unknown) {
    if (deadlineExpired()) throw deadlineError
    throw error
  } finally {
    clearTimeout(timer)
    // Keep the client checked out until its forced-close error has settled;
    // releasing it earlier attaches pg-pool's idle error listener to active I/O.
    release(deadlineExpired() ? deadlineError : undefined)
  }
}
