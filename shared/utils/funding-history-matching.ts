/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Public exports have concise inline documentation. */
import Fuse from 'fuse.js'

export type FundingHistoryWarningKind = 'agency' | 'program' | 'agreement_number'

export interface FundingHistoryNameCandidate {
  id: string
  nameEn: string | null
  nameFr: string | null
  restricted?: boolean
}

export interface FundingHistorySimilarityWarning {
  kind: FundingHistoryWarningKind
  fingerprint: string
  restricted: boolean
  candidateId?: string
  labelEn?: string
  labelFr?: string
  agencyNameEn?: string | null
  agencyNameFr?: string | null
  programNameEn?: string | null
  programNameFr?: string | null
  agreementNumber?: string | null
}

const FUSE_THRESHOLD = 0.25
const MAX_CANDIDATES = 5

/** Canonicalizes agreement numbers for exact and near-match comparisons. */
export const normalizeFundingAgreementNumber = (value: string): string =>
  value.normalize('NFKC').toLocaleLowerCase('en-CA').replaceAll(/[^\p{L}\p{N}]/gu, '')

/** Canonicalizes lookup names without removing meaningful word boundaries. */
export const normalizeFundingHistoryName = (value: string): string =>
  value.normalize('NFKC').trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase('en-CA')

/** Calculates the optimal-string-alignment Damerau-Levenshtein distance. */
export const damerauLevenshteinDistance = (left: string, right: string): number => {
  const leftCharacters = [...left]
  const rightCharacters = [...right]
  const matrix = Array.from(
    { length: leftCharacters.length + 1 },
    () => Array.from({ length: rightCharacters.length + 1 }, () => 0)
  )

  for (let index = 0; index <= leftCharacters.length; index += 1) matrix[index]![0] = index
  for (let index = 0; index <= rightCharacters.length; index += 1) matrix[0]![index] = index

  for (let leftIndex = 1; leftIndex <= leftCharacters.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= rightCharacters.length; rightIndex += 1) {
      const substitutionCost = leftCharacters[leftIndex - 1] === rightCharacters[rightIndex - 1] ? 0 : 1
      matrix[leftIndex]![rightIndex] = Math.min(
        matrix[leftIndex - 1]![rightIndex]! + 1,
        matrix[leftIndex]![rightIndex - 1]! + 1,
        matrix[leftIndex - 1]![rightIndex - 1]! + substitutionCost
      )

      if (
        leftIndex > 1
        && rightIndex > 1
        && leftCharacters[leftIndex - 1] === rightCharacters[rightIndex - 2]
        && leftCharacters[leftIndex - 2] === rightCharacters[rightIndex - 1]
      ) {
        matrix[leftIndex]![rightIndex] = Math.min(
          matrix[leftIndex]![rightIndex]!,
          matrix[leftIndex - 2]![rightIndex - 2]! + 1
        )
      }
    }
  }

  return matrix[leftCharacters.length]![rightCharacters.length]!
}

/** Applies the funding-history agreement-number warning boundary. */
export const isNearFundingAgreementNumber = (left: string, right: string): boolean => {
  const normalizedLeft = normalizeFundingAgreementNumber(left)
  const normalizedRight = normalizeFundingAgreementNumber(right)
  if (normalizedLeft === normalizedRight || normalizedLeft.length < 3 || normalizedRight.length < 3) return false

  const maximumLength = Math.max(normalizedLeft.length, normalizedRight.length)
  const distance = damerauLevenshteinDistance(normalizedLeft, normalizedRight)
  if (maximumLength <= 5) return distance === 1
  return 1 - distance / maximumLength >= 0.8
}

const fingerprintHash = (value: string): string => {
  let hash = 2_166_136_261
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    hash ^= codePoint === undefined ? 0 : codePoint
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(36)
}

/** Creates an opaque, stable confirmation token that changes with the proposed value. */
export const createFundingHistoryWarningFingerprint = (
  kind: FundingHistoryWarningKind,
  candidateId: string,
  proposedValue: string,
  candidateValue: string
): string => `${kind}:${fingerprintHash([
  candidateId,
  normalizeFundingHistoryName(proposedValue),
  normalizeFundingHistoryName(candidateValue)
].join('\u001f'))}`

/** Returns bilingual Fuse.js name candidates using the agreed threshold and cap. */
export const findFundingHistoryNameCandidates = (
  queryValues: Array<string | null | undefined>,
  candidates: FundingHistoryNameCandidate[]
): FundingHistoryNameCandidate[] => {
  const queries = [...new Set(queryValues
    .map(value => value ? normalizeFundingHistoryName(value) : '')
    .filter(value => value.length >= 3))]
  if (queries.length === 0) return []

  const fuse = new Fuse(candidates, {
    keys: ['nameEn', 'nameFr'],
    includeScore: true,
    ignoreLocation: true,
    threshold: FUSE_THRESHOLD,
    minMatchCharLength: 3
  })
  const matches = new Map<string, { candidate: FundingHistoryNameCandidate, score: number }>()
  for (const query of queries) {
    for (const result of fuse.search(query, { limit: MAX_CANDIDATES })) {
      const score = result.score === undefined ? 1 : result.score
      const current = matches.get(result.item.id)
      if (current === undefined || score < current.score) {
        matches.set(result.item.id, { candidate: result.item, score })
      }
    }
  }

  return [...matches.values()]
    .sort((left, right) => left.score - right.score || left.candidate.id.localeCompare(right.candidate.id))
    .slice(0, MAX_CANDIDATES)
    .map(match => match.candidate)
}

/** Removes warnings whose exact fingerprints the caller confirmed. */
export const getUnconfirmedFundingHistoryWarnings = (
  warnings: FundingHistorySimilarityWarning[],
  confirmations: string[]
): FundingHistorySimilarityWarning[] => {
  const confirmed = new Set(confirmations)
  return warnings.filter(warning => !confirmed.has(warning.fingerprint))
}
