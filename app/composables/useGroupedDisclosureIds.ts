import { useId } from 'vue'

type GroupedDisclosureRow = {
  id: string
  subRows?: GroupedDisclosureRow[]
  getParentRow?: () => GroupedDisclosureRow | undefined
}

const encodeIdPart = (value: string) => Array.from(value)
  .map(character => character.codePointAt(0)?.toString(16) ?? '')
  .join('-')

/**
 * Creates stable, component-scoped relationships between grouped-table disclosure
 * buttons and the first row revealed by each button.
 *
 * @returns Helpers that create matching disclosure control and content identifiers.
 */
export const useGroupedDisclosureIds = () => {
  const instanceId = encodeIdPart(useId())
  const getGroupedDisclosureControlsId = (rowId: string) => (
    `grouped-disclosure-${instanceId}-${encodeIdPart(rowId)}`
  )
  /**
   * Returns the controlling disclosure identifier for a revealed row.
   *
   * @param row - The grouped row being revealed.
   * @returns The parent control identifier when this is the first revealed row.
   */
  const getGroupedDisclosureContentId = (row: GroupedDisclosureRow) => {
    const parentRow = row.getParentRow?.()
    if (!parentRow || parentRow.subRows?.[0]?.id !== row.id) return undefined

    return getGroupedDisclosureControlsId(parentRow.id)
  }

  return {
    getGroupedDisclosureControlsId,
    getGroupedDisclosureContentId
  }
}
