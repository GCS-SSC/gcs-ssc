import type { Ref } from 'vue'
import { ref } from 'vue'
import type {
  FundingHistorySimilarityResponse,
  FundingHistorySimilarityWarning,
  FundingHistoryWarningKind
} from '~/types/funding-history'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

export interface AgreementSimilarityInput {
  streamId: string | number
  agreementNumber: string
  excludeAgreementId?: string
}

interface SimilarityApiErrorData {
  code: string
  details?: Array<{ message?: string }>
  warnings?: unknown[]
}

const warningKinds = new Set<FundingHistoryWarningKind>([
  'agency',
  'program',
  'agreement_number'
])

/**
 * Keeps only the warning fields rendered by the shared confirmation dialog.
 *
 * @param value - Untrusted warning payload.
 * @returns A redacted warning or null when the payload is invalid.
 */
const sanitizeWarning = (value: unknown): FundingHistorySimilarityWarning | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.kind !== 'string'
    || !warningKinds.has(candidate.kind as FundingHistoryWarningKind)
    || typeof candidate.fingerprint !== 'string'
    || candidate.fingerprint.length === 0
    || typeof candidate.restricted !== 'boolean'
  ) return null

  const warning: FundingHistorySimilarityWarning = {
    kind: candidate.kind as FundingHistoryWarningKind,
    fingerprint: candidate.fingerprint,
    restricted: candidate.restricted
  }
  if (!warning.restricted) {
    if (typeof candidate.labelEn === 'string') warning.labelEn = candidate.labelEn
    if (typeof candidate.labelFr === 'string') warning.labelFr = candidate.labelFr
  }
  return warning
}

const sanitizeWarnings = (values: unknown): FundingHistorySimilarityWarning[] => Array.isArray(values)
  ? values.map(sanitizeWarning).filter((warning): warning is FundingHistorySimilarityWarning => warning !== null)
  : []

/**
 * Finds the stable API error payload through fetch and ofetch error envelopes.
 *
 * @param error - Unknown request failure.
 * @returns The stable API payload when present.
 */
const findApiErrorData = (error: unknown): SimilarityApiErrorData | null => {
  const queue: unknown[] = [error]
  const visited = new Set<object>()
  while (queue.length > 0) {
    const value = queue.shift()
    if (!value || typeof value !== 'object' || visited.has(value)) continue
    visited.add(value)
    const candidate = value as Record<string, unknown>
    if (typeof candidate.code === 'string') return candidate as unknown as SimilarityApiErrorData
    if (candidate.data && typeof candidate.data === 'object') queue.push(candidate.data)
  }
  return null
}

/**
 * Extracts redacted similarity warnings from the server's stale-warning response.
 *
 * @param error - Unknown Agreement mutation failure.
 * @returns Redacted warnings for a similarity conflict, otherwise null.
 */
export const getAgreementSimilarityWarningsFromError = (
  error: unknown
): FundingHistorySimilarityWarning[] | null => {
  const data = findApiErrorData(error)
  if (data?.code !== 'FUNDING_HISTORY_SIMILARITY_CONFIRMATION_REQUIRED') return null

  const directWarnings = sanitizeWarnings(data.warnings)
  if (directWarnings.length > 0) return directWarnings

  const detailWarnings = (data.details ?? []).flatMap(detail => {
    if (!detail.message) return []
    try {
      const warning = sanitizeWarning(JSON.parse(detail.message) as unknown)
      return warning ? [warning] : []
    } catch {
      return []
    }
  })
  return detailWarnings.length > 0 ? detailWarnings : null
}

/**
 * Coordinates Agreement similarity preview, opaque confirmation fingerprints, and stale retries.
 *
 * @returns Reactive warning state and confirmation lifecycle actions.
 */
export const useAgreementSimilarityConfirmation = () => {
  const warnings: Ref<FundingHistorySimilarityWarning[]> = ref([])
  const isWarningOpen: Ref<boolean> = ref(false)
  const confirmations: Ref<string[]> = ref([])
  let identity = ''

  /**
   * Invalidates fingerprints when the proposed Agreement identity changes.
   *
   * @param input - Current Agreement similarity identity.
   */
  const syncIdentity = (input: AgreementSimilarityInput) => {
    const nextIdentity = JSON.stringify([
      String(input.streamId),
      input.agreementNumber.trim(),
      input.excludeAgreementId ?? ''
    ])
    if (identity !== nextIdentity) {
      identity = nextIdentity
      confirmations.value = []
    }
  }

  /**
   * Requests a redacted preview and opens the shared dialog for unconfirmed warnings.
   *
   * @param input - Current Agreement similarity identity.
   * @returns Whether the mutation may proceed without another confirmation.
   */
  const requestPreview = async (input: AgreementSimilarityInput): Promise<boolean> => {
    syncIdentity(input)
    const response = await fetch(getClientRequestUrl('/api/agreements/similarity'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        streamId: String(input.streamId),
        agreementNumber: input.agreementNumber,
        ...(input.excludeAgreementId ? { excludeAgreementId: input.excludeAgreementId } : {})
      })
    })
    if (!response.ok) await throwFetchResponseError(response)
    const result = await response.json() as FundingHistorySimilarityResponse
    const confirmed = new Set(confirmations.value)
    const unconfirmed = sanitizeWarnings(result.warnings)
      .filter(warning => !confirmed.has(warning.fingerprint))
    if (unconfirmed.length === 0) {
      warnings.value = []
      return true
    }

    warnings.value = unconfirmed
    isWarningOpen.value = true
    return false
  }

  /**
   * Opens the shared dialog when the transaction reports a new or stale warning.
   *
   * @param error - Unknown Agreement mutation failure.
   * @returns Whether the failure was handled as a similarity warning.
   */
  const handleMutationError = (error: unknown): boolean => {
    const staleWarnings = getAgreementSimilarityWarningsFromError(error)
    if (!staleWarnings) return false
    warnings.value = staleWarnings
    isWarningOpen.value = true
    return true
  }

  /** Records the currently visible opaque warning fingerprints. */
  const confirmWarnings = () => {
    confirmations.value = [...new Set([
      ...confirmations.value,
      ...warnings.value.map(warning => warning.fingerprint)
    ])]
    warnings.value = []
  }

  /** Clears visible warnings without recording confirmation or mutating an Agreement. */
  const cancelWarnings = () => {
    warnings.value = []
  }

  /**
   * Returns a detached list of the current opaque confirmation fingerprints.
   *
   * @returns Current confirmation fingerprints.
   */
  const getConfirmations = (): string[] => [...confirmations.value]

  return {
    warnings,
    isWarningOpen,
    requestPreview,
    handleMutationError,
    confirmWarnings,
    cancelWarnings,
    getConfirmations
  }
}
