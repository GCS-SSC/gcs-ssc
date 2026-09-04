/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- WebContainer bundling internals are documented at their artifact boundaries and exported entry points. */
import { promises as fs } from 'node:fs'
import type { Dirent, Stats } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { isUtf8 } from 'node:buffer'
import path from 'node:path'
import { execSync } from 'node:child_process'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import {
  assertArtifactContentsDoNotLeakHostPaths,
  assertArtifactEntryNameDoesNotLeakHostPaths,
  isZipArtifactContents,
  normalizeHostPaths
} from './webcontainer-archive.ts'

const OUTPUT_DIR = '.output'
const PREVIEW_DIR = '.agent/reports/webcontainer-preview'
const STAGED_OUTPUT_DIR = '.agent/reports/webcontainer-output'

interface WebContainerFileNode {
  file: {
    contents: string
    encoding?: 'base64'
  }
}

interface WebContainerDirectoryNode {
  directory: Record<string, WebContainerTreeNode>
}

type WebContainerTreeNode = WebContainerFileNode | WebContainerDirectoryNode

interface WebContainerMountPayload {
  mountPoint: string
  tree: Record<string, WebContainerTreeNode>
}

type DirectoryShardBuilder = (
  entryName: string,
  fullPath: string,
  mountPoint: string,
  context: ArtifactTraversalContext
) => Promise<WebContainerMountPayload[]>

interface ArtifactTraversalContext {
  artifactRootPath: string
  artifactRootRealPath: string
  hostRootPaths: readonly string[]
}

interface FileSystemTreeOptions {
  context: ArtifactTraversalContext
  includeNodeModules?: boolean
  ancestorRealPaths?: ReadonlySet<string>
}

interface WebContainerPayloadBundle {
  hash: string
  manifestFileName: string
  manifest: {
    files: Array<{
      file: string
      mountPoint: string
    }>
  }
  serializedPayloads: string[]
}

const BINARY_EXTENSIONS = new Set([
  '.avif',
  '.br',
  '.data',
  '.docx',
  '.eot',
  '.gif',
  '.gz',
  '.ico',
  '.jpg',
  '.jpeg',
  '.otf',
  '.pdf',
  '.png',
  '.ttf',
  '.wasm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip'
])

const compareNames = (left: string, right: string): number => {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

const normalizePathSeparators = (filePath: string): string => {
  return filePath.split(path.sep).join('/')
}

const isWithinArtifactRoot = (artifactRootRealPath: string, candidateRealPath: string): boolean => {
  const relativePath = path.relative(artifactRootRealPath, candidateRealPath)
  return (
    relativePath === ''
    || (
      relativePath !== '..'
      && !relativePath.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relativePath)
    )
  )
}

const haveSameFileIdentity = (left: Stats, right: Stats): boolean =>
  left.dev === right.dev && left.ino === right.ino

/**
 * Resolves the inode held by an open descriptor rather than reopening its path.
 *
 * @param filePath - Lexical path used to open the file.
 * @param handle - Open file handle whose inode will be read.
 * @param openedStats - Identity captured from the open handle.
 * @param platform - Platform whose descriptor namespace should be used.
 * @returns Canonical path for the opened inode or its identity-checked lexical fallback.
 */
export const resolveOpenedFileRealPath = async (
  filePath: string,
  handle: FileHandle,
  openedStats: Stats,
  platform: NodeJS.Platform = process.platform
): Promise<string> => {
  const descriptorPaths = platform === 'linux'
    ? [`/proc/self/fd/${handle.fd}`]
    : platform === 'darwin'
      ? [`/dev/fd/${handle.fd}`]
      : []

  for (const descriptorPath of descriptorPaths) {
    try {
      const descriptorStats = await fs.stat(descriptorPath)
      if (!haveSameFileIdentity(openedStats, descriptorStats)) {
        continue
      }

      const descriptorRealPath = await fs.realpath(descriptorPath)
      if (path.resolve(descriptorRealPath) !== path.resolve(descriptorPath)) {
        return descriptorRealPath
      }
    } catch {
      // Fall back to matching the opened file against the current path.
    }
  }

  const currentRealPath = await fs.realpath(filePath)
  const currentStats = await fs.stat(currentRealPath)
  if (!haveSameFileIdentity(openedStats, currentStats)) {
    throw new Error(
      `WebContainer artifact file "${normalizePathSeparators(filePath)}" changed while it was being read.`
    )
  }

  return currentRealPath
}

interface ContainedArtifactFile {
  contents: Buffer
  realPath: string
}

/** Reads a regular artifact file only while its opened inode remains contained. */
const readContainedArtifactFile = async (
  filePath: string,
  context: ArtifactTraversalContext
): Promise<ContainedArtifactFile | null> => {
  let handle: FileHandle
  try {
    handle = await fs.open(filePath, 'r')
  } catch (error) {
    throw new Error(
      `WebContainer artifact file "${normalizePathSeparators(filePath)}" could not be opened.`,
      { cause: error }
    )
  }

  try {
    const openedStats = await handle.stat()
    if (!openedStats.isFile()) {
      throw new Error(
        `WebContainer artifact file "${normalizePathSeparators(filePath)}" is not a regular file.`
      )
    }

    const openedRealPath = await resolveOpenedFileRealPath(filePath, handle, openedStats)
    if (openedStats.nlink > 1) {
      throw new Error(
        `WebContainer artifact file "${normalizePathSeparators(filePath)}" has multiple hard links.`
      )
    }
    if (!isWithinArtifactRoot(context.artifactRootRealPath, openedRealPath)) {
      throw new Error(
        `WebContainer artifact file "${normalizePathSeparators(filePath)}" resolves outside the standalone artifact root.`
      )
    }
    if (shouldExcludeArtifactEntry(filePath, openedRealPath, context)) {
      return null
    }

    return {
      contents: await handle.readFile(),
      realPath: openedRealPath
    }
  } finally {
    await handle.close()
  }
}

const readSortedDirectoryEntries = async (dir: string): Promise<Dirent[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries.sort((left, right) => compareNames(left.name, right.name))
}

const isContainedRelativePath = (relativePath: string): boolean => {
  return (
    relativePath === ''
    || (
      relativePath !== '..'
      && !relativePath.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relativePath)
    )
  )
}

const getArtifactRelativePath = (rootPath: string, candidatePath: string): string | null => {
  const relativePath = path.relative(rootPath, candidatePath)
  return isContainedRelativePath(relativePath)
    ? normalizePathSeparators(relativePath)
    : null
}

const createArtifactTraversalContext = async (
  outputDir: string
): Promise<ArtifactTraversalContext> => {
  const artifactRootPath = path.resolve(outputDir)
  const artifactRootRealPath = await fs.realpath(outputDir)
  const candidateHostRootPaths = [
    process.cwd(),
    path.dirname(artifactRootPath),
    path.dirname(artifactRootRealPath)
  ]
  const checkoutRoot = path.resolve(process.cwd())
  const hostRootPaths = candidateHostRootPaths.filter((candidatePath, candidateIndex) => {
    const resolvedCandidate = path.resolve(candidatePath)
    if (resolvedCandidate === checkoutRoot) return candidateIndex === 0
    if (isWithinArtifactRoot(resolvedCandidate, checkoutRoot)) return false
    return candidateHostRootPaths.findIndex(value => path.resolve(value) === resolvedCandidate) === candidateIndex
  })

  return {
    artifactRootPath,
    artifactRootRealPath,
    hostRootPaths
  }
}

/** Copies an artifact tree while resolving only links contained by its source root. */
export const copyContainedArtifactTree = async (
  sourceDirectory: string,
  destinationDirectory: string
): Promise<void> => {
  const context = await createArtifactTraversalContext(sourceDirectory)
  const destinationRoot = path.resolve(destinationDirectory)

  if (isWithinArtifactRoot(context.artifactRootRealPath, destinationRoot)) {
    throw new Error('WebContainer staging destination must be outside the source artifact root.')
  }

  const copyDirectory = async (
    sourcePath: string,
    destinationPath: string,
    ancestorRealPaths: ReadonlySet<string>
  ): Promise<void> => {
    const sourceRealPath = await fs.realpath(sourcePath)
    if (!isWithinArtifactRoot(context.artifactRootRealPath, sourceRealPath)) {
      throw new Error(
        `WebContainer artifact entry "${normalizePathSeparators(sourcePath)}" resolves outside the standalone artifact root.`
      )
    }
    if (ancestorRealPaths.has(sourceRealPath)) {
      throw new Error(
        `WebContainer artifact directory "${normalizePathSeparators(sourcePath)}" contains a symbolic-link cycle.`
      )
    }

    const nextAncestors = new Set(ancestorRealPaths)
    nextAncestors.add(sourceRealPath)
    await fs.mkdir(destinationPath, { recursive: true })

    for (const entry of await readSortedDirectoryEntries(sourcePath)) {
      const sourceEntryPath = path.join(sourcePath, entry.name)
      const destinationEntryPath = path.join(destinationPath, entry.name)
      const { isDirectory, isFile } = await getContainedDirectoryEntryKind(
        sourceEntryPath,
        entry,
        context.artifactRootRealPath
      )

      if (isDirectory) {
        await copyDirectory(sourceEntryPath, destinationEntryPath, nextAncestors)
      } else if (isFile) {
        const artifactFile = await readContainedArtifactFile(sourceEntryPath, context)
        if (artifactFile !== null) {
          await fs.writeFile(destinationEntryPath, artifactFile.contents)
        }
      }
    }
  }

  await copyDirectory(sourceDirectory, destinationDirectory, new Set())
}

/**
 * Encodes a file for the WebContainer filesystem payload.
 *
 * @param filePath - Source file path used to infer binary handling.
 * @param contents - Raw file contents.
 * @returns Encoded file contents for a WebContainer tree node.
 */
export const encodeFileContents = (filePath: string, contents: Buffer): WebContainerFileNode['file'] => {
  const extension = path.extname(filePath).toLowerCase()
  if (!BINARY_EXTENSIONS.has(extension) && isUtf8(contents)) {
    return {
      contents: contents.toString('utf-8')
    }
  }

  return {
    contents: contents.toString('base64'),
    encoding: 'base64'
  }
}

/** Normalizes text paths and rejects raw host paths before binary encoding. */
const encodeArtifactFileContents = (
  filePath: string,
  contents: Buffer,
  context: ArtifactTraversalContext
): WebContainerFileNode['file'] => {
  const extension = path.extname(filePath).toLowerCase()
  const hasBinaryExtension = BINARY_EXTENSIONS.has(extension)
  const hasUtf8Contents = isUtf8(contents)
  const inferredZipArtifact = !hasBinaryExtension
    && hasUtf8Contents
    && isZipArtifactContents(filePath, contents)
  if (hasBinaryExtension || !hasUtf8Contents || inferredZipArtifact) {
    assertArtifactContentsDoNotLeakHostPaths(filePath, contents, context.hostRootPaths)
    if (inferredZipArtifact) {
      return {
        contents: contents.toString('base64'),
        encoding: 'base64'
      }
    }
    return encodeFileContents(filePath, contents)
  }

  const normalizedContents = Buffer.from(
    normalizeHostPaths(contents.toString('utf-8'), context.hostRootPaths),
    'utf-8'
  )
  assertArtifactContentsDoNotLeakHostPaths(
    filePath,
    normalizedContents,
    context.hostRootPaths
  )
  return encodeFileContents(filePath, normalizedContents)
}

/**
 * Excludes optional assets that are too large for the in-browser demo bootstrap.
 *
 * @param filePath - Source file path to evaluate.
 * @returns Whether the file should be omitted from the preview payload.
 */
export const shouldExcludeFromWebContainer = (filePath: string): boolean => {
  const normalizedPath = normalizePathSeparators(filePath)
    .replace(/^\.\/+/, '')
    .replace(/^\.output\//, '')
  const pathSegments = normalizedPath.split('/').filter(Boolean)

  if (
    pathSegments[0] !== 'public'
    || pathSegments[1] !== 'extensions'
    || pathSegments[2] === undefined
  ) {
    return false
  }

  const extensionPathSegments = pathSegments.slice(3)
  if (extensionPathSegments.includes('models')) {
    return true
  }

  const fileName = extensionPathSegments.at(-1)
  const parentDirectory = extensionPathSegments.at(-2)
  return (
    parentDirectory === 'client'
    && fileName !== undefined
    && /^ort-wasm.*\.(?:mjs|wasm)$/.test(fileName)
  )
}

const shouldExcludeArtifactEntry = (
  fullPath: string,
  realPath: string,
  context: ArtifactTraversalContext
): boolean => {
  const lexicalRelativePath = getArtifactRelativePath(
    context.artifactRootPath,
    path.resolve(fullPath)
  )
  const resolvedRelativePath = getArtifactRelativePath(
    context.artifactRootRealPath,
    realPath
  )

  return (
    (lexicalRelativePath !== null && shouldExcludeFromWebContainer(lexicalRelativePath))
    || (resolvedRelativePath !== null && shouldExcludeFromWebContainer(resolvedRelativePath))
  )
}

/**
 * Removes previous generated filesystem shards before writing the current build.
 */
const removeStaleFileSystemTrees = async (previewDirectory: string) => {
  const entries = (await fs.readdir(previewDirectory).catch(() => [])).sort(compareNames)
  await Promise.all(
    entries
      .filter(file => /^files(?:\.[a-f0-9]{8,64})?(?:\.\d+|\.manifest)?\.json$/.test(file))
      .map(file => fs.unlink(path.join(previewDirectory, file)))
  )
}

/**
 * Resolves regular and symlinked directory entry types.
 *
 * @param fullPath - Absolute or workspace-relative entry path.
 * @param entry - Directory entry returned by readdir.
 * @returns File and directory flags for the entry.
 */
const getDirectoryEntryKind = async (fullPath: string, entry: Dirent) => {
  let isDirectory = entry.isDirectory()
  let isFile = entry.isFile()

  if (entry.isSymbolicLink()) {
    try {
      const stats = await fs.stat(fullPath)
      isDirectory = stats.isDirectory()
      isFile = stats.isFile()
    } catch (error) {
      throw new Error(
        `WebContainer artifact entry "${normalizePathSeparators(fullPath)}" is a broken or unreadable symbolic link.`,
        { cause: error }
      )
    }
  }

  if (!isDirectory && !isFile) {
    throw new Error(
      `WebContainer artifact entry "${normalizePathSeparators(fullPath)}" is not a regular file or directory.`
    )
  }

  return { isDirectory, isFile }
}

/**
 * Resolves an entry only when its real path remains inside the output artifact.
 *
 * @param fullPath - Absolute or workspace-relative entry path.
 * @param entry - Directory entry returned by readdir.
 * @param artifactRootRealPath - Canonical standalone output root.
 * @returns Contained file and directory flags plus the canonical entry path.
 */
const getContainedDirectoryEntryKind = async (
  fullPath: string,
  entry: Dirent,
  artifactRootRealPath: string
) => {
  const { isDirectory, isFile } = await getDirectoryEntryKind(fullPath, entry)
  if (!isDirectory && !isFile) {
    return { isDirectory: false, isFile: false, realPath: null }
  }

  try {
    const realPath = await fs.realpath(fullPath)
    if (!isWithinArtifactRoot(artifactRootRealPath, realPath)) {
      throw new Error(
        `WebContainer artifact entry "${normalizePathSeparators(fullPath)}" resolves outside the standalone artifact root.`
      )
    }

    return { isDirectory, isFile, realPath }
  } catch (error) {
    if (error instanceof Error && error.message.includes('standalone artifact root')) {
      throw error
    }
    throw new Error(
      `WebContainer artifact entry "${normalizePathSeparators(fullPath)}" could not be resolved.`,
      { cause: error }
    )
  }
}

/**
 * Builds a file system tree from a directory.
 *
 * @param dir - The directory to build the tree from.
 * @param options - Artifact containment and recursion options.
 * @returns A promise that resolves to the file system tree.
 */
const buildFileSystemTree = async (
  dir: string,
  options: FileSystemTreeOptions
): Promise<Record<string, WebContainerTreeNode>> => {
  const tree: Record<string, WebContainerTreeNode> = {}
  const dirRealPath = await fs.realpath(dir)
  if (!isWithinArtifactRoot(options.context.artifactRootRealPath, dirRealPath)) {
    throw new Error(
      `WebContainer artifact directory "${normalizePathSeparators(dir)}" resolves outside the standalone artifact root.`
    )
  }

  const ancestorRealPaths = new Set(options.ancestorRealPaths)
  ancestorRealPaths.add(dirRealPath)
  const entries = await readSortedDirectoryEntries(dir)

  for (const entry of entries) {
    assertArtifactEntryNameDoesNotLeakHostPaths(entry.name, options.context.hostRootPaths)
    const fullPath = path.join(dir, entry.name)

    if (entry.name === 'node_modules' && options.includeNodeModules !== true) continue

    const { isDirectory, isFile, realPath } = await getContainedDirectoryEntryKind(
      fullPath,
      entry,
      options.context.artifactRootRealPath
    )
    if (
      realPath !== null
      && shouldExcludeArtifactEntry(fullPath, realPath, options.context)
    ) {
      continue
    }

    if (isDirectory && realPath !== null) {
      if (ancestorRealPaths.has(realPath)) {
        continue
      }

      const childTree = await buildFileSystemTree(fullPath, {
        ...options,
        ancestorRealPaths
      })
      if (Object.keys(childTree).length > 0) {
        tree[entry.name] = {
          directory: childTree
        }
      }
    } else if (isFile && realPath !== null) {
      const openedFile = await readContainedArtifactFile(fullPath, options.context)
      if (!openedFile) continue

      tree[entry.name] = {
        file: encodeArtifactFileContents(fullPath, openedFile.contents, options.context)
      }
    }
  }
  return tree
}

/**
 * Builds a mount payload for a regular child directory.
 *
 * @param entryName - Directory entry name.
 * @param fullPath - Host path to the directory.
 * @param mountPoint - WebContainer parent mount point.
 * @param context - Artifact traversal and normalization context.
 * @returns Mount payload for the child directory.
 */
const buildRegularDirectoryShard = async (
  entryName: string,
  fullPath: string,
  mountPoint: string,
  context: ArtifactTraversalContext
): Promise<WebContainerMountPayload[]> => [{
  mountPoint: `${mountPoint}/${entryName}`,
  tree: await buildFileSystemTree(fullPath, {
    context
  })
}]

/**
 * Builds mount payloads from child directories and root files.
 *
 * @param dir - Directory to shard.
 * @param mountPoint - WebContainer path where shards are mounted.
 * @param buildDirectoryShard - Strategy for converting a child directory to a payload.
 * @param context - Artifact traversal and normalization context.
 * @returns Mount payloads with root files first when present.
 */
const buildShardsFromDirectory = async (
  dir: string,
  mountPoint: string,
  buildDirectoryShard: DirectoryShardBuilder,
  context: ArtifactTraversalContext
): Promise<WebContainerMountPayload[]> => {
  const payloads: WebContainerMountPayload[] = []
  const rootTree: Record<string, WebContainerTreeNode> = {}
  const directoryRealPath = await fs.realpath(dir)
  if (!isWithinArtifactRoot(context.artifactRootRealPath, directoryRealPath)) {
    throw new Error(
      `WebContainer artifact directory "${normalizePathSeparators(dir)}" resolves outside the standalone artifact root.`
    )
  }

  const entries = await readSortedDirectoryEntries(dir)

  for (const entry of entries) {
    assertArtifactEntryNameDoesNotLeakHostPaths(entry.name, context.hostRootPaths)
    const fullPath = path.join(dir, entry.name)
    const { isDirectory, isFile, realPath } = await getContainedDirectoryEntryKind(
      fullPath,
      entry,
      context.artifactRootRealPath
    )
    if (
      realPath !== null
      && shouldExcludeArtifactEntry(fullPath, realPath, context)
    ) {
      continue
    }

    if (isDirectory) {
      payloads.push(...await buildDirectoryShard(entry.name, fullPath, mountPoint, context))
    } else if (isFile && realPath !== null) {
      const openedFile = await readContainedArtifactFile(fullPath, context)
      if (!openedFile) continue

      rootTree[entry.name] = {
        file: encodeArtifactFileContents(fullPath, openedFile.contents, context)
      }
    }
  }

  if (Object.keys(rootTree).length > 0) {
    payloads.unshift({ mountPoint, tree: rootTree })
  }

  return payloads
}

/**
 * Builds one mount payload per direct child directory to lower browser peak memory.
 *
 * @param dir - Directory to shard.
 * @param mountPoint - WebContainer path where shards are mounted.
 * @param context - Artifact traversal and normalization context.
 * @returns Mount payloads for files and direct child directories.
 */
const buildDirectoryShards = async (
  dir: string,
  mountPoint: string,
  context: ArtifactTraversalContext
): Promise<WebContainerMountPayload[]> =>
  await buildShardsFromDirectory(dir, mountPoint, buildRegularDirectoryShard, context)

/**
 * Builds one mount payload per package inside a scoped node_modules directory.
 *
 * @param scopePath - Directory for a package scope such as `@scope`.
 * @param scopeName - Package scope such as `@scope`.
 * @param mountPoint - WebContainer node_modules mount path.
 * @param context - Artifact traversal and normalization context.
 * @returns WebContainer payloads mounted at their complete scoped package paths.
 */
const buildScopedPackageShards = async (
  scopePath: string,
  scopeName: string,
  mountPoint: string,
  context: ArtifactTraversalContext
): Promise<WebContainerMountPayload[]> => {
  const scopedEntries = await readSortedDirectoryEntries(scopePath)
  const scopedPayloads: WebContainerMountPayload[] = []

  for (const scopedEntry of scopedEntries) {
    assertArtifactEntryNameDoesNotLeakHostPaths(scopedEntry.name, context.hostRootPaths)
    const scopedPath = path.join(scopePath, scopedEntry.name)
    const { isDirectory, realPath } = await getContainedDirectoryEntryKind(
      scopedPath,
      scopedEntry,
      context.artifactRootRealPath
    )
    if (
      !isDirectory
      || realPath === null
      || shouldExcludeArtifactEntry(scopedPath, realPath, context)
    ) continue

    scopedPayloads.push({
      mountPoint: `${mountPoint}/${scopeName}/${scopedEntry.name}`,
      tree: await buildFileSystemTree(scopedPath, {
        context,
        includeNodeModules: true
      })
    })
  }

  return scopedPayloads
}

/**
 * Builds the shard payload for a node_modules package directory.
 *
 * @param entryName - Package or scope directory name.
 * @param fullPath - Host path to the package or scope.
 * @param mountPoint - WebContainer node_modules mount path.
 * @param context - Artifact traversal and normalization context.
 * @returns Mount payloads for the package or packages inside the scope.
 */
const buildNodeModulesDirectoryShard = async (
  entryName: string,
  fullPath: string,
  mountPoint: string,
  context: ArtifactTraversalContext
): Promise<WebContainerMountPayload[]> => {
  // Nitro's private package store is materialized through the direct package
  // symlinks that follow it; serializing the store itself would duplicate every
  // runtime package and reintroduce its symlink cycles.
  if (entryName === '.nitro') {
    return []
  }

  if (entryName.startsWith('@')) {
    return await buildScopedPackageShards(fullPath, entryName, mountPoint, context)
  }

  return [{
    mountPoint: `${mountPoint}/${entryName}`,
    tree: await buildFileSystemTree(fullPath, {
      context,
      includeNodeModules: true
    })
  }]
}

/**
 * Builds package-level node_modules shards so large dependencies mount incrementally.
 *
 * @param dir - node_modules directory to shard.
 * @param mountPoint - WebContainer node_modules mount path.
 * @param context - Optional artifact context when building as part of the standalone output.
 * @returns Mount payloads split by package.
 */
export const buildNodeModulesShards = async (
  dir: string,
  mountPoint: string,
  context?: ArtifactTraversalContext
): Promise<WebContainerMountPayload[]> => {
  const resolvedContext = context === undefined
    ? {
        artifactRootPath: path.resolve(dir),
        artifactRootRealPath: await fs.realpath(dir),
        hostRootPaths: []
      }
    : context
  return await buildShardsFromDirectory(
    dir,
    mountPoint,
    buildNodeModulesDirectoryShard,
    resolvedContext
  )
}

/**
 * Builds a mandatory standalone server file after validating containment and type.
 *
 * @param filePath - Required standalone server file.
 * @param context - Artifact traversal and normalization context.
 * @returns Encoded WebContainer file node.
 */
const buildRequiredContainedFileNode = async (
  filePath: string,
  context: ArtifactTraversalContext
): Promise<WebContainerFileNode> => {
  let handle: FileHandle
  try {
    handle = await fs.open(filePath, 'r')
  } catch {
    throw new Error(
      `Required WebContainer server file "${normalizePathSeparators(filePath)}" is missing or has a broken link.`
    )
  }

  try {
    const openedStats = await handle.stat()
    if (!openedStats.isFile()) {
      throw new Error(
        `Required WebContainer server file "${normalizePathSeparators(filePath)}" must be a regular file.`
      )
    }

    const openedRealPath = await resolveOpenedFileRealPath(filePath, handle, openedStats)
    if (openedStats.nlink > 1) {
      throw new Error(
        `Required WebContainer server file "${normalizePathSeparators(filePath)}" has multiple hard links.`
      )
    }
    if (!isWithinArtifactRoot(context.artifactRootRealPath, openedRealPath)) {
      throw new Error(
        `Required WebContainer server file "${normalizePathSeparators(filePath)}" resolves outside the standalone artifact root.`
      )
    }

    return {
      file: encodeArtifactFileContents(filePath, await handle.readFile(), context)
    }
  } finally {
    await handle.close()
  }
}

/** Rejects missing, non-directory, or escaped standalone runtime directories. */
const assertRequiredContainedDirectory = async (
  directoryPath: string,
  context: ArtifactTraversalContext
): Promise<void> => {
  let directoryRealPath: string
  try {
    directoryRealPath = await fs.realpath(directoryPath)
  } catch {
    throw new Error(
      `Required WebContainer server directory "${normalizePathSeparators(directoryPath)}" is missing or has a broken link.`
    )
  }

  if (!isWithinArtifactRoot(context.artifactRootRealPath, directoryRealPath)) {
    throw new Error(
      `Required WebContainer server directory "${normalizePathSeparators(directoryPath)}" resolves outside the standalone artifact root.`
    )
  }

  const stats = await fs.stat(directoryPath)
  if (!stats.isDirectory()) {
    throw new Error(
      `Required WebContainer server directory "${normalizePathSeparators(directoryPath)}" must be a directory.`
    )
  }
}

const sortPayloads = (payloads: WebContainerMountPayload[]): WebContainerMountPayload[] => {
  return payloads.sort((left, right) => compareNames(left.mountPoint, right.mountPoint))
}

/**
 * Builds deterministic payload filenames and a manifest from canonical mount records.
 *
 * @param payloads - Filesystem payloads to serialize.
 * @returns Canonical serialized payloads, cache hash, and manifest.
 */
export const buildWebContainerPayloadBundle = (
  payloads: WebContainerMountPayload[]
): WebContainerPayloadBundle => {
  const canonicalPayloads = sortPayloads([...payloads])
  const serializedPayloads = canonicalPayloads.map(payload => JSON.stringify(payload.tree))
  const serializedRecords = canonicalPayloads.map(payload => JSON.stringify({
    mountPoint: payload.mountPoint,
    tree: payload.tree
  }))
  const hash = crypto.createHash('sha256').update(serializedRecords.join('\n')).digest('hex').slice(0, 12)
  const manifestFileName = `files.${hash}.manifest.json`
  const manifest = {
    files: canonicalPayloads.map((payload, index) => ({
      file: `files.${hash}.${index}.json`,
      mountPoint: payload.mountPoint
    }))
  }

  return {
    hash,
    manifestFileName,
    manifest,
    serializedPayloads
  }
}

/**
 * Builds all mount payloads required to run the standalone Nuxt output.
 *
 * @param outputDir - Standalone Nuxt output directory.
 * @returns Mount payloads for the Nuxt public and server output.
 */
export const buildOutputPayloads = async (
  outputDir = OUTPUT_DIR
): Promise<WebContainerMountPayload[]> => {
  const context = await createArtifactTraversalContext(outputDir)
  const serverDir = path.join(outputDir, 'server')
  const chunksDir = path.join(serverDir, 'chunks')
  const nodeModulesDir = path.join(serverDir, 'node_modules')
  const serverTree: Record<string, WebContainerTreeNode> = {}
  const serverFiles = ['index.mjs', 'package.json'].sort(compareNames)

  await assertRequiredContainedDirectory(chunksDir, context)
  await assertRequiredContainedDirectory(nodeModulesDir, context)

  for (const serverFile of serverFiles) {
    const fileNode = await buildRequiredContainedFileNode(
      path.join(serverDir, serverFile),
      context
    )
    serverTree[serverFile] = fileNode
  }
  serverTree['demo-migrations'] = {
    directory: {
      'demo.mjs': await buildRequiredContainedFileNode(
        path.join(serverDir, 'demo-migrations', 'demo.mjs'),
        context
      )
    }
  }

  const demoDocumentNode = await buildRequiredContainedFileNode(
    path.join(outputDir, 'webcontainer', 'demo-assets', 'Contribution Agreement.docx'),
    context
  )

  return sortPayloads([
    ...(await buildDirectoryShards(
      path.join(outputDir, 'public'),
      '.output/public',
      context
    )),
    ...(await buildDirectoryShards(
      chunksDir,
      '.output/server/chunks',
      context
    )),
    ...(await buildNodeModulesShards(
      nodeModulesDir,
      '.output/server/node_modules',
      context
    )),
    {
      mountPoint: '.output/server',
      tree: serverTree
    },
    {
      mountPoint: 'demo-assets',
      tree: {
        'Contribution Agreement.docx': demoDocumentNode
      }
    }
  ])
}

export interface GeneratedWebContainerPreview {
  hash: string
  manifestFileName: string
  payloadCount: number
}

/**
 * Generates the deployable browser preview from an existing standalone output.
 *
 * @param outputDirectory - Standalone Nuxt output to serialize.
 * @param previewDirectory - Destination for wrapper, manifest, and immutable shards.
 * @returns Generated manifest identity and payload count.
 */
export const generateWebContainerPreview = async (
  outputDirectory = OUTPUT_DIR,
  previewDirectory = PREVIEW_DIR
): Promise<GeneratedWebContainerPreview> => {
  if (!(await fs.stat(previewDirectory).catch(() => null))) {
    await fs.mkdir(previewDirectory, { recursive: true })
  }

  console.log('📦 Generating FileSystemTree...')
  if (!(await fs.stat(outputDirectory).catch(() => null))) {
    throw new Error(`Standalone output directory not found at ${outputDirectory}. Build failed?`)
  }
  const payloads = await buildOutputPayloads(outputDirectory)
  const {
    hash,
    manifestFileName,
    manifest,
    serializedPayloads
  } = buildWebContainerPayloadBundle(payloads)

  console.log('💾 Writing files.json...')
  await removeStaleFileSystemTrees(previewDirectory)
  await Promise.all(
    serializedPayloads.map((payload, index) =>
      fs.writeFile(path.join(previewDirectory, `files.${hash}.${index}.json`), payload)
    )
  )
  await fs.writeFile(path.join(previewDirectory, manifestFileName), JSON.stringify(manifest))

  const headersContent = `/index.html
  Cache-Control: no-cache, no-store, must-revalidate
/files.*.json
  Cache-Control: public, max-age=31536000, immutable
`
  await fs.writeFile(path.join(previewDirectory, '_headers'), headersContent)

  const indexHtmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <title>GCS-SSC WebContainer Preview</title>
    <script src="coi-serviceworker.js"></script>
    <style>
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: sans-serif; background: #000; color: #fff; }
        #status { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; width: 100%; padding: 20px; box-sizing: border-box; }
        iframe { width: 100%; height: 100%; border: none; display: none; background: #fff; }
        .spinner { border: 4px solid rgba(255,255,255,.1); border-left-color: #fff; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        pre { text-align: left; background: #111; padding: 15px; border-radius: 8px; max-height: 300px; overflow: auto; font-size: 11px; margin-top: 20px; color: #aaa; border: 1px solid #333; }
        h2 { margin: 0 0 10px; font-weight: 300; letter-spacing: -0.5px; }
        p { color: #888; font-size: 14px; }
    </style>
</head>
<body>
    <div id="status">
        <div class="spinner"></div>
        <h2>Initializing WebContainer</h2>
        <p id="step">Fetching filesystem...</p>
        <pre id="logs"></pre>
    </div>
    <iframe id="preview"></iframe>

    <script type="module">
        import { WebContainer } from 'https://unpkg.com/@webcontainer/api@1.5.1/dist/index.js';

        const stepEl = document.getElementById('step');
        const statusEl = document.getElementById('status');
        const iframeEl = document.getElementById('preview');
        const logsEl = document.getElementById('logs');

        function log(msg) {
            if (!msg) return;
            const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
            logsEl.textContent += text + '\\n';
            logsEl.scrollTop = logsEl.scrollHeight;
            console.log('[WebContainer]', text);
        }

        function assertSafeEntryName(entryName) {
            if (
                typeof entryName !== 'string'
                || entryName.length === 0
                || entryName === '.'
                || entryName === '..'
                || entryName.includes('/')
                || entryName.includes('\\\\')
                || entryName.includes('\\0')
            ) {
                throw new Error('Unsafe filesystem entry name: ' + String(entryName));
            }
        }

        function decodeTree(node) {
            if (node.directory) {
                for (const [key, child] of Object.entries(node.directory)) {
                    assertSafeEntryName(key);
                    decodeTree(child);
                }
            } else if (node.file && node.file.encoding === 'base64' && typeof node.file.contents === 'string') {
                const binaryString = atob(node.file.contents);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                node.file.contents = bytes;
                delete node.file.encoding;
            }
        }

        function treeForMountPoint(mountPoint, tree) {
            if (
                typeof mountPoint !== 'string'
                || (!mountPoint.startsWith('.output/') && mountPoint !== 'demo-assets')
                || mountPoint.includes('\\\\')
            ) {
                throw new Error('Unsafe WebContainer mount point: ' + String(mountPoint));
            }
            const segments = mountPoint.split('/').filter(Boolean);
            if (segments.some(segment => segment === '.' || segment === '..')) {
                throw new Error('Unsafe WebContainer mount point: ' + mountPoint);
            }
            let wrapped = tree;
            for (let i = segments.length - 1; i >= 0; i--) {
                wrapped = {
                    [segments[i]]: {
                        directory: wrapped
                    }
                };
            }
            return wrapped;
        }

        async function init() {
            try {
                stepEl.textContent = 'Booting WebContainer...';
                const webcontainerInstance = await WebContainer.boot();

                await webcontainerInstance.mount({
                    '.output': {
                        directory: {
                            public: { directory: {} },
                            server: {
                                directory: {
                                    chunks: { directory: {} },
                                    node_modules: { directory: {} }
                                }
                            }
                        }
                    },
                    'demo-assets': { directory: {} }
                });

                stepEl.textContent = 'Fetching filesystem manifest...';
                const manifestResponse = await fetch('./${manifestFileName}');
                if (!manifestResponse.ok) throw new Error('Failed to fetch filesystem manifest: ' + manifestResponse.statusText);
                const manifest = await manifestResponse.json();
                if (
                    !manifest
                    || !Array.isArray(manifest.files)
                    || manifest.files.length === 0
                ) {
                    throw new Error('Filesystem manifest is invalid or empty.');
                }

                for (let i = 0; i < manifest.files.length; i++) {
                    const payload = manifest.files[i];
                    if (
                        !payload
                        || typeof payload.file !== 'string'
                        || !/^files\\.${hash}\\.\\d+\\.json$/.test(payload.file)
                    ) {
                        throw new Error('Unsafe filesystem payload filename: ' + String(payload?.file));
                    }
                    stepEl.textContent = 'Mounting virtual filesystem (' + (i + 1) + '/' + manifest.files.length + ')...';
                    const response = await fetch('./' + payload.file);
                    if (!response.ok) throw new Error('Failed to fetch ' + payload.file + ': ' + response.statusText);
                    const tree = await response.json();
                    decodeTree({ directory: tree });
                    await webcontainerInstance.mount(treeForMountPoint(payload.mountPoint, tree));
                }

                stepEl.textContent = 'Starting Nitro server...';
                const process = await webcontainerInstance.spawn('node', ['.output/server/index.mjs'], {
                    env: {
                        PGLITE_DATA_DIR: 'memory://gcs-ssc',
                        NITRO_PORT: '3000',
                        NITRO_HOST: '0.0.0.0',
                        BETTER_AUTH_SECRET: 'a_very_secret_string_for_demo_purposes',
                        GCS_RUNTIME_MIGRATION_MODE: 'webcontainer-demo',
                        GCS_DEMO_MIGRATION_SUFFIX: 'seed',
                        NODE_ENV: 'production',
                        // BETTER_AUTH_URL left unset to allow auto-detection from request origin
                    }
                });

                process.output.pipeTo(new WritableStream({
                    write(data) {
                        log(data);
                    }
                }));

                webcontainerInstance.on('server-ready', (port, url) => {
                    if (port === 3000) {
                        stepEl.textContent = 'Server ready!';
                        setTimeout(() => {
                            statusEl.style.display = 'none';
                            iframeEl.style.display = 'block';
                            iframeEl.src = url;
                            window.dispatchEvent(new CustomEvent('gcs-webcontainer-preview-ready', {
                                detail: {
                                    manifestFile: '${manifestFileName}',
                                    mountedPayloads: manifest.files.length,
                                    port
                                }
                            }));
                        }, 500);
                    }
                });

            } catch (err) {
                console.error(err);
                stepEl.textContent = 'Error: ' + err.message;
                log('FATAL ERROR: ' + err.stack);
            }
        }

        init();
    </script>
</body>
</html>
`

  await fs.writeFile(path.join(previewDirectory, 'index.html'), indexHtmlContent)

  const coiContent = `
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("fetch", (event) => {
        if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
            return;
        }

        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.status === 0) {
                        return response;
                    }

                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => console.error(e))
        );
    });
} else {
    navigator.serviceWorker.register(window.document.currentScript.src).then(registration => {
        if (registration) {
            registration.addEventListener("updatefound", () => {
                console.log("Reloading for COI update");
                window.location.reload();
            });

            if (registration.active && !navigator.serviceWorker.controller) {
                console.log("Reloading for COI activation");
                window.location.reload();
            }
        }
    }).catch(e => console.error("COI registration failed", e));
}
`
  await fs.writeFile(path.join(previewDirectory, 'coi-serviceworker.js'), coiContent)

  console.log(`✅ WebContainer preview generated in ${previewDirectory}/`)
  console.log(`\nTo run the preview:`)
  console.log(`npx serve ${previewDirectory}`)

  return {
    hash,
    manifestFileName,
    payloadCount: payloads.length
  }
}

/**
 * Main entry point for the webcontainer script.
 */
const main = async () => {
  const fromOutput = process.argv.includes('--from-output')
  const stageDemo = process.argv.includes('--stage-demo')
  const positionalArguments = process.argv.slice(2).filter(argument =>
    argument !== '--from-output' && argument !== '--stage-demo'
  )
  const outputDirectory = positionalArguments[0] ?? OUTPUT_DIR
  const previewDirectory = positionalArguments[1] ?? PREVIEW_DIR

  if (!fromOutput) {
    console.log('🚀 Building standalone Nuxt app...')
    if (!process.env.BETTER_AUTH_SECRET) {
      process.env.BETTER_AUTH_SECRET = 'a_very_secret_string_for_demo_purposes'
    }
    execSync('bun run build:demo', { stdio: 'inherit' })
  }

  let artifactDirectory = outputDirectory
  if (stageDemo) {
    artifactDirectory = STAGED_OUTPUT_DIR
    const resolvedOutputDirectory = path.resolve(outputDirectory)
    const resolvedArtifactDirectory = path.resolve(artifactDirectory)
    if (resolvedOutputDirectory === resolvedArtifactDirectory) {
      throw new Error('WebContainer staging source and destination must be different directories.')
    }
    await fs.rm(artifactDirectory, { force: true, recursive: true })
    await fs.mkdir(path.dirname(artifactDirectory), { recursive: true })
    await copyContainedArtifactTree(outputDirectory, artifactDirectory)
    await fs.mkdir(path.join(artifactDirectory, 'server', 'demo-migrations'), { recursive: true })
    execSync(
      `bun run scripts/build-demo-migration.ts ${path.join(artifactDirectory, 'server', 'demo-migrations', 'demo.mjs')}`,
      { stdio: 'inherit' }
    )
    await fs.mkdir(path.join(artifactDirectory, 'webcontainer', 'demo-assets'), { recursive: true })
    await fs.copyFile(
      'demo-assets/Contribution Agreement.docx',
      path.join(artifactDirectory, 'webcontainer', 'demo-assets', 'Contribution Agreement.docx')
    )
  }

  await generateWebContainerPreview(artifactDirectory, previewDirectory)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
