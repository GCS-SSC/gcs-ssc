import Papa from 'papaparse'

/**
 * Serializes exact text with spreadsheet formula protection, including leading whitespace.
 * @param fields Localized column labels.
 * @param data Authorized export rows with exact numeric values retained as text.
 * @returns UTF-8 CSV content including its spreadsheet encoding marker.
 */
export const serializeCsvExport = (fields: string[], data: Array<Array<string | null>>): string => '\uFEFF' + Papa.unparse({ fields, data }, {
  quotes: true,
  newline: '\r\n',
  escapeFormulae: /^(?!-?\d+(?:\.\d+)?$)(?:\s*[=+\-@]|[\t\r\n])/u
})
