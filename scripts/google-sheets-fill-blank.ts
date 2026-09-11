import type { WorkbookSheet } from './google-sheets-workbook'

/**
 * Builds one bounded value-only write after checking every destination row is empty.
 * @param sheet Inspected worksheet snapshot.
 * @param startRowIndex Zero-based first destination row.
 * @param count Exact number of rows to populate, at most 32.
 * @param input Explicitly authored rectangular string matrix.
 * @returns One Sheets updateCells request that preserves formatting.
 */
export const buildFillBlankRowsRequest = (
  sheet: WorkbookSheet,
  startRowIndex: number,
  count: number,
  input: unknown
): Record<string, unknown> => {
  if (!Number.isSafeInteger(count) || count < 1 || count > 32) {
    throw new Error('fill-blank requires between 1 and 32 rows')
  }
  if (!Number.isSafeInteger(startRowIndex) || startRowIndex < 0
    || startRowIndex + count > sheet.properties.gridProperties.rowCount) {
    throw new Error('fill-blank range exceeds the worksheet grid')
  }
  if (!Array.isArray(input) || input.length !== count) {
    throw new Error('fill-blank values must contain exactly --count rows')
  }
  const width = Array.isArray(input[0]) ? input[0].length : 0
  if (width < 1 || width > sheet.properties.gridProperties.columnCount
    || input.some(row => !Array.isArray(row) || row.length !== width
      || row.some(value => typeof value !== 'string'))) {
    throw new Error('fill-blank values must be a bounded rectangular array of strings')
  }
  for (let offset = 0; offset < count; offset += 1) {
    const cells = sheet.data?.[0]?.rowData?.[startRowIndex + offset]?.values ?? []
    const occupied = cells.some(cell => cell.note
      || [cell.userEnteredValue, cell.effectiveValue].some(value => value
        && Object.values(value).some(part => part !== '' && part !== undefined && part !== null)))
    if (occupied) {
      throw new Error(`${sheet.properties.title}!${startRowIndex + offset + 1} is not empty`)
    }
  }
  return {
    updateCells: {
      range: {
        sheetId: sheet.properties.sheetId,
        startRowIndex,
        endRowIndex: startRowIndex + count,
        startColumnIndex: 0,
        endColumnIndex: width
      },
      rows: (input as string[][]).map(row => ({
        values: row.map(value => ({
          userEnteredValue: value.startsWith('=') ? { formulaValue: value } : { stringValue: value }
        }))
      })),
      fields: 'userEnteredValue'
    }
  }
}
