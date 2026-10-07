/**
 * Determines whether every amendment type that requires a subtype has a matching selected subtype.
 *
 * @param requiredTypeIds - Selected amendment type IDs that require subtypes.
 * @param selectedSubtypeIds - Currently selected amendment subtype IDs.
 * @param subtypeIdsByType - Active subtype IDs associated with each required type.
 * @returns Whether every required type is represented by at least one selected subtype.
 */
export const hasRequiredAmendmentSubtypeSelections = (
  requiredTypeIds: readonly string[],
  selectedSubtypeIds: readonly string[],
  subtypeIdsByType: Readonly<Record<string, readonly string[]>>
) => {
  const selectedSubtypeIdSet = new Set(selectedSubtypeIds)
  return requiredTypeIds.every(typeId =>
    (subtypeIdsByType[typeId] ?? []).some(subtypeId => selectedSubtypeIdSet.has(subtypeId))
  )
}

export interface AmendmentScopeType {
  id: string
  egcs_tp_amended: string
}

/**
 * Resolve selected type metadata beyond the first lookup page before warning about data loss.
 *
 * @param selectedIds - Proposed selected type identities.
 * @param knownTypes - Already loaded catalog entries and saved type metadata.
 * @param fetchPage - Loads one complete page of scoped type metadata.
 * @returns Resolved selected types; unknown identities remain subject to server validation.
 */
export const resolveSelectedAmendmentScopeTypes = async (
  selectedIds: readonly string[],
  knownTypes: readonly AmendmentScopeType[],
  fetchPage: (page: number) => Promise<{ items: AmendmentScopeType[], total: number, limit: number }>
): Promise<AmendmentScopeType[]> => {
  const typesById = new Map(knownTypes.map(type => [String(type.id), type]))
  let page = 1
  while (selectedIds.some(id => !typesById.has(id))) {
    const response = await fetchPage(page)
    for (const type of response.items) typesById.set(String(type.id), type)
    if (response.items.length === 0 || page * response.limit >= response.total) break
    page += 1
  }
  return selectedIds.flatMap(id => {
    const type = typesById.get(id)
    return type ? [type] : []
  })
}
