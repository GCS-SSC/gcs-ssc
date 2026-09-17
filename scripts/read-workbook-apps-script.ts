import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DATA_MODEL_SPREADSHEET_ID, getGoogleSheetsAccessToken } from './google-sheets-workbook'

const scriptId = process.argv[2]
if (!scriptId || !/^[A-Za-z0-9_-]+$/.test(scriptId)) {
  throw new Error('Usage: bun scripts/read-workbook-apps-script.ts <script-id> [output-path]')
}
const outputPath = process.argv[3] ?? '.agent/reports/whole/workbook-apps-script.json'
const accessToken = await getGoogleSheetsAccessToken()

/**
 * Reads metadata or source from the explicitly selected Apps Script project.
 * @param suffix Resource suffix appended to the project URL.
 * @returns The requested project resource.
 */
const readProjectResource = async (suffix: string): Promise<unknown> => {
  const response = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}${suffix}`, {
    headers: { authorization: `Bearer ${accessToken}` }
  })
  if (!response.ok) {
    const body = await response.json() as { error?: { status?: string, message?: string } }
    throw new Error(`Apps Script API HTTP ${response.status}: ${body.error?.status ?? ''} ${body.error?.message ?? ''}`)
  }
  return response.json()
}

const project = await readProjectResource('') as { scriptId: string, parentId?: string, title: string }
if (project.parentId !== DATA_MODEL_SPREADSHEET_ID) {
  throw new Error('Script project is not bound to the configured data-model workbook')
}
const content = await readProjectResource('/content') as {
  scriptId: string
  files: Array<{ name: string, type: string, source?: string }>
}
await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 })
await writeFile(outputPath, `${JSON.stringify({ project, content }, null, 2)}\n`, { mode: 0o600 })
console.log(`Workbook-bound project: ${project.title}`)
for (const file of content.files) console.log(`${file.type}\t${file.name}`)
console.log(`Source snapshot saved to ${outputPath}`)
