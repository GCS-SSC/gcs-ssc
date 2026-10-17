/* eslint-disable jsdoc/require-param-description, jsdoc/require-returns, @typescript-eslint/no-explicit-any */
import { readFile, writeFile } from 'node:fs/promises'

export const DATA_MODEL_SPREADSHEET_ID = '1R_e2CyWho_dUbqeJI4iN1ExUtyUCd76utkV2AscO9I4'

interface GoogleToken {
  access_token?: string
  refresh_token: string
  [key: string]: unknown
}

interface SheetProperties {
  gridProperties: { columnCount: number, rowCount: number }
  sheetId: number
  title: string
}

export interface WorkbookSheet {
  data?: Array<{ startRow?: number, startColumn?: number, rowData?: Array<{ values?: Array<Record<string, any>> }> }>
  properties: SheetProperties
}

export interface WorkbookSnapshot {
  sheets: WorkbookSheet[]
}

interface WorkbookRowRange {
  sheetTitle: string
  startRowIndex: number
  count: number
}

/**
 *
 */
const configPaths = () => {
  const home = process.env.HOME
  if (!home) throw new Error('HOME is not set')
  return {
    client: `${home}/.config/gcs-ssc/google-oauth-client.json`,
    token: `${home}/.config/gcs-ssc/google-sheets-token.json`
  }
}

/**
 *
 */
export const getGoogleSheetsAccessToken = async (): Promise<string> => {
  const paths = configPaths()
  const clientDocument = JSON.parse(await readFile(paths.client, 'utf8'))
  const client = clientDocument.installed ?? clientDocument.web
  const currentToken: GoogleToken = JSON.parse(await readFile(paths.token, 'utf8'))
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: currentToken.refresh_token,
      grant_type: 'refresh_token'
    })
  })
  if (!response.ok) throw new Error(`OAuth refresh failed with HTTP ${response.status}`)
  const refreshed = await response.json() as GoogleToken
  const nextToken = {
    ...currentToken,
    ...refreshed,
    refresh_token: refreshed.refresh_token ?? currentToken.refresh_token
  }
  await writeFile(paths.token, `${JSON.stringify(nextToken, null, 2)}\n`, { mode: 0o600 })
  if (!nextToken.access_token) throw new Error('OAuth response did not include an access token')
  return nextToken.access_token
}

/**
 *
 * @param accessToken
 * @param path
 * @param init
 */
export const sheetsRequest = async <T>(accessToken: string, path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: {
      'authorization': `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...init?.headers
    }
  })
  if (!response.ok) throw new Error(`Google Sheets request failed with HTTP ${response.status}: ${await response.text()}`)
  return await response.json() as T
}

/**
 *
 * @param accessToken
 * @param spreadsheetId
 * @param range Optional bounded rows across the worksheet's existing columns.
 */
export const readWorkbookSnapshot = async (
  accessToken: string,
  spreadsheetId = DATA_MODEL_SPREADSHEET_ID,
  range?: WorkbookRowRange
): Promise<WorkbookSnapshot> => {
  if (range && (!Number.isSafeInteger(range.startRowIndex) || range.startRowIndex < 0
    || !Number.isSafeInteger(range.count) || range.count < 1 || !range.sheetTitle)) {
    throw new Error('Workbook range requires a worksheet and positive bounded rows')
  }
  const fields = 'sheets(properties(sheetId,title,gridProperties),data(startRow,startColumn,rowData(values(effectiveValue,userEnteredValue,effectiveFormat,userEnteredFormat,note))))'
  const a1Range = range
    ? `'${range.sheetTitle.replaceAll('\'', '\'\'')}'!${range.startRowIndex + 1}:${range.startRowIndex + range.count}`
    : undefined
  const workbook = await sheetsRequest<WorkbookSnapshot>(
    accessToken,
    `${spreadsheetId}?includeGridData=true&fields=${encodeURIComponent(fields)}${a1Range ? `&ranges=${encodeURIComponent(a1Range)}` : ''}`
  )
  // GridData offsets are relative to requested ranges; consumers use absolute worksheet indices.
  for (const sheet of workbook.sheets) {
    if (!sheet.data?.length) continue
    const rows: NonNullable<NonNullable<WorkbookSheet['data']>[number]['rowData']> = []
    for (const block of sheet.data) {
      for (const [rowOffset, row] of (block.rowData ?? []).entries()) {
        const rowIndex = (block.startRow ?? 0) + rowOffset
        const cells = rows[rowIndex]?.values ?? []
        for (const [columnOffset, cell] of (row.values ?? []).entries()) {
          cells[(block.startColumn ?? 0) + columnOffset] = cell
        }
        rows[rowIndex] = { values: cells }
      }
    }
    sheet.data = [{ startRow: 0, startColumn: 0, rowData: rows }]
  }
  return workbook
}

export const cellText = (cell: Record<string, any> | undefined): string => {
  const value = cell?.userEnteredValue ?? cell?.effectiveValue ?? {}
  return String(value.stringValue ?? value.numberValue ?? value.boolValue ?? value.formulaValue ?? '')
}

/**
 *
 * @param workbook
 * @param title
 */
export const requireSheet = (workbook: WorkbookSnapshot, title: string): WorkbookSheet => {
  const sheet = workbook.sheets.find(candidate => candidate.properties.title === title)
  if (!sheet) throw new Error(`Worksheet not found: ${title}`)
  return sheet
}

export const rowValues = (sheet: WorkbookSheet, rowIndex: number): string[] =>
  (sheet.data?.[0]?.rowData?.[rowIndex]?.values ?? []).map(cellText)

/**
 *
 * @param sheet
 * @param rowIndex
 * @param expected
 */
export const requireRowFirstCell = (sheet: WorkbookSheet, rowIndex: number, expected: string): void => {
  const actual = rowValues(sheet, rowIndex)[0] ?? ''
  if (actual !== expected) {
    throw new Error(`${sheet.properties.title}!A${rowIndex + 1} guard failed: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}
