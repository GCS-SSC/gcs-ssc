import type { Pool, PoolClient } from 'pg'

export type PostgresHealthQuery = (client: PoolClient) => Promise<unknown>

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
const destroyUnderlyingConnection = (client: PoolClient, error: Error): void => {
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
  let client: PoolClient | undefined
  let released = false
  let deadlineExpired = false
  /** Prevents a forced socket close from becoming an unhandled EventEmitter error. */
  const handleClientError = (): void => {}

  /**
   * Releases the checked-out client at most once.
   *
   * @param error - Optional error that removes the client from the pool.
   */
  const release = (error?: Error): void => {
    if (!client || released) return
    released = true
    client.release(error)
  }

  const timer = setTimeout(() => {
    deadlineExpired = true
    if (client) destroyUnderlyingConnection(client, deadlineError)
    release(deadlineError)
  }, timeoutMs)
  timer.unref?.()

  try {
    client = await pool.connect()
    client.on('error', handleClientError)
    if (deadlineExpired) {
      release(deadlineError)
      throw deadlineError
    }

    await executeQuery(client)
    if (deadlineExpired) throw deadlineError
  } catch (error: unknown) {
    if (deadlineExpired) throw deadlineError
    throw error
  } finally {
    clearTimeout(timer)
    release()
    client?.removeListener('error', handleClientError)
  }
}
