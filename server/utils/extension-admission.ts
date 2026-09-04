/**
 *
 */
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
