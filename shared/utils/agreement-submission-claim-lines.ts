import { isCanonicalMoney } from './money'

type ClaimLineIdentity = {
  sourceLineId?: unknown
  budgetLineItemId?: unknown
  submittedCostCategory?: unknown
  submittedCostSubsection?: unknown
  submittedLineItem?: unknown
  description?: unknown
  amount?: unknown
}

/**
 * Reads a supplied source identifier from originally received or recorded evidence.
 * @param line - A Claim line.
 * @returns The stable source identifier when supplied.
 */
const sourceId = (line: ClaimLineIdentity) => typeof line.sourceLineId === 'string' ? line.sourceLineId : undefined

/**
 * Forms the identity using only submitted classification and description.
 * @param line - A Claim line projected from a receipt or financial record.
 * @returns The key shared by rows with identical identifying details.
 */
const identity = (line: ClaimLineIdentity) => JSON.stringify([
  line.budgetLineItemId ?? null,
  line.submittedCostCategory ?? null,
  line.submittedCostSubsection ?? null,
  line.submittedLineItem ?? null,
  typeof line.description === 'string' ? line.description.trim() : null
])

/**
 * Adds an unchanged exact amount as secondary evidence for a History comparison.
 * @param line - A Claim line from a saved snapshot.
 * @returns The key with its amount, when available.
 */
const withAmount = (line: ClaimLineIdentity) => isCanonicalMoney(line.amount)
  ? JSON.stringify([identity(line), line.amount.currency, line.amount.amount])
  : undefined

/**
 * Indexes each identity and marks repeated keys as ambiguous.
 * @param lines - One side of the comparison.
 * @param key - Which evidence to use for matching.
 * @returns The unique indices and any ambiguous keys.
 */
const uniqueIndices = (lines: readonly ClaimLineIdentity[], key: (line: ClaimLineIdentity) => string | undefined) => {
  const indices = new Map<string, number | null>()
  for (const [index, line] of lines.entries()) {
    const id = key(line)
    if (id !== undefined) indices.set(id, indices.has(id) ? null : index)
  }
  return indices
}

/**
 * Pairs Claim lines by stable source ID, or by unique budget and identifying
 * text for a legacy line. History can also compare unchanged amounts.
 * @param before - Older lines or source lines.
 * @param after - Incoming lines or live lines.
 * @param purpose - Whether the match will identify a persisted line or compare history.
 * @returns An index into the older array for each matched index in the newer array.
 */
export const matchClaimSubmissionLines = (
  before: readonly ClaimLineIdentity[],
  after: readonly ClaimLineIdentity[],
  purpose: 'revision' | 'snapshot' | 'history'
) => {
  const matches = new Map<number, number>()
  const matchedOld = new Set<number>()
  const keys = [sourceId, identity, ...(purpose === 'history' ? [withAmount] : [])]
  for (const key of keys) {
    const oldIndices = uniqueIndices(before, key)
    const newIndices = uniqueIndices(after, key)
    for (const [id, newIndex] of newIndices) {
      const oldIndex = oldIndices.get(id)
      if (newIndex == null || oldIndex == null || matches.has(newIndex) || matchedOld.has(oldIndex)) continue
      const oldLine = before[oldIndex]
      const newLine = after[newIndex]
      if (!oldLine || !newLine) continue
      if (key !== sourceId && (sourceId(oldLine) !== undefined
        || (purpose === 'snapshot' && sourceId(newLine) !== undefined))) continue
      matches.set(newIndex, oldIndex)
      matchedOld.add(oldIndex)
    }
  }
  return matches
}
