/**
 * Error thrown for failed browser fetch responses with parsed API payloads.
 */
export class AppFetchResponseError extends Error {
  /** Parsed response payload. */
  readonly data: unknown
  /** Failed browser response. */
  readonly response: Response

  /**
   * Creates a fetch response error.
   *
   * @param response - Failed browser response.
   * @param data - Parsed response payload.
   */
  constructor(response: Response, data: unknown) {
    const message = data && typeof data === 'object' && 'data' in data
      ? String(((data as { data?: { message?: unknown } }).data?.message) || response.statusText || `HTTP ${response.status}`)
      : response.statusText || `HTTP ${response.status}`

    super(message)
    this.name = 'FetchResponseError'
    this.data = data
    this.response = response
  }
}

/**
 * Throws a normalized error for failed browser fetch responses.
 *
 * @remarks
 * Nuxt `$fetch` preserves JSON error bodies on thrown errors. Raw `fetch`
 * does not, so callers must parse and throw the response payload explicitly
 * before falling back to the HTTP status text.
 *
 * @param response - Failed fetch response.
 * @returns Never returns.
 */
export const throwFetchResponseError = async (response: Response): Promise<never> => {
  let payload: unknown
  try {
    payload = await response.clone().json() as unknown
  } catch {
    payload = undefined
  }

  if (payload !== undefined) {
    throw new AppFetchResponseError(response, payload)
  }

  const textBody = await response.clone().text().catch(() => '')
  const message = textBody.trim().length > 0
    ? textBody
    : response.statusText.length > 0
      ? response.statusText
      : `HTTP ${response.status}`
  throw new Error(message)
}
