import { writeFile } from 'node:fs/promises'
import {
  cellText,
  DATA_MODEL_SPREADSHEET_ID,
  getGoogleSheetsAccessToken,
  readWorkbookSnapshot
} from './google-sheets-workbook'

const outputPath = process.argv[2] ?? '.agent/reports/whole/data-model-workbook.json'
const accessToken = await getGoogleSheetsAccessToken()
const workbook = await readWorkbookSnapshot(accessToken)
await writeFile(outputPath, `${JSON.stringify(workbook, null, 2)}\n`)

console.log(`Spreadsheet ${DATA_MODEL_SPREADSHEET_ID}`)
for (const sheet of workbook.sheets) {
  const nonemptyRows = (sheet.data?.[0]?.rowData ?? []).filter(row =>
    (row.values ?? []).some(cell => cellText(cell) !== '')
  ).length
  console.log(`${sheet.properties.sheetId}\t${sheet.properties.title}\t${nonemptyRows} nonempty rows`)
}
console.log(`Snapshot written to ${outputPath}`)
