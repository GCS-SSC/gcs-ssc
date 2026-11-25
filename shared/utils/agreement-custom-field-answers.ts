import type { AgreementCustomFieldPatch } from '../types/schemas/agreement-custom-fields'

type Answer = AgreementCustomFieldPatch[string] | undefined

const isBlankAnswer = (answer: Answer) =>
  answer == null || (typeof answer === 'string' && !answer.trim())
  || (Array.isArray(answer) && answer.length === 0)

/**
 * Compares answer values without treating a different selection order as an edit.
 * @param left - First answer.
 * @param right - Second answer.
 * @returns Whether both answers mean the same thing.
 */
export const sameCustomFieldAnswer = (left: Answer, right: Answer): boolean => {
  if (isBlankAnswer(left)) return isBlankAnswer(right)
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false
    const sortedRight = [...right].sort()
    return [...left].sort().every((id, index) => id === sortedRight[index])
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
