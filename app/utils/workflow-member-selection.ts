export type WorkflowNestedMemberSelection = {
  kind: 'review_set' | 'recommendation_set'
  referenceId: string
}

/**
 * Applies an asynchronously loaded selection only if it is still current.
 * @param requested Selection captured before the request began.
 * @param load Loads the selected resource.
 * @param getCurrent Resolves the selection currently shown by the editor.
 * @param apply Applies a response that still belongs to the current selection.
 * @returns Whether the response was applied.
 */
export const applyCurrentWorkflowMemberSelection = async <T>(
  requested: WorkflowNestedMemberSelection,
  load: () => Promise<T>,
  getCurrent: () => WorkflowNestedMemberSelection | null,
  apply: (value: T) => void
): Promise<boolean> => {
  let value: T
  try {
    value = await load()
  } catch (error) {
    const current = getCurrent()
    if (!current || current.kind !== requested.kind || current.referenceId !== requested.referenceId) return false
    throw error
  }
  const current = getCurrent()
  if (!current || current.kind !== requested.kind || current.referenceId !== requested.referenceId) return false
  apply(value)
  return true
}
