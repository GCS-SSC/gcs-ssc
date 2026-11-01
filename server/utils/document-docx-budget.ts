/* eslint-disable jsdoc/require-jsdoc */
import PizZip from 'pizzip'
import { inflateRawSync } from 'node:zlib'
import { z } from 'zod'
import { DOMParser } from '@xmldom/xmldom'
import { posix } from 'node:path'

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

const decodeXml = (content: Buffer): string => {
  let encoding = 'utf-8'
  if ((content[0] === 0xff && content[1] === 0xfe) || (content[0] === 0x3c && content[1] === 0)) encoding = 'utf-16le'
  else if ((content[0] === 0xfe && content[1] === 0xff) || (content[0] === 0 && content[1] === 0x3c)) encoding = 'utf-16be'
  return new TextDecoder(encoding, { fatal: true }).decode(content)
}

const parseXml = (content: Buffer) => {
  const xml = decodeXml(content)
  if (/<!DOCTYPE/i.test(xml)) throw new Error('DOCX relationship declarations are not supported')
  return new DOMParser({ onError: () => {
    throw new Error('Invalid DOCX relationships')
  } }).parseFromString(xml, 'application/xml')
}

const assertSafeRelationships = (content: Buffer, relationshipPath: string): string[] => {
  const document = parseXml(content)
  const hyperlinks: string[] = []
  const namespace = 'http://schemas.openxmlformats.org/package/2006/relationships'
  if (document.documentElement?.localName !== 'Relationships' || document.documentElement.namespaceURI !== namespace) {
    throw new Error('Invalid DOCX relationships')
  }
  for (const relationship of Array.from(document.getElementsByTagNameNS(namespace, 'Relationship'))) {
    const mode = relationship.getAttribute('TargetMode')
    if (mode && mode !== 'Internal' && mode !== 'External') throw new Error('Invalid DOCX relationships')
    const type = relationship.getAttribute('Type')
    const target = relationship.getAttribute('Target') ?? ''
    if (mode !== 'External') {
      const decoded = decodeURIComponent(target)
      if (!decoded || decoded !== decoded.trim() || /^[a-z][a-z\d+.-]*:/i.test(decoded)
        || decoded.startsWith('//') || decoded.includes('\\') || Array.from(decoded).some(character => character.charCodeAt(0) < 32)) {
        throw new Error('Invalid DOCX internal relationship target')
      }
      const partPath = decoded.split('#')[0]!
      const resolved = posix.normalize(partPath.startsWith('/')
        ? partPath.slice(1)
        : posix.join(posix.dirname(posix.dirname(relationshipPath)), partPath))
      if (resolved === '..' || resolved.startsWith('../')) throw new Error('Invalid DOCX internal relationship target')
      continue
    }
    if (type !== 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink'
      && type !== 'http://purl.oclc.org/ooxml/officeDocument/relationships/hyperlink') {
      throw new Error('DOCX external resources are not supported')
    }
    const url = new URL(target)
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error('DOCX external resources are not supported')
    const id = relationship.getAttribute('Id')
    if (!id) throw new Error('Invalid DOCX relationships')
    hyperlinks.push(id)
  }
  return hyperlinks
}

const assertHyperlinkUses = (zip: PizZip, relationshipPath: string, ids: string[]): void => {
  if (!ids.length) return
  const hyperlinkIds = new Set(ids)
  const sourcePath = relationshipPath.replace(/(^|\/)_rels\//, '$1').slice(0, -5)
  const source = zip.file(sourcePath)
  if (!source) throw new Error('Invalid DOCX hyperlink source part')
  const document = parseXml(source.asNodeBuffer())
  const relationshipNamespaces = ['http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships']
  const wordNamespaces = ['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main']
  for (const element of Array.from(document.getElementsByTagName('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      const isRelationshipReference = relationshipNamespaces.includes(attribute.namespaceURI ?? '')
        || (attribute.namespaceURI === 'urn:schemas-microsoft-com:office:office' && attribute.localName === 'relid')
      if (!isRelationshipReference || !hyperlinkIds.has(attribute.value)) continue
      if (attribute.localName !== 'id' || element.localName !== 'hyperlink' || !wordNamespaces.includes(element.namespaceURI ?? '')) {
        throw new Error('DOCX external resources are not supported')
      }
    }
  }
}

export const loadBoundedDocx = (bytes: Buffer): PizZip => {
  if (bytes.length > DOCX_MAX_COMPRESSED_BYTES) throw new Error('DOCX compressed byte budget exceeded')
  const zip = new PizZip(bytes)
  const entries = Object.entries(zip.files)
  if (entries.length > DOCX_MAX_ENTRIES) throw new Error('DOCX entry budget exceeded')
  for (const path of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) {
    if (!zip.file(path)) throw new Error('Invalid DOCX package')
  }
  let expandedBytes = 0
  const hyperlinks = new Map<string, string[]>()
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
    if (path.endsWith('.rels')) hyperlinks.set(path, assertSafeRelationships(content, path))
    zip.file(path, content)
  }
  for (const [path, ids] of hyperlinks) assertHyperlinkUses(zip, path, ids)
  return zip
}
