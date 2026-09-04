/* eslint-disable jsdoc/require-jsdoc, @typescript-eslint/no-explicit-any */
import { readFile } from 'node:fs/promises'
import {
  DATA_MODEL_SPREADSHEET_ID,
  getGoogleSheetsAccessToken,
  readWorkbookSnapshot,
  requireSheet,
  sheetsRequest
} from './google-sheets-workbook'

type Action = 'cell' | 'color' | 'delete' | 'insert' | 'move' | 'read' | 'update'
type Request = Record<string, unknown>

const AUDIT_COLORS = {
  blue: { red: 0.6431373, green: 0.7607843, blue: 0.9529412 },
  purple: { red: 0.7058824, green: 0.654902, blue: 0.8392157 },
  red: { red: 0.91764706, green: 0.6, blue: 0.6 },
  yellow: { red: 1, green: 0.8901961, blue: 0.45490196 }
} as const

const usage = (): never => {
  throw new Error([
    'Usage:',
    '  data-model-spreadsheet-row.ts read --sheet TITLE --row N [--count N]',
    '  data-model-spreadsheet-row.ts cell --sheet TITLE --row N --column A --expected-value TEXT --value-file PATH',
    '  data-model-spreadsheet-row.ts update --sheet TITLE --row N --expected-first-cell TEXT (--values-file PATH | --values-json JSON)',
    '  data-model-spreadsheet-row.ts insert --sheet TITLE --row N --count N --expected-first-cell TEXT',
    '  data-model-spreadsheet-row.ts delete --sheet TITLE --row N --count N --expected-first-cell TEXT',
    '  data-model-spreadsheet-row.ts color --sheet TITLE --row N --count N --color yellow|red|purple|blue (--expected-first-cell TEXT | --expected-first-cell-empty)',
    '  data-model-spreadsheet-row.ts move --sheet TITLE --row N --count N --before-row N --expected-first-cell TEXT (--expected-before-first-cell TEXT | --expected-before-first-cell-empty)'
  ].join('\n'))
}

const action = process.argv[2] as Action | undefined
if (!action || !['cell', 'color', 'delete', 'insert', 'move', 'read', 'update'].includes(action)) usage()

const args = new Map<string, string>()
for (let index = 3; index < process.argv.length; index += 1) {
  const key = process.argv[index]
  if (key === '--') continue
  if (!key?.startsWith('--')) usage()
  if (key === '--expected-first-cell-empty' || key === '--expected-before-first-cell-empty') {
    args.set(key, 'true')
    continue
  }
  const value = process.argv[index + 1]
  if (value === undefined || value.startsWith('--')) usage()
  args.set(key, value)
  index += 1
}

const required = (key: string): string => {
  const value = args.get(key)
  if (value === undefined) throw new Error(`Missing required argument ${key}`)
  return value
}

const positiveInteger = (key: string, fallback?: number): number => {
  const raw = args.get(key)
  if (raw === undefined && fallback !== undefined) return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${key} must be a positive integer`)
  return value
}

const enteredValue = (cell: Record<string, any> | undefined): string => {
  const value = cell?.userEnteredValue ?? {}
  return String(value.formulaValue ?? value.stringValue ?? value.numberValue ?? value.boolValue ?? '')
}

const effectiveValue = (cell: Record<string, any> | undefined): string => {
  const value = cell?.effectiveValue ?? cell?.userEnteredValue ?? {}
  return String(value.stringValue ?? value.numberValue ?? value.boolValue ?? value.formulaValue ?? '')
}

const rowDocument = (sheet: ReturnType<typeof requireSheet>, rowIndex: number): Record<string, unknown> => {
  const cells = sheet.data?.[0]?.rowData?.[rowIndex]?.values ?? []
  return {
    row: rowIndex + 1,
    enteredValues: cells.map(enteredValue),
    effectiveValues: cells.map(effectiveValue),
    backgroundColors: cells.map(cell => cell.effectiveFormat?.backgroundColorStyle ?? cell.userEnteredFormat?.backgroundColorStyle ?? null)
  }
}

const printRows = (sheet: ReturnType<typeof requireSheet>, startRowIndex: number, count: number): void => {
  const safeStart = Math.max(0, startRowIndex)
  const safeEnd = Math.min(sheet.properties.gridProperties.rowCount, startRowIndex + count)
  console.log(JSON.stringify({
    spreadsheetId: DATA_MODEL_SPREADSHEET_ID,
    sheetId: sheet.properties.sheetId,
    sheetTitle: sheet.properties.title,
    rows: Array.from({ length: Math.max(0, safeEnd - safeStart) }, (_, offset) => rowDocument(sheet, safeStart + offset))
  }, null, 2))
}

const sheetTitle = required('--sheet')
const row = positiveInteger('--row')
const count = positiveInteger('--count', 1)
const accessToken = await getGoogleSheetsAccessToken()
let workbook = await readWorkbookSnapshot(accessToken)
let sheet = requireSheet(workbook, sheetTitle)
const startRowIndex = row - 1
if (action === 'insert') {
  if (startRowIndex > sheet.properties.gridProperties.rowCount) throw new Error('Insert row exceeds the worksheet grid')
} else if (startRowIndex + count > sheet.properties.gridProperties.rowCount) {
  throw new Error('Requested row range exceeds the worksheet grid')
}

if (action === 'read') {
  printRows(sheet, startRowIndex, count)
  process.exit(0)
}

if (action === 'cell') {
  const columnName = required('--column').toUpperCase()
  if (!/^[A-Z]+$/.test(columnName)) throw new Error('--column must be an A1-style column name')
  const columnIndex = [...columnName].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0) - 1
  if (columnIndex >= sheet.properties.gridProperties.columnCount) throw new Error('--column exceeds the worksheet grid')
  const cell = sheet.data?.[0]?.rowData?.[startRowIndex]?.values?.[columnIndex]
  const expectedValue = required('--expected-value')
  const actualValue = enteredValue(cell)
  if (actualValue !== expectedValue) {
    throw new Error(`${sheetTitle}!${columnName}${row} guard failed: expected entered value ${JSON.stringify(expectedValue)}, received ${JSON.stringify(actualValue)}`)
  }
  const value = (await readFile(required('--value-file'), 'utf8')).replace(/\r?\n$/, '')
  if (value.includes('\n')) throw new Error('--value-file must contain exactly one line without a trailing newline')
  await sheetsRequest(accessToken, `${DATA_MODEL_SPREADSHEET_ID}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: [{
      updateCells: {
        range: {
          sheetId: sheet.properties.sheetId,
          startRowIndex,
          endRowIndex: startRowIndex + 1,
          startColumnIndex: columnIndex,
          endColumnIndex: columnIndex + 1
        },
        rows: [{ values: [{ userEnteredValue: value.startsWith('=') ? { formulaValue: value } : { stringValue: value } }] }],
        fields: 'userEnteredValue'
      }
    }] })
  })
  workbook = await readWorkbookSnapshot(accessToken)
  sheet = requireSheet(workbook, sheetTitle)
  printRows(sheet, Math.max(0, startRowIndex - 1), Math.min(sheet.properties.gridProperties.rowCount, 3))
  process.exit(0)
}

if (args.has('--expected-first-cell-empty') && args.has('--expected-first-cell')) {
  throw new Error('Use only one of --expected-first-cell or --expected-first-cell-empty')
}
const expectedFirstCell = args.has('--expected-first-cell-empty') ? '' : required('--expected-first-cell')
const actualFirstCell = effectiveValue(sheet.data?.[0]?.rowData?.[startRowIndex]?.values?.[0])
if (actualFirstCell !== expectedFirstCell) {
  throw new Error(`${sheetTitle}!A${row} guard failed: expected ${JSON.stringify(expectedFirstCell)}, received ${JSON.stringify(actualFirstCell)}`)
}

let request: Request
if (action === 'update') {
  if (count !== 1) throw new Error('The update operation changes exactly one row; omit --count')
  const valuesFile = args.get('--values-file')
  const valuesJson = args.get('--values-json')
  if ((valuesFile === undefined) === (valuesJson === undefined)) {
    throw new Error('update requires exactly one of --values-file or --values-json')
  }
  const values = JSON.parse(valuesJson ?? await readFile(valuesFile!, 'utf8')) as unknown
  if (!Array.isArray(values) || values.length === 0 || values.some(value => typeof value !== 'string')) {
    throw new Error('--values-file must contain a non-empty JSON array of strings')
  }
  if (values.length > sheet.properties.gridProperties.columnCount) throw new Error('Update values exceed the worksheet column count')
  request = {
    updateCells: {
      range: {
        sheetId: sheet.properties.sheetId,
        startRowIndex,
        endRowIndex: startRowIndex + 1,
        startColumnIndex: 0,
        endColumnIndex: values.length
      },
      rows: [{
        values: values.map(value => ({
          userEnteredValue: value.startsWith('=') ? { formulaValue: value } : { stringValue: value }
        }))
      }],
      fields: 'userEnteredValue'
    }
  }
} else if (action === 'insert') {
  request = {
    insertDimension: {
      range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: startRowIndex, endIndex: startRowIndex + count },
      inheritFromBefore: startRowIndex > 0
    }
  }
} else if (action === 'delete') {
  request = {
    deleteDimension: {
      range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: startRowIndex, endIndex: startRowIndex + count }
    }
  }
} else if (action === 'color') {
  const colorName = required('--color') as keyof typeof AUDIT_COLORS
  const color = AUDIT_COLORS[colorName]
  if (!color) throw new Error('--color must be yellow, red, purple, or blue')
  request = {
    repeatCell: {
      range: {
        sheetId: sheet.properties.sheetId,
        startRowIndex,
        endRowIndex: startRowIndex + count,
        startColumnIndex: 0,
        endColumnIndex: sheet.properties.gridProperties.columnCount
      },
      cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor: color } } },
      fields: 'userEnteredFormat.backgroundColorStyle'
    }
  }
} else {
  const beforeRow = positiveInteger('--before-row')
  const destinationIndex = beforeRow - 1
  if (destinationIndex > sheet.properties.gridProperties.rowCount) throw new Error('--before-row exceeds the worksheet grid')
  const expectedDestination = args.has('--expected-before-first-cell-empty')
    ? ''
    : required('--expected-before-first-cell')
  const actualDestination = effectiveValue(sheet.data?.[0]?.rowData?.[destinationIndex]?.values?.[0])
  if (actualDestination !== expectedDestination) {
    throw new Error(`${sheetTitle}!A${beforeRow} destination guard failed: expected ${JSON.stringify(expectedDestination)}, received ${JSON.stringify(actualDestination)}`)
  }
  if (destinationIndex >= startRowIndex && destinationIndex <= startRowIndex + count) {
    throw new Error('Move destination must be outside the source row range')
  }
  request = {
    moveDimension: {
      source: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: startRowIndex, endIndex: startRowIndex + count },
      destinationIndex
    }
  }
}

await sheetsRequest(accessToken, `${DATA_MODEL_SPREADSHEET_ID}:batchUpdate`, {
  method: 'POST',
  body: JSON.stringify({ requests: [request] })
})

workbook = await readWorkbookSnapshot(accessToken)
sheet = requireSheet(workbook, sheetTitle)
const verificationStart = action === 'move'
  ? Math.max(0, Math.min(startRowIndex, positiveInteger('--before-row') - 1) - 1)
  : Math.max(0, startRowIndex - 1)
printRows(sheet, verificationStart, Math.min(sheet.properties.gridProperties.rowCount - verificationStart, count + 3))
