import type { AgreementCustomFieldPatch } from '../types/schemas/agreement-custom-fields'

import { isCanonicalMoney } from './money'

type Answer = AgreementCustomFieldPatch[string] | undefined

const isBlankAnswer = (answer: Answer) =>
  answer == null || (typeof answer === 'string' && !answer.trim())
  || (Array.isArray(answer) && answer.length === 0)
  || (typeof answer === 'object' && !Array.isArray(answer) && 'rows' in answer && answer.rows.length === 0)

/**
 * Compares answer values without treating a different selection order as an edit.
 * @param left - First answer.
 * @param right - Second answer.
 * @returns Whether both answers mean the same thing.
 */
export const sameCustomFieldAnswer = (left: Answer, right: Answer): boolean => {
  if (isBlankAnswer(left)) return isBlankAnswer(right)
  if (isCanonicalMoney(left)) return isCanonicalMoney(right) && left.amount === right.amount && left.currency === right.currency
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false
    const sortedRight = [...right].sort()
    return [...left].sort().every((id, index) => id === sortedRight[index])
  }
  if (left && right && typeof left === 'object' && typeof right === 'object'
    && !Array.isArray(left) && !Array.isArray(right) && 'rows' in left && 'rows' in right) {
    return left.rows.length === right.rows.length && left.rows.every((row, index) => {
      const counterpart = right.rows[index]
      return counterpart?.id === row.id
        && [...new Set([...Object.keys(row.cells), ...Object.keys(counterpart.cells)])]
          .every(id => sameCustomFieldAnswer(row.cells[id], counterpart.cells[id]))
    })
  }
  return left === right
}

/**
 * Compares complete answer sets and creates a partial patch.
 * @param baseline - Saved answers as they were when editing began.
 * @param draft - Answers being saved.
 * @returns Changed answers, including explicit clears.
 */
export const changedCustomFieldAnswers = (
  baseline: AgreementCustomFieldPatch,
  draft: AgreementCustomFieldPatch
): AgreementCustomFieldPatch => {
  const patch: AgreementCustomFieldPatch = {}
  for (const key of new Set([...Object.keys(baseline), ...Object.keys(draft)])) {
    if (!sameCustomFieldAnswer(baseline[key], draft[key])) {
      patch[key] = isBlankAnswer(draft[key]) ? null : draft[key] ?? null
    }
  }
  return patch
}
