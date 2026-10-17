import type { WorkbookSheet } from './google-sheets-workbook'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isDeletionRed = (color: unknown): boolean => isRecord(color)
  && Math.abs(Number(color.red) - 0.91764706) < 0.00001
  && Math.abs(Number(color.green) - 0.6) < 0.00001
  && Math.abs(Number(color.blue) - 0.6) < 0.00001

/**
 * Builds explicitly authored row-format writes, preserving values and unrelated styles.
 * @param sheet Inspected worksheet snapshot.
 * @param startRowIndex Zero-based first row.
 * @param count Exact bounded span, at most 32 rows.
 * @param input Per-row guards and optional backgroundColor/bold/wrapStrategy, or null to leave a row untouched.
 * @returns Bounded repeatCell requests; deletion-red rows cannot be changed.
 */
export const buildFormatRowsRequests = (
  sheet: WorkbookSheet,
  startRowIndex: number,
  count: number,
  input: unknown
): Array<Record<string, unknown>> => {
  if (!Number.isSafeInteger(count) || count < 1 || count > 32) {
    throw new Error('format requires between 1 and 32 rows')
  }
  if (!Number.isSafeInteger(startRowIndex) || startRowIndex < 0
    || startRowIndex + count > sheet.properties.gridProperties.rowCount) {
    throw new Error('format range exceeds the worksheet grid')
  }
  if (!Array.isArray(input) || input.length !== count) {
    throw new Error('format file must contain exactly --count rows')
  }
  const requests: Array<Record<string, unknown>> = []
  for (const [offset, entry] of input.entries()) {
    if (entry === null) continue
    if (!isRecord(entry) || typeof entry.expectedFirstCell !== 'string'
      || Object.keys(entry).some(key => !['expectedFirstCell', 'backgroundColor', 'bold', 'wrapStrategy'].includes(key))
      || (!('backgroundColor' in entry) && !('bold' in entry) && !('wrapStrategy' in entry))) {
      throw new Error('Each format row requires expectedFirstCell and backgroundColor, bold or wrapStrategy, or must be null')
    }
    const format: Record<string, unknown> = {}
    const fields: string[] = []
    if ('backgroundColor' in entry) {
      const color = entry.backgroundColor
      if (!isRecord(color) || Object.keys(color).length !== 3
        || ['red', 'green', 'blue'].some(key => typeof color[key] !== 'number'
          || !Number.isFinite(color[key]) || Number(color[key]) < 0 || Number(color[key]) > 1)) {
        throw new Error('backgroundColor requires red, green and blue numbers between 0 and 1')
      }
      format.backgroundColorStyle = { rgbColor: color }
      fields.push('userEnteredFormat.backgroundColor', 'userEnteredFormat.backgroundColorStyle')
    }
    if ('bold' in entry) {
      if (typeof entry.bold !== 'boolean') throw new Error('bold must be a boolean')
      format.textFormat = { bold: entry.bold }
      fields.push('userEnteredFormat.textFormat.bold')
    }
    if ('wrapStrategy' in entry) {
      if (typeof entry.wrapStrategy !== 'string' || !['WRAP', 'CLIP', 'OVERFLOW_CELL'].includes(entry.wrapStrategy)) {
        throw new Error('wrapStrategy must be WRAP, CLIP or OVERFLOW_CELL')
      }
      format.wrapStrategy = entry.wrapStrategy
      fields.push('userEnteredFormat.wrapStrategy')
    }
    const rowIndex = startRowIndex + offset
    const cells = sheet.data?.[0]?.rowData?.[rowIndex]?.values ?? []
    const value = cells[0]?.effectiveValue ?? cells[0]?.userEnteredValue ?? {}
    const actual = String(value.stringValue ?? value.numberValue ?? value.boolValue ?? value.formulaValue ?? '')
    if (actual !== entry.expectedFirstCell) {
      throw new Error(`${sheet.properties.title}!A${rowIndex + 1} guard failed: expected ${JSON.stringify(entry.expectedFirstCell)}, received ${JSON.stringify(actual)}`)
    }
    const deletionRow = cells.some(cell => [cell.effectiveFormat, cell.userEnteredFormat].some(style => style
      && (isDeletionRed(style.backgroundColor) || isDeletionRed(style.backgroundColorStyle?.rgbColor))))
    if (deletionRow) throw new Error(`${sheet.properties.title}!${rowIndex + 1} retains deletion-red formatting`)
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheet.properties.sheetId,
          startRowIndex: rowIndex,
          endRowIndex: rowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: sheet.properties.gridProperties.columnCount
        },
        cell: { userEnteredFormat: format },
        fields: fields.join(',')
      }
    })
  }
  if (requests.length === 0) throw new Error('format requires at least one explicit row change')
  return requests
}
