import { customAlphabet } from 'nanoid'

const generateSuffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12)

/**
 * Creates an editable default language-independent code.
 * @param prefix Fixed, format-compliant prefix identifying the kind of row.
 * @returns A code with a random lowercase alphanumeric suffix.
 */
export const createLanguageIndependentCode = (prefix: string) => `${prefix}_${generateSuffix()}`
