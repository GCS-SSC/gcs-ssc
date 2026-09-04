#!/usr/bin/env bun
/* eslint-disable jsdoc/require-jsdoc */
import { createWriteStream } from 'node:fs'
import { access, chmod, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const toolsRoot = join(repoRoot, '.tools', 'docgen')
const downloadRoot = join(toolsRoot, 'downloads')
const libreOfficeRoot = join(toolsRoot, 'libreoffice')
const puppeteerCacheRoot = join(toolsRoot, 'puppeteer')
const envFilePath = process.env.DOCGEN_ENV_FILE
  ? resolve(repoRoot, process.env.DOCGEN_ENV_FILE)
  : join(repoRoot, '.env')

const libreOfficeVersion = process.env.LIBREOFFICE_VERSION
  ? process.env.LIBREOFFICE_VERSION
  : '26.2.3'
const libreOfficeArchiveName = process.env.LIBREOFFICE_ARCHIVE_NAME
  ? process.env.LIBREOFFICE_ARCHIVE_NAME
  : `LibreOffice_${libreOfficeVersion}_Linux_x86-64_deb.tar.gz`
const libreOfficeDownloadUrl = process.env.LIBREOFFICE_DOWNLOAD_URL
  ? process.env.LIBREOFFICE_DOWNLOAD_URL
  : `https://download.documentfoundation.org/libreoffice/stable/${libreOfficeVersion}/deb/x86_64/${libreOfficeArchiveName}`
const puppeteerBrowser = process.env.PUPPETEER_BROWSER
  ? process.env.PUPPETEER_BROWSER
  : 'chrome'

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const run = async (
  command: string[],
  options: { cwd?: string, env?: Record<string, string> } = {}
): Promise<void> => {
  const env = options.env ? { ...process.env, ...options.env } : process.env
  const proc = Bun.spawn(command, {
    cwd: options.cwd,
    env,
    stderr: 'inherit',
    stdout: 'inherit'
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`${command.join(' ')} exited with code ${exitCode}`)
  }
}

const download = async (url: string, destination: string): Promise<void> => {
  if (await pathExists(destination)) {
    console.log(`Using existing ${destination}`)
    return
  }

  await mkdir(dirname(destination), { recursive: true })
  console.log(`Downloading ${url}`)
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with ${response.status} ${response.statusText}: ${url}`)
  }

  const tmpDestination = `${destination}.${process.pid}.tmp`
  const stream = Readable.fromWeb(response.body)
  try {
    await pipeline(stream, createWriteStream(tmpDestination))
    await rename(tmpDestination, destination)
  } catch (error: unknown) {
    await rm(tmpDestination, { force: true })
    throw error
  }
}

const findFirst = async (
  root: string,
  predicate: (path: string) => boolean
): Promise<string | null> => {
  const entries = await readdir(root)
  for (const entry of entries) {
    const path = join(root, entry)
    const details = await stat(path)
    if (details.isDirectory()) {
      const nested = await findFirst(path, predicate)
      if (nested) {
        return nested
      }
      continue
    }

    if (predicate(path)) {
      return path
    }
  }

  return null
}

export const findDebsDirectory = async (root: string): Promise<string> => {
  let matched: string | null = null
  const entries = await readdir(root)
  for (const entry of entries) {
    const path = join(root, entry)
    const details = await stat(path)
    if (details.isDirectory() && entry === 'DEBS') {
      return path
    }

    if (details.isDirectory()) {
      try {
        matched = await findDebsDirectory(path)
      } catch {
        matched = null
      }

      if (matched) {
        return matched
      }
    }
  }

  throw new Error(`Could not find a DEBS directory in ${root}`)
}

const installLibreOffice = async (): Promise<string> => {
  const archivePath = join(downloadRoot, libreOfficeArchiveName)
  const extractRoot = join(downloadRoot, `libreoffice-${libreOfficeVersion}`)

  await download(libreOfficeDownloadUrl, archivePath)
  await rm(extractRoot, { force: true, recursive: true })
  await rm(libreOfficeRoot, { force: true, recursive: true })
  await mkdir(extractRoot, { recursive: true })
  await mkdir(libreOfficeRoot, { recursive: true })

  console.log('Extracting LibreOffice archive')
  await run(['tar', '-xzf', archivePath, '-C', extractRoot])

  const debsDirectory = await findDebsDirectory(extractRoot)
  const debs = (await readdir(debsDirectory))
    .filter(file => file.endsWith('.deb'))
    .sort()

  if (debs.length === 0) {
    throw new Error(`No .deb packages found in ${debsDirectory}`)
  }

  console.log(`Extracting ${debs.length} LibreOffice packages`)
  for (const [index, deb] of debs.entries()) {
    const debPath = join(debsDirectory, deb)
    const debExtractRoot = join(downloadRoot, 'deb-extract', String(index))
    await rm(debExtractRoot, { force: true, recursive: true })
    await mkdir(debExtractRoot, { recursive: true })
    await run(['ar', 'x', debPath], { cwd: debExtractRoot })

    const dataArchive = await findFirst(debExtractRoot, path => /\/data\.tar\.(gz|xz|zst)$/.test(path))
    if (!dataArchive) {
      throw new Error(`Could not find data.tar.* in ${debPath}`)
    }

    await run(['tar', '-xf', dataArchive, '-C', libreOfficeRoot])
  }

  const sofficePath = await findFirst(libreOfficeRoot, path => path.endsWith('/program/soffice'))
  if (!sofficePath) {
    throw new Error(`Could not find program/soffice under ${libreOfficeRoot}`)
  }

  await chmod(sofficePath, 0o755)
  return sofficePath
}

const installPuppeteerBrowser = async (): Promise<void> => {
  await mkdir(puppeteerCacheRoot, { recursive: true })
  console.log(`Installing Puppeteer browser: ${puppeteerBrowser}`)
  await run(
    ['bun', 'x', 'puppeteer', 'browsers', 'install', puppeteerBrowser],
    { cwd: repoRoot, env: { PUPPETEER_CACHE_DIR: puppeteerCacheRoot } }
  )
}

const upsertEnvValue = (content: string, key: string, value: string): string => {
  const line = `${key}=${value}`
  const lines = content.split('\n')
  const index = lines.findIndex(existingLine => existingLine.startsWith(`${key}=`))

  if (index >= 0) {
    lines[index] = line
    return lines.join('\n')
  }

  const normalized = content.endsWith('\n') || content.length === 0 ? content : `${content}\n`
  return `${normalized}${line}\n`
}

const writeEnvFile = async (sofficePath: string): Promise<void> => {
  const currentContent = await pathExists(envFilePath)
    ? await readFile(envFilePath, 'utf-8')
    : ''
  const withLibreOffice = upsertEnvValue(currentContent, 'LIBREOFFICE_SOFFICE_PATH', sofficePath)
  const withPuppeteer = upsertEnvValue(withLibreOffice, 'PUPPETEER_CACHE_DIR', puppeteerCacheRoot)

  await mkdir(dirname(envFilePath), { recursive: true })
  await Bun.write(envFilePath, withPuppeteer)
}

const main = async (): Promise<void> => {
  if (process.platform !== 'linux') {
    throw new Error('This installer is intended for Linux and WSL.')
  }

  const sofficePath = await installLibreOffice()
  await installPuppeteerBrowser()
  await writeEnvFile(sofficePath)

  console.log('')
  console.log('Document generation tools are ready.')
  console.log(`LibreOffice soffice: ${sofficePath}`)
  console.log(`Puppeteer cache: ${puppeteerCacheRoot}`)
  console.log(`Nuxt env file: ${envFilePath}`)
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
