/* eslint-disable jsdoc/require-jsdoc */
import PizZip from 'pizzip'
import { inflateRawSync } from 'node:zlib'
import { z } from 'zod'

export const DOCX_MAX_ENTRIES = 512
export const DOCX_MAX_ENTRY_BYTES = 4 * 1024 * 1024
export const DOCX_MAX_EXPANDED_BYTES = 16 * 1024 * 1024
export const DOCX_MAX_COMPRESSION_RATIO = 200
const DOCX_MAX_COMPRESSED_BYTES = 10 * 1024 * 1024

const compressedEntrySchema = z.object({
  uncompressedSize: z.number().int().nonnegative().max(DOCX_MAX_ENTRY_BYTES),
  compressedSize: z.number().int().nonnegative(),
  compressionMethod: z.enum(['\x00\x00', '\x08\x00']),
  getCompressedContent: z.custom<() => unknown>(value => typeof value === 'function')
})

export const loadBoundedDocx = (bytes: Buffer): PizZip => {
  if (bytes.length > DOCX_MAX_COMPRESSED_BYTES) throw new Error('DOCX compressed byte budget exceeded')
  const zip = new PizZip(bytes)
  const entries = Object.entries(zip.files)
  if (entries.length > DOCX_MAX_ENTRIES) throw new Error('DOCX entry budget exceeded')
  for (const path of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) {
    if (!zip.file(path)) throw new Error('Invalid DOCX package')
  }
  let expandedBytes = 0
  for (const [path, file] of entries) {
    if (file.dir) continue
    // PizZip inflates without a limit; validate its lazy entry and replace it with bounded bytes.
    const entry = compressedEntrySchema.parse('_data' in file ? file._data : undefined)
    if (entry.uncompressedSize > Math.max(1, entry.compressedSize) * DOCX_MAX_COMPRESSION_RATIO) {
      throw new Error('DOCX compression ratio budget exceeded')
    }
    expandedBytes += entry.uncompressedSize
    if (expandedBytes > DOCX_MAX_EXPANDED_BYTES) throw new Error('DOCX expanded byte budget exceeded')
    const compressed = entry.getCompressedContent()
    if (!(compressed instanceof Uint8Array)) throw new Error('Invalid DOCX compressed entry')
    const content = entry.compressionMethod === '\x08\x00'
      ? inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.uncompressedSize) })
      : Buffer.from(compressed)
    if (content.length !== entry.uncompressedSize) throw new Error('Invalid DOCX expanded entry size')
    zip.file(path, content)
  }
  return zip
}
