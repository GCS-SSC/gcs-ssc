import type { CompiledQuery, DatabaseConnection, QueryExecutor, QueryResult, Transaction } from 'kysely'

/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param-description, jsdoc/require-returns -- compact infrastructure primitive covered by focused timeout tests. */
export class ExtensionAdmissionTimeoutError extends Error {
  /**
   *
   * @param operation
   */
  constructor(public readonly operation: string) {
    super(`Extension operation timed out: ${operation}`)
    this.name = 'ExtensionAdmissionTimeoutError'
  }
}

/**
 *
 * @param operation
 * @param execute
 * @param timeoutMs
 */
export const runBoundedExtensionOperation = async <T>(
  operation: string,
  execute: (signal: AbortSignal) => Promise<T>,
  timeoutMs = Math.max(100, Number.parseInt(process.env.GCS_EXTENSION_OPERATION_TIMEOUT_MS ?? '10000', 10) || 10_000)
): Promise<T> => {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const task = execute(controller.signal)
  task.catch(() => undefined)
  try {
    return await Promise.race([
      task,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort(new ExtensionAdmissionTimeoutError(operation))
          reject(new ExtensionAdmissionTimeoutError(operation))
        }, timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export class ExtensionOperationClosedError extends Error {
  constructor(public readonly operation: string) {
    super(`Extension operation has ended: ${operation}`)
    this.name = 'ExtensionOperationClosedError'
  }
}

/**
 * Transaction hook deadlines revoke new queries and drain already admitted database work.
 *
 * @param operation
 * @param db
 * @param execute
 * @param timeoutMs
 */
const runTransactionExtensionOperation = async <DB, T>(
  operation: string,
  db: Transaction<DB>,
  execute: (signal: AbortSignal, db: Transaction<DB>) => Promise<T>,
  timeoutMs = Math.max(100, Number.parseInt(process.env.GCS_EXTENSION_OPERATION_TIMEOUT_MS ?? '10000', 10) || 10_000)
): Promise<T> => {
  const controller = new AbortController()
  let closed: Error | null = null
  const pending = new Set<Promise<unknown>>()
  const streams = new Set<AsyncIterableIterator<QueryResult<unknown>>>()
  const assertOpen = () => {
    if (closed) throw closed
  }
  const own = <R>(work: Promise<R>): Promise<R> => {
    pending.add(work)
    void work.then(() => pending.delete(work), () => pending.delete(work))
    return work
  }
  const leaseExecutor = (executor: QueryExecutor): QueryExecutor => {
    const provideConnection = executor.provideConnection.bind(executor)
    const withConnectionProvider = executor.withConnectionProvider.bind(executor)
    const withPlugin = executor.withPlugin.bind(executor)
    const withPlugins = executor.withPlugins.bind(executor)
    const withPluginAtFront = executor.withPluginAtFront.bind(executor)
    const withoutPlugins = executor.withoutPlugins.bind(executor)
    const leased = withConnectionProvider({
      provideConnection: async consumer => {
        assertOpen()
        return await provideConnection(async connection => {
          // Acquisition can wait behind an earlier query after its caller was admitted.
          assertOpen()
          const leasedConnection: DatabaseConnection = {
            executeQuery: query => {
              assertOpen()
              return own(connection.executeQuery(query))
            },
            streamQuery: async function* <R>(query: CompiledQuery, chunkSize?: number) {
              assertOpen()
              const stream = connection.streamQuery<R>(query, chunkSize)
              streams.add(stream)
              try {
                while (true) {
                  assertOpen()
                  const result = await own(stream.next())
                  if (result.done) return
                  yield result.value
                }
              } finally {
                await stream.return?.()
                streams.delete(stream)
              }
            }
          }
          return await consumer(leasedConnection)
        })
      }
    })
    // This is an isolated executor clone; every supported derived client keeps the lease.
    executor.executeQuery = leased.executeQuery.bind(leased)
    executor.provideConnection = leased.provideConnection.bind(leased)
    executor.stream = <R>(query: CompiledQuery<R>, chunkSize: number) => {
      assertOpen()
      return leased.stream(query, chunkSize)
    }
    executor.withConnectionProvider = provider => leaseExecutor(withConnectionProvider(provider))
    executor.withPlugin = plugin => leaseExecutor(withPlugin(plugin))
    executor.withPlugins = plugins => leaseExecutor(withPlugins(plugins))
    executor.withPluginAtFront = plugin => leaseExecutor(withPluginAtFront(plugin))
    executor.withoutPlugins = () => leaseExecutor(withoutPlugins())
    return executor
  }
  const leasedDb = db.withPlugin({
    transformQuery: ({ node }) => {
      assertOpen()
      return node
    },
    transformResult: async ({ result }) => result
  })
  leaseExecutor(leasedDb.getExecutor())
  const task = Promise.resolve().then(() => execute(controller.signal, leasedDb)).finally(() => {
    closed ??= new ExtensionOperationClosedError(operation)
  })
  void task.catch(() => undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      task,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const timeout = new ExtensionAdmissionTimeoutError(operation)
          closed = timeout
          controller.abort(timeout)
          reject(timeout)
        }, timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
    closed ??= new ExtensionOperationClosedError(operation)
    await Promise.allSettled(Array.from(streams, stream => stream.return?.()))
    while (pending.size) await Promise.allSettled([...pending])
  }
}

export { runTransactionExtensionOperation }
