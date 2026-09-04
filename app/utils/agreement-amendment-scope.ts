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
