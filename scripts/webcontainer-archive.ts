/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Artifact archive internals are documented at their security boundaries and exported entry points. */
import { isUtf8 } from 'node:buffer'
import crypto from 'node:crypto'
import path from 'node:path'
import { brotliDecompressSync, gunzipSync, inflateRawSync } from 'node:zlib'

const WEB_CONTAINER_APP_ROOT = '/home/project'
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const ZIP_END_OF_CENTRAL_DIRECTORY_LENGTH = 22
const ZIP_MAX_COMMENT_LENGTH = 65_535
const ZIP_LOCAL_FILE_HEADER_LENGTH = 30
const ZIP_CENTRAL_DIRECTORY_HEADER_LENGTH = 46
const ZIP_DATA_DESCRIPTOR_SIGNATURE = 0x08074b50
const ZIP_DATA_DESCRIPTOR_LENGTH = 12
const ZIP_64_SENTINEL = 0xffff_ffff
const ZIP_ENCRYPTION_FLAGS = 0x0041
const DECLARED_ZIP_CONTAINER_EXTENSIONS = new Set(['.docx', '.zip'])

const compareNames = (left: string, right: string): number => {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

const normalizePathSeparators = (filePath: string): string =>
  filePath.split(path.sep).join('/')

const assertSafeTreeEntryName = (entryName: string): void => {
  if (
    entryName.length === 0
    || entryName === '.'
    || entryName === '..'
    || entryName.includes('/')
    || entryName.includes('\\')
    || entryName.includes('\0')
  ) {
    throw new Error(`Unsafe WebContainer artifact entry name "${entryName}".`)
  }
}

interface HostPathReplacement {
  asciiCaseInsensitive: boolean
  buildHostValue: string
  webContainerValue: string
}

/** Builds canonical, slash, URI, and base64 host-path variants. */
const getHostPathReplacements = (
  hostRootPaths: readonly string[]
): HostPathReplacement[] => {
  const replacements = new Map<string, HostPathReplacement>()

  for (const hostRootPath of hostRootPaths) {
    const resolvedRoot = path.resolve(hostRootPath)
    if (resolvedRoot === path.parse(resolvedRoot).root) continue

    const normalizedRoot = normalizePathSeparators(resolvedRoot)
    const backslashRoot = normalizedRoot.replaceAll('/', '\\')
    const webContainerBackslashRoot = WEB_CONTAINER_APP_ROOT.replaceAll('/', '\\')
    const rootVariants: HostPathReplacement[] = [
      {
        asciiCaseInsensitive: true,
        buildHostValue: resolvedRoot,
        webContainerValue: WEB_CONTAINER_APP_ROOT
      },
      {
        asciiCaseInsensitive: true,
        buildHostValue: normalizedRoot,
        webContainerValue: WEB_CONTAINER_APP_ROOT
      },
      {
        asciiCaseInsensitive: true,
        buildHostValue: backslashRoot,
        webContainerValue: webContainerBackslashRoot
      },
      {
        asciiCaseInsensitive: true,
        buildHostValue: `file://${normalizedRoot}`,
        webContainerValue: `file://${WEB_CONTAINER_APP_ROOT}`
      },
      {
        asciiCaseInsensitive: true,
        buildHostValue: encodeURI(normalizedRoot),
        webContainerValue: encodeURI(WEB_CONTAINER_APP_ROOT)
      },
      {
        asciiCaseInsensitive: true,
        buildHostValue: encodeURIComponent(normalizedRoot),
        webContainerValue: encodeURIComponent(WEB_CONTAINER_APP_ROOT)
      },
      {
        asciiCaseInsensitive: false,
        buildHostValue: Buffer.from(normalizedRoot, 'utf-8').toString('base64'),
        webContainerValue: Buffer.from(WEB_CONTAINER_APP_ROOT, 'utf-8').toString('base64')
      }
    ]

    for (const replacement of rootVariants) {
      if (replacement.buildHostValue.length > 0) {
        replacements.set(replacement.buildHostValue, replacement)
      }
    }
  }

  return [...replacements.values()]
    .sort((left, right) => {
      const lengthComparison = right.buildHostValue.length - left.buildHostValue.length
      return lengthComparison === 0
        ? compareNames(left.buildHostValue, right.buildHostValue)
        : lengthComparison
    })
}

const asciiLowerByte = (byte: number): number =>
  byte >= 0x41 && byte <= 0x5a ? byte + 0x20 : byte

const isSerializedPathTerminator = (byte: number): boolean =>
  byte === 0x00
  || (byte >= 0x09 && byte <= 0x0d)
  || byte === 0x20
  || byte === 0x22
  || byte === 0x23
  || byte === 0x26
  || byte === 0x27
  || byte === 0x29
  || byte === 0x2c
  || byte === 0x3a
  || byte === 0x3b
  || byte === 0x3d
  || byte === 0x3e
  || byte === 0x3f
  || byte === 0x5d
  || byte === 0x60
  || byte === 0x7c
  || byte === 0x7d

const hasBufferPathBoundary = (contents: Buffer, matchEnd: number): boolean => {
  if (matchEnd === contents.length) return true
  const nextByte = contents[matchEnd]
  if (nextByte === 0x2f || nextByte === 0x5c || isSerializedPathTerminator(nextByte ?? 0)) {
    return true
  }
  if (nextByte !== 0x25 || matchEnd + 2 >= contents.length) return false

  const firstHexByte = asciiLowerByte(contents[matchEnd + 1] ?? 0)
  const secondHexByte = asciiLowerByte(contents[matchEnd + 2] ?? 0)
  return (firstHexByte === 0x32 && secondHexByte === 0x66)
    || (firstHexByte === 0x35 && secondHexByte === 0x63)
}

/** Finds an ASCII host-path variant without decoding or changing arbitrary binary bytes. */
const bufferIncludesHostPath = (
  contents: Buffer,
  replacement: HostPathReplacement
): boolean => {
  const hostValue = Buffer.from(replacement.buildHostValue, 'utf-8')
  if (hostValue.length > contents.length) return false

  if (!replacement.asciiCaseInsensitive) {
    let offset = contents.indexOf(hostValue)
    while (offset !== -1) {
      if (hasBufferPathBoundary(contents, offset + hostValue.length)) return true
      offset = contents.indexOf(hostValue, offset + hostValue.length)
    }
    return false
  }

  const firstByte = asciiLowerByte(hostValue[0] ?? 0)
  const finalOffset = contents.length - hostValue.length
  for (let offset = 0; offset <= finalOffset; offset += 1) {
    if (asciiLowerByte(contents[offset] ?? 0) !== firstByte) continue

    let matching = true
    for (let index = 1; index < hostValue.length; index += 1) {
      if (asciiLowerByte(contents[offset + index] ?? 0) !== asciiLowerByte(hostValue[index] ?? 0)) {
        matching = false
        break
      }
    }
    if (matching && hasBufferPathBoundary(contents, offset + hostValue.length)) return true
  }

  return false
}

/**
 * Rewrites build-host roots to the stable WebContainer workspace root.
 *
 * @param contents - UTF-8 artifact contents.
 * @param hostRootPaths - Absolute checkout and artifact-parent paths to normalize.
 * @returns Artifact contents without build-host-specific root paths.
 */
export const normalizeHostPaths = (contents: string, hostRootPaths: readonly string[]): string => {
  let normalizedContents = contents
  for (const replacement of getHostPathReplacements(hostRootPaths)) {
    const hostValue = replacement.asciiCaseInsensitive
      ? replacement.buildHostValue.toLowerCase()
      : replacement.buildHostValue
    const webContainerValue = replacement.webContainerValue
    let comparableContents = replacement.asciiCaseInsensitive
      ? normalizedContents.toLowerCase()
      : normalizedContents
    let searchFrom = 0

    while (searchFrom < comparableContents.length) {
      const matchIndex = comparableContents.indexOf(hostValue, searchFrom)
      if (matchIndex === -1) break

      const matchEnd = matchIndex + hostValue.length
      const nextCharacter = comparableContents[matchEnd]
      const encodedSeparator = comparableContents.slice(matchEnd, matchEnd + 3).toLowerCase()
      const hasPathBoundary = matchEnd === comparableContents.length
        || nextCharacter === '/'
        || nextCharacter === '\\'
        || encodedSeparator === '%2f'
        || encodedSeparator === '%5c'

      if (!hasPathBoundary) {
        searchFrom = matchEnd
        continue
      }

      normalizedContents = normalizedContents.slice(0, matchIndex)
        + webContainerValue
        + normalizedContents.slice(matchEnd)
      comparableContents = comparableContents.slice(0, matchIndex)
        + (replacement.asciiCaseInsensitive ? webContainerValue.toLowerCase() : webContainerValue)
        + comparableContents.slice(matchEnd)
      searchFrom = matchIndex + webContainerValue.length
    }
  }

  return normalizedContents
}

const decodeBase64Token = (token: string): Buffer | null => {
  const normalizedToken = token
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(token.length / 4) * 4, '=')
  try {
    const decoded = Buffer.from(normalizedToken, 'base64')
    return decoded.length > 0 ? decoded : null
  } catch {
    return null
  }
}

const isBase64Byte = (byte: number): boolean =>
  (byte >= 0x41 && byte <= 0x5a)
  || (byte >= 0x61 && byte <= 0x7a)
  || (byte >= 0x30 && byte <= 0x39)
  || byte === 0x2b
  || byte === 0x2f
  || byte === 0x2d
  || byte === 0x5f

const isAsciiWhitespaceByte = (byte: number): boolean =>
  (byte >= 0x09 && byte <= 0x0d) || byte === 0x20

const hexByteValue = (byte: number): number => {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30
  const lowerByte = asciiLowerByte(byte)
  return lowerByte >= 0x61 && lowerByte <= 0x66 ? lowerByte - 0x57 : -1
}

interface ArtifactInspectionNode {
  contents: Buffer
  decoded: boolean
  enforceExtension: boolean
  filePath: string
}

interface ArtifactInspectionState {
  decodedBytes: number
  maxDecodedBytes: number
  maxNodes: number
  nodes: number
  seen: Set<string>
}

const artifactInspectionLimitError = (filePath: string): Error => new Error(
  `WebContainer artifact "${normalizePathSeparators(filePath)}" exceeded host-path inspection resource limits.`
)

/** Detects inferred ZIP containers before text normalization can alter their bytes. */
export const isZipArtifactContents = (filePath: string, contents: Buffer): boolean => {
  const result = parseZipArchive(contents, {
    bytes: 0,
    filePath,
    maxBytes: Math.max(64 * 1024 * 1024, contents.length * 2),
    maxNodes: Math.max(4096, Math.ceil(contents.length / 32)),
    nodes: 0
  })
  return result.kind !== 'not-zip'
}

/** Reserves inspection budget before retaining or processing a recursive node. */
const enqueueArtifactInspectionNode = (
  node: ArtifactInspectionNode,
  state: ArtifactInspectionState,
  pending: ArtifactInspectionNode[]
): boolean => {
  const fingerprint = [
    node.decoded ? 'decoded' : 'source',
    node.enforceExtension ? 'enforced' : 'inferred',
    path.extname(node.filePath).toLowerCase(),
    crypto.createHash('sha256').update(node.contents).digest('hex')
  ].join(':')
  if (state.seen.has(fingerprint)) return false

  state.seen.add(fingerprint)
  state.nodes += 1
  state.decodedBytes += node.contents.length
  if (state.nodes > state.maxNodes || state.decodedBytes > state.maxDecodedBytes) {
    throw artifactInspectionLimitError(node.filePath)
  }
  pending.push(node)
  return true
}

/** Decodes one percent-escape layer without interpreting or rewriting other bytes. */
const decodePercentEscapes = (
  contents: Buffer,
  outputLimit: number,
  filePath: string
): Buffer | null => {
  let decodedLength = contents.length
  let hasEscape = false
  for (let index = 0; index + 2 < contents.length; index += 1) {
    if (
      contents[index] === 0x25
      && hexByteValue(contents[index + 1] ?? 0) >= 0
      && hexByteValue(contents[index + 2] ?? 0) >= 0
    ) {
      decodedLength -= 2
      hasEscape = true
      index += 2
    }
  }
  if (!hasEscape) return null
  if (decodedLength > outputLimit) throw artifactInspectionLimitError(filePath)

  const decoded = Buffer.allocUnsafe(decodedLength)
  let outputOffset = 0
  for (let index = 0; index < contents.length; index += 1) {
    const firstHex = hexByteValue(contents[index + 1] ?? 0)
    const secondHex = hexByteValue(contents[index + 2] ?? 0)
    if (contents[index] === 0x25 && firstHex >= 0 && secondHex >= 0) {
      decoded[outputOffset] = (firstHex << 4) | secondHex
      outputOffset += 1
      index += 2
      continue
    }
    decoded[outputOffset] = contents[index] ?? 0
    outputOffset += 1
  }
  return decoded
}

/** Streams canonical Base64 candidates, allowing MIME whitespace between encoded bytes. */
const enqueueBase64DecodedContents = (
  node: ArtifactInspectionNode,
  state: ArtifactInspectionState,
  pending: ArtifactInspectionNode[]
): void => {
  let index = 0
  while (index < node.contents.length) {
    while (index < node.contents.length && !isBase64Byte(node.contents[index] ?? 0)) index += 1
    const start = index
    let encodedBytes = 0
    let paddingBytes = 0
    let end = index

    while (index < node.contents.length) {
      const byte = node.contents[index] ?? 0
      if (isBase64Byte(byte) && paddingBytes === 0) {
        encodedBytes += 1
        index += 1
        end = index
        continue
      }
      if (byte === 0x3d && paddingBytes < 2) {
        paddingBytes += 1
        index += 1
        end = index
        continue
      }
      if (isAsciiWhitespaceByte(byte)) {
        while (index < node.contents.length && isAsciiWhitespaceByte(node.contents[index] ?? 0)) {
          index += 1
        }
        if (
          paddingBytes === 0
          && isBase64Byte(node.contents[index] ?? 0)
        ) {
          continue
        }
        break
      }
      break
    }

    const compactLength = encodedBytes + paddingBytes
    if (encodedBytes < 16 || compactLength % 4 === 1) {
      if (index === start) index += 1
      continue
    }
    if (state.nodes >= state.maxNodes) throw artifactInspectionLimitError(node.filePath)
    const maximumDecodedLength = Math.floor(encodedBytes * 6 / 8)
    if (state.decodedBytes + maximumDecodedLength > state.maxDecodedBytes) {
      throw artifactInspectionLimitError(node.filePath)
    }

    const compactBytes = Buffer.allocUnsafe(compactLength)
    let compactOffset = 0
    for (let candidateOffset = start; candidateOffset < end; candidateOffset += 1) {
      const byte = node.contents[candidateOffset] ?? 0
      if (!isAsciiWhitespaceByte(byte)) {
        compactBytes[compactOffset] = byte
        compactOffset += 1
      }
    }
    const token = compactBytes.toString('ascii')
    const decodedToken = decodeBase64Token(token)
    if (decodedToken === null) continue
    const normalizedToken = token
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .replace(/=+$/, '')
    const canonicalToken = decodedToken.toString('base64').replace(/=+$/, '')
    if (normalizedToken !== canonicalToken) continue

    enqueueArtifactInspectionNode({
      contents: decodedToken,
      decoded: true,
      enforceExtension: false,
      filePath: node.filePath
    }, state, pending)
  }
}

const isDecompressionLimitError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  const errorCode = 'code' in error ? String(error.code) : ''
  return errorCode === 'ERR_BUFFER_TOO_LARGE'
    || /max(?:imum)? output length|larger than.*buffer/i.test(error.message)
}

interface ZipEntryDescriptor {
  compressedContents: Buffer
  compressedSize: number
  compressionMethod: number
  crc32: number
  directory: boolean
  entryName: string
  entryNameContents: Buffer
  sourceOffset: number
  uncompressedSize: number
}

interface ZipMetadataDescriptor {
  contents: Buffer
  pathSuffix: string
}

interface CoherentZipArchive {
  entries: ZipEntryDescriptor[]
  metadata: ZipMetadataDescriptor[]
}

interface ArtifactParseBudget {
  bytes: number
  filePath: string
  maxBytes: number
  maxNodes: number
  nodes: number
}

const reserveArtifactParseBudget = (
  budget: ArtifactParseBudget,
  nodes: number,
  bytes: number
): void => {
  budget.nodes += nodes
  budget.bytes += bytes
  if (budget.nodes > budget.maxNodes || budget.bytes > budget.maxBytes) {
    throw artifactInspectionLimitError(budget.filePath)
  }
}

type ZipParseResult =
  | { kind: 'archive', archive: CoherentZipArchive }
  | { kind: 'malformed' }
  | { kind: 'not-zip' }

interface InflateRawInfo {
  buffer: Buffer
  engine: {
    bytesWritten: number
  }
}

/** Parses length-delimited ZIP extra-field records for recursive inspection. */
const collectZipExtraFieldMetadata = (
  contents: Buffer,
  startOffset: number,
  length: number,
  pathSuffix: string,
  budget: ArtifactParseBudget
): ZipMetadataDescriptor[] | null => {
  const endOffset = startOffset + length
  if (endOffset > contents.length) return null

  const metadata: ZipMetadataDescriptor[] = []
  let fieldOffset = startOffset
  let fieldIndex = 0
  while (fieldOffset < endOffset) {
    if (fieldOffset + 4 > endOffset) return null
    const dataLength = contents.readUInt16LE(fieldOffset + 2)
    const dataStart = fieldOffset + 4
    const dataEnd = dataStart + dataLength
    if (dataEnd > endOffset) return null
    reserveArtifactParseBudget(budget, 1, dataLength)
    metadata.push({
      contents: contents.subarray(dataStart, dataEnd),
      pathSuffix: `${pathSuffix}[${String(fieldIndex)}]`
    })
    fieldOffset = dataEnd
    fieldIndex += 1
  }

  return metadata
}

/** Finds every EOCD candidate whose declared comment reaches the archive boundary. */
const findZipEndOfCentralDirectories = (
  contents: Buffer,
  budget: ArtifactParseBudget
): number[] => {
  if (contents.length < ZIP_END_OF_CENTRAL_DIRECTORY_LENGTH) return []

  const earliestOffset = Math.max(
    0,
    contents.length - ZIP_END_OF_CENTRAL_DIRECTORY_LENGTH - ZIP_MAX_COMMENT_LENGTH
  )
  const endOffsets: number[] = []
  for (
    let offset = contents.length - ZIP_END_OF_CENTRAL_DIRECTORY_LENGTH;
    offset >= earliestOffset;
    offset -= 1
  ) {
    if (contents.readUInt32LE(offset) !== ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      continue
    }

    const commentLength = contents.readUInt16LE(offset + 20)
    if (offset + ZIP_END_OF_CENTRAL_DIRECTORY_LENGTH + commentLength === contents.length) {
      reserveArtifactParseBudget(budget, 1, 0)
      endOffsets.push(offset)
    }
  }

  return endOffsets
}

/** Validates a classic 32-bit data descriptor with or without its signature. */
const zipDataDescriptorIsCoherent = (
  contents: Buffer,
  descriptorOffset: number,
  localRecordEnd: number,
  crc32: number,
  compressedSize: number,
  uncompressedSize: number
): boolean => {
  if (descriptorOffset < 0 || descriptorOffset + ZIP_DATA_DESCRIPTOR_LENGTH > localRecordEnd) {
    return false
  }
  const candidateOffsets = contents.readUInt32LE(descriptorOffset) === ZIP_DATA_DESCRIPTOR_SIGNATURE
    ? [descriptorOffset + 4, descriptorOffset]
    : [descriptorOffset]

  return candidateOffsets.some((candidateOffset) => {
    if (candidateOffset + ZIP_DATA_DESCRIPTOR_LENGTH > localRecordEnd) return false
    const descriptorCrc32 = contents.readUInt32LE(candidateOffset)
    const descriptorCompressedSize = contents.readUInt32LE(candidateOffset + 4)
    const descriptorUncompressedSize = contents.readUInt32LE(candidateOffset + 8)
    const descriptorEnd = candidateOffset + ZIP_DATA_DESCRIPTOR_LENGTH
    return descriptorCompressedSize !== ZIP_64_SENTINEL
      && descriptorUncompressedSize !== ZIP_64_SENTINEL
      && descriptorCrc32 === crc32
      && descriptorCompressedSize === compressedSize
      && descriptorUncompressedSize === uncompressedSize
      && descriptorEnd === localRecordEnd
  })
}

/** Collects the only local-record boundaries recognized by the central directory. */
const collectZipLocalHeaderOffsets = (
  contents: Buffer,
  archiveStart: number,
  centralDirectoryStart: number,
  endOffset: number,
  totalEntries: number,
  budget: ArtifactParseBudget
): number[] | null => {
  if (totalEntries > budget.maxNodes - budget.nodes) {
    throw artifactInspectionLimitError(budget.filePath)
  }
  const localHeaderOffsets = new Set<number>()
  let centralOffset = centralDirectoryStart
  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    if (
      centralOffset + ZIP_CENTRAL_DIRECTORY_HEADER_LENGTH > endOffset
      || contents.readUInt32LE(centralOffset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      return null
    }
    const entryNameLength = contents.readUInt16LE(centralOffset + 28)
    const extraFieldLength = contents.readUInt16LE(centralOffset + 30)
    const entryCommentLength = contents.readUInt16LE(centralOffset + 32)
    const localHeaderOffset = contents.readUInt32LE(centralOffset + 42)
    const centralEntryEnd = centralOffset
      + ZIP_CENTRAL_DIRECTORY_HEADER_LENGTH
      + entryNameLength
      + extraFieldLength
      + entryCommentLength
    const absoluteLocalHeaderOffset = archiveStart + localHeaderOffset
    if (
      localHeaderOffset === ZIP_64_SENTINEL
      || centralEntryEnd > endOffset
      || absoluteLocalHeaderOffset < archiveStart
      || absoluteLocalHeaderOffset + ZIP_LOCAL_FILE_HEADER_LENGTH > centralDirectoryStart
      || localHeaderOffsets.has(absoluteLocalHeaderOffset)
    ) {
      return null
    }
    reserveArtifactParseBudget(budget, 1, 0)
    localHeaderOffsets.add(absoluteLocalHeaderOffset)
    centralOffset = centralEntryEnd
  }
  return centralOffset === endOffset
    ? [...localHeaderOffsets].sort((left, right) => left - right)
    : null
}

/** Parses one ZIP candidate whose EOCD, central directory, and local headers agree. */
const parseCoherentZipEntriesAtOffset = (
  contents: Buffer,
  endOffset: number,
  budget: ArtifactParseBudget
): CoherentZipArchive | null => {
  const diskNumber = contents.readUInt16LE(endOffset + 4)
  const centralDirectoryDisk = contents.readUInt16LE(endOffset + 6)
  const entriesOnDisk = contents.readUInt16LE(endOffset + 8)
  const totalEntries = contents.readUInt16LE(endOffset + 10)
  const centralDirectorySize = contents.readUInt32LE(endOffset + 12)
  const centralDirectoryOffset = contents.readUInt32LE(endOffset + 16)
  if (
    diskNumber !== 0
    || centralDirectoryDisk !== 0
    || entriesOnDisk !== totalEntries
    || centralDirectorySize === ZIP_64_SENTINEL
    || centralDirectoryOffset === ZIP_64_SENTINEL
    || (
      totalEntries === 0
      && (centralDirectorySize !== 0 || centralDirectoryOffset !== 0)
    )
    || centralDirectorySize > endOffset
  ) {
    return null
  }

  const centralDirectoryStart = endOffset - centralDirectorySize
  const archiveStart = centralDirectoryStart - centralDirectoryOffset
  if (archiveStart < 0) return null
  const localHeaderOffsets = collectZipLocalHeaderOffsets(
    contents,
    archiveStart,
    centralDirectoryStart,
    endOffset,
    totalEntries,
    budget
  )
  if (localHeaderOffsets === null) return null
  if (localHeaderOffsets.length > 0 && localHeaderOffsets[0] !== archiveStart) return null
  const metadata: ZipMetadataDescriptor[] = []
  if (archiveStart > 0) {
    reserveArtifactParseBudget(budget, 1, archiveStart)
    metadata.push({
      contents: contents.subarray(0, archiveStart),
      pathSuffix: '#prefix'
    })
  }
  const endCommentStart = endOffset + ZIP_END_OF_CENTRAL_DIRECTORY_LENGTH
  if (endCommentStart < contents.length) {
    reserveArtifactParseBudget(budget, 1, contents.length - endCommentStart)
    metadata.push({
      contents: contents.subarray(endCommentStart),
      pathSuffix: '#eocd-comment'
    })
  }
  const localRecordEnds = new Map<number, number>()
  for (const [offsetIndex, localHeaderOffset] of localHeaderOffsets.entries()) {
    const nextLocalHeaderOffset = localHeaderOffsets[offsetIndex + 1]
    localRecordEnds.set(
      localHeaderOffset,
      nextLocalHeaderOffset === undefined ? centralDirectoryStart : nextLocalHeaderOffset
    )
  }

  const entries: ZipEntryDescriptor[] = []
  let centralOffset = centralDirectoryStart
  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    if (
      centralOffset + ZIP_CENTRAL_DIRECTORY_HEADER_LENGTH > endOffset
      || contents.readUInt32LE(centralOffset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      return null
    }

    const flags = contents.readUInt16LE(centralOffset + 8)
    const versionNeeded = contents.readUInt16LE(centralOffset + 6)
    const compressionMethod = contents.readUInt16LE(centralOffset + 10)
    const crc32 = contents.readUInt32LE(centralOffset + 16)
    const compressedSize = contents.readUInt32LE(centralOffset + 20)
    const uncompressedSize = contents.readUInt32LE(centralOffset + 24)
    const entryNameLength = contents.readUInt16LE(centralOffset + 28)
    const extraFieldLength = contents.readUInt16LE(centralOffset + 30)
    const entryCommentLength = contents.readUInt16LE(centralOffset + 32)
    const startingDisk = contents.readUInt16LE(centralOffset + 34)
    const localHeaderOffset = contents.readUInt32LE(centralOffset + 42)
    const centralEntryEnd = centralOffset
      + ZIP_CENTRAL_DIRECTORY_HEADER_LENGTH
      + entryNameLength
      + extraFieldLength
      + entryCommentLength
    if (
      compressedSize === ZIP_64_SENTINEL
      || uncompressedSize === ZIP_64_SENTINEL
      || localHeaderOffset === ZIP_64_SENTINEL
      || (flags & ZIP_ENCRYPTION_FLAGS) !== 0
      || startingDisk !== 0
      || centralEntryEnd > endOffset
    ) {
      return null
    }

    reserveArtifactParseBudget(budget, 1, entryNameLength + uncompressedSize)

    const entryNameStart = centralOffset + ZIP_CENTRAL_DIRECTORY_HEADER_LENGTH
    const centralExtraFieldStart = entryNameStart + entryNameLength
    const entryNameContents = contents.subarray(
      entryNameStart,
      entryNameStart + entryNameLength
    )
    const entryName = entryNameContents.toString('utf-8')
    const entryCommentStart = centralExtraFieldStart + extraFieldLength
    const centralExtraMetadata = collectZipExtraFieldMetadata(
      contents,
      centralExtraFieldStart,
      extraFieldLength,
      `!/${entryName}#central-extra`,
      budget
    )
    if (centralExtraMetadata === null) return null
    if (extraFieldLength > 0) {
      reserveArtifactParseBudget(budget, 1, extraFieldLength)
      metadata.push({
        contents: contents.subarray(centralExtraFieldStart, entryCommentStart),
        pathSuffix: `!/${entryName}#central-extra`
      })
      metadata.push(...centralExtraMetadata)
    }
    if (entryCommentLength > 0) {
      reserveArtifactParseBudget(budget, 1, entryCommentLength)
      metadata.push({
        contents: contents.subarray(
          entryCommentStart,
          entryCommentStart + entryCommentLength
        ),
        pathSuffix: `!/${entryName}#comment`
      })
    }
    const localOffset = archiveStart + localHeaderOffset
    const localRecordEnd = localRecordEnds.get(localOffset)
    if (
      localRecordEnd === undefined
      || localRecordEnd > centralDirectoryStart
      || localOffset < archiveStart
      || localOffset + ZIP_LOCAL_FILE_HEADER_LENGTH > centralDirectoryStart
      || contents.readUInt32LE(localOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE
    ) {
      return null
    }

    const localVersionNeeded = contents.readUInt16LE(localOffset + 4)
    const localFlags = contents.readUInt16LE(localOffset + 6)
    const localCompressionMethod = contents.readUInt16LE(localOffset + 8)
    const localCrc32 = contents.readUInt32LE(localOffset + 14)
    const localCompressedSize = contents.readUInt32LE(localOffset + 18)
    const localUncompressedSize = contents.readUInt32LE(localOffset + 22)
    const localEntryNameLength = contents.readUInt16LE(localOffset + 26)
    const localExtraFieldLength = contents.readUInt16LE(localOffset + 28)
    const localEntryNameStart = localOffset + ZIP_LOCAL_FILE_HEADER_LENGTH
    const localExtraFieldStart = localEntryNameStart + localEntryNameLength
    const compressedContentsStart = localEntryNameStart
      + localEntryNameLength
      + localExtraFieldLength
    const compressedContentsEnd = compressedContentsStart + compressedSize
    if (
      localFlags !== flags
      || localVersionNeeded !== versionNeeded
      || localCompressionMethod !== compressionMethod
      || compressedContentsEnd > localRecordEnd
      || !contents.subarray(
        localEntryNameStart,
        localEntryNameStart + localEntryNameLength
      ).equals(entryNameContents)
    ) {
      return null
    }

    const localExtraMetadata = collectZipExtraFieldMetadata(
      contents,
      localExtraFieldStart,
      localExtraFieldLength,
      `!/${entryName}#local-extra`,
      budget
    )
    if (localExtraMetadata === null) return null
    if (localExtraFieldLength > 0) {
      reserveArtifactParseBudget(budget, 1, localExtraFieldLength)
      metadata.push({
        contents: contents.subarray(localExtraFieldStart, compressedContentsStart),
        pathSuffix: `!/${entryName}#local-extra`
      })
      metadata.push(...localExtraMetadata)
    }

    const usesDataDescriptor = (flags & 0x0008) !== 0
    if (usesDataDescriptor) {
      const localDescriptorFieldsAreCoherent = (
        (localCrc32 === 0 || localCrc32 === crc32)
        && (localCompressedSize === 0 || localCompressedSize === compressedSize)
        && (localUncompressedSize === 0 || localUncompressedSize === uncompressedSize)
      )
      if (
        !localDescriptorFieldsAreCoherent
        || !zipDataDescriptorIsCoherent(
          contents,
          compressedContentsEnd,
          localRecordEnd,
          crc32,
          compressedSize,
          uncompressedSize
        )
      ) {
        return null
      }
    } else if (
      localCrc32 !== crc32
      || compressedContentsEnd !== localRecordEnd
      || (
        localCompressedSize !== compressedSize
        || localUncompressedSize !== uncompressedSize
      )
    ) {
      return null
    }

    entries.push({
      compressedContents: contents.subarray(compressedContentsStart, compressedContentsEnd),
      compressedSize,
      compressionMethod,
      crc32,
      directory: entryName.endsWith('/'),
      entryName,
      entryNameContents,
      sourceOffset: compressedContentsStart,
      uncompressedSize
    })
    centralOffset = centralEntryEnd
  }

  return centralOffset === endOffset ? { entries, metadata } : null
}

/** Distinguishes opaque bytes from coherent and structurally malformed ZIP archives. */
const parseZipArchive = (
  contents: Buffer,
  budget: ArtifactParseBudget
): ZipParseResult => {
  const endOffsets = findZipEndOfCentralDirectories(contents, budget)
  if (endOffsets.length === 0) return { kind: 'not-zip' }
  const candidateArchive = parseCoherentZipEntriesAtOffset(contents, Math.min(...endOffsets), budget)
  if (candidateArchive === null) return { kind: 'malformed' }
  return {
    kind: 'archive',
    archive: candidateArchive
  }
}

const calculateCrc32 = (contents: Buffer): number => {
  let crc = ZIP_64_SENTINEL
  for (const byte of contents) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ ZIP_64_SENTINEL) >>> 0
}

/** Inflates one ZIP member without allowing output beyond the remaining budget. */
const decompressZipEntry = (
  entry: ZipEntryDescriptor,
  outputLimit: number,
  entryPath: string
): Buffer => {
  if (entry.uncompressedSize > outputLimit || outputLimit < 0) {
    throw artifactInspectionLimitError(entryPath)
  }

  let contents: Buffer
  if (entry.compressionMethod === 0) {
    if (entry.compressedSize > outputLimit) {
      throw artifactInspectionLimitError(entryPath)
    }
    contents = entry.compressedContents
  } else if (entry.compressionMethod === 8) {
    try {
      const inflationResult = inflateRawSync(entry.compressedContents, {
        info: true,
        maxOutputLength: outputLimit
      }) as unknown as InflateRawInfo
      if (inflationResult.engine.bytesWritten !== entry.compressedSize) {
        throw new Error(
          `WebContainer compressed artifact "${normalizePathSeparators(entryPath)}" has trailing ZIP deflate bytes.`
        )
      }
      contents = inflationResult.buffer
    } catch (error) {
      if (isDecompressionLimitError(error)) {
        throw artifactInspectionLimitError(entryPath)
      }
      throw new Error(
        `WebContainer compressed artifact "${normalizePathSeparators(entryPath)}" is not a readable ZIP archive.`,
        { cause: error }
      )
    }
  } else {
    throw new Error(
      `WebContainer compressed artifact "${normalizePathSeparators(entryPath)}" uses unsupported ZIP compression method ${String(entry.compressionMethod)}.`
    )
  }

  if (contents.length !== entry.uncompressedSize) {
    throw new Error(
      `WebContainer compressed artifact "${normalizePathSeparators(entryPath)}" has inconsistent ZIP entry sizes.`
    )
  }
  if (calculateCrc32(contents) !== entry.crc32) {
    throw new Error(
      `WebContainer compressed artifact "${normalizePathSeparators(entryPath)}" has an inconsistent ZIP entry CRC.`
    )
  }
  return contents
}

/** Queues compressed children with their logical filenames intact. */
const compressedArtifactContents = (
  node: ArtifactInspectionNode,
  state: ArtifactInspectionState,
  pending: ArtifactInspectionNode[]
): void => {
  const extension = path.extname(node.filePath).toLowerCase()
  const remainingBytes = (): number => state.maxDecodedBytes - state.decodedBytes

  if (node.contents[0] === 0x1f && node.contents[1] === 0x8b) {
    try {
      const contents = gunzipSync(node.contents, { maxOutputLength: remainingBytes() })
      enqueueArtifactInspectionNode({
        contents,
        decoded: true,
        enforceExtension: false,
        filePath: node.filePath
      }, state, pending)
    } catch (error) {
      if (isDecompressionLimitError(error)) {
        throw artifactInspectionLimitError(node.filePath)
      }
      throw new Error(
        `WebContainer compressed artifact "${normalizePathSeparators(node.filePath)}" is not valid gzip data.`,
        { cause: error }
      )
    }
  } else if (node.enforceExtension && extension === '.gz') {
    throw new Error(
      `WebContainer compressed artifact "${normalizePathSeparators(node.filePath)}" is not valid gzip data.`
    )
  }

  const requireBrotli = node.enforceExtension && extension === '.br'
  if (requireBrotli || node.decoded) {
    try {
      const contents = brotliDecompressSync(node.contents, { maxOutputLength: remainingBytes() })
      enqueueArtifactInspectionNode({
        contents,
        decoded: true,
        enforceExtension: false,
        filePath: node.filePath
      }, state, pending)
    } catch (error) {
      if (isDecompressionLimitError(error)) {
        throw artifactInspectionLimitError(node.filePath)
      }
      if (requireBrotli) {
        throw new Error(
          `WebContainer compressed artifact "${normalizePathSeparators(node.filePath)}" is not valid Brotli data.`,
          { cause: error }
        )
      }
    }
  }

  const requireZip = node.enforceExtension && DECLARED_ZIP_CONTAINER_EXTENSIONS.has(extension)
  const zipResult = parseZipArchive(node.contents, {
    bytes: 0,
    filePath: node.filePath,
    maxBytes: remainingBytes(),
    maxNodes: state.maxNodes - state.nodes,
    nodes: 0
  })
  if (zipResult.kind === 'malformed' || (requireZip && zipResult.kind === 'not-zip')) {
    throw new Error(
      `WebContainer compressed artifact "${normalizePathSeparators(node.filePath)}" is not a readable ZIP archive.`
    )
  }
  if (zipResult.kind === 'archive') {
    for (const metadataEntry of zipResult.archive.metadata) {
      enqueueArtifactInspectionNode({
        contents: metadataEntry.contents,
        decoded: true,
        enforceExtension: false,
        filePath: `${node.filePath}${metadataEntry.pathSuffix}`
      }, state, pending)
    }
    for (const entry of zipResult.archive.entries) {
      const entryPath = `${node.filePath}!/${entry.entryName}`
      enqueueArtifactInspectionNode({
        contents: entry.entryNameContents,
        decoded: true,
        enforceExtension: false,
        filePath: `${entryPath}#name`
      }, state, pending)
      const entryContents = decompressZipEntry(
        entry,
        remainingBytes(),
        entryPath
      )
      if (!entry.directory || entryContents.length > 0) {
        enqueueArtifactInspectionNode({
          contents: entryContents,
          decoded: true,
          enforceExtension: true,
          filePath: entryPath
        }, state, pending)
      }
    }
  }
}

/**
 * Detects raw, encoded, and compressed build-host path material.
 *
 * Textual base64 tokens are recursively decoded so a complete encoded filename
 * or path cannot evade checks merely because the encoded root is not a literal
 * substring of the complete base64 value.
 */
const artifactBufferLeaksHostPath = (
  filePath: string,
  contents: Buffer,
  hostRootPaths: readonly string[],
  enforceCompressionExtension = true
): boolean => {
  const state: ArtifactInspectionState = {
    decodedBytes: 0,
    maxDecodedBytes: Math.max(
      64 * 1024 * 1024,
      Math.min(256 * 1024 * 1024, contents.length * 64)
    ),
    maxNodes: Math.max(
      4096,
      Math.min(250_000, 2048 + Math.ceil(contents.length / 32))
    ),
    nodes: 0,
    seen: new Set()
  }
  const pending: ArtifactInspectionNode[] = []
  enqueueArtifactInspectionNode({
    contents,
    decoded: false,
    enforceExtension: enforceCompressionExtension,
    filePath
  }, state, pending)
  const replacements = getHostPathReplacements(hostRootPaths)

  while (pending.length > 0) {
    const node = pending.pop()
    if (!node) continue

    for (const replacement of replacements) {
      if (bufferIncludesHostPath(node.contents, replacement)) {
        return true
      }
    }

    compressedArtifactContents(node, state, pending)

    if (isUtf8(node.contents)) {
      const percentDecoded = decodePercentEscapes(
        node.contents,
        state.maxDecodedBytes - state.decodedBytes,
        node.filePath
      )
      if (percentDecoded !== null) {
        enqueueArtifactInspectionNode({
          contents: percentDecoded,
          decoded: true,
          enforceExtension: false,
          filePath: node.filePath
        }, state, pending)
      }
      enqueueBase64DecodedContents(node, state, pending)
    }
  }

  return false
}

/** Rejects artifact bytes that recursively expose a build-host root. */
export const assertArtifactContentsDoNotLeakHostPaths = (
  filePath: string,
  contents: Buffer,
  hostRootPaths: readonly string[],
  enforceCompressionExtension = true
): void => {
  if (
    artifactBufferLeaksHostPath(
      filePath,
      contents,
      hostRootPaths,
      enforceCompressionExtension
    )
  ) {
    throw new Error(
      `WebContainer artifact file "${normalizePathSeparators(filePath)}" contains raw, encoded, or compressed build-host path bytes.`
    )
  }
}

/** Rejects unsafe artifact entry names and names containing encoded build-host paths. */
export const assertArtifactEntryNameDoesNotLeakHostPaths = (
  entryName: string,
  hostRootPaths: readonly string[]
): void => {
  assertSafeTreeEntryName(entryName)
  assertArtifactContentsDoNotLeakHostPaths(
    entryName,
    Buffer.from(entryName, 'utf-8'),
    hostRootPaths,
    false
  )
}
