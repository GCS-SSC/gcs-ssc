/* eslint-disable jsdoc/require-jsdoc */
import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_LIBREOFFICE_CONVERSION_TIMEOUT_MS = 30_000
export interface LibreOfficeConversionOptions {
  sofficeBinaryPaths?: string[]
  temporaryDirectory?: string
  timeoutMs?: number
}

export const resolveSofficeBinaryPaths = (): string[] => process.env.LIBREOFFICE_SOFFICE_PATH
  ? [process.env.LIBREOFFICE_SOFFICE_PATH]
  : [join(process.cwd(), 'scripts', 'soffice-flatpak')]

const stopGroup = (pid: number): void => {
  try {
    process.kill(-pid, 'SIGKILL')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error
  }
}

const awaitGroupTermination = async (groupId: number): Promise<void> => {
  if (process.platform !== 'linux') return
  const deadline = Date.now() + 2_000
  while (true) {
    let active = false
    for (const name of await readdir('/proc')) {
      if (!/^\d+$/.test(name)) continue
      const stat = await readFile(`/proc/${name}/stat`, 'utf8').catch(() => '')
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      if (fields[2] === String(groupId) && fields[0] !== 'Z' && fields[0] !== 'X') active = true
    }
    if (!active) return
    if (Date.now() >= deadline) throw new Error('LibreOffice conversion process group did not terminate')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

export const convertLibreOfficeDocument = async (bytes: Buffer, options: LibreOfficeConversionOptions = {}): Promise<Buffer> => {
  if (process.platform === 'win32') throw new Error('LibreOffice conversion requires Linux/WSL or a POSIX process group')
  let executable: string | undefined
  for (const candidate of options.sofficeBinaryPaths ?? resolveSofficeBinaryPaths()) {
    try {
      await access(candidate, constants.X_OK)
      executable = candidate
      break
    } catch { /* Try the next explicitly configured executable. */ }
  }
  if (!executable) throw new Error('Could not find soffice binary')
  const root = await mkdtemp(join(options.temporaryDirectory ?? tmpdir(), 'libreofficeConvert_'))
  let conversionError: unknown
  let convertedPdf: Buffer | undefined
  try {
    const input = join(root, 'source.docx')
    await writeFile(input, bytes)
    const timeoutMs = options.timeoutMs !== undefined && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_LIBREOFFICE_CONVERSION_TIMEOUT_MS
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, [
        `-env:UserInstallation=${pathToFileURL(join(root, 'profile')).href}`,
        '--headless', '--convert-to', 'pdf', '--outdir', root, input
      ], { detached: true, stdio: 'ignore' })
      let failure: unknown
      const timer = setTimeout(() => {
        failure = Object.assign(new Error(`LibreOffice conversion timed out after ${String(timeoutMs)} ms`), { killed: true })
        try {
          if (child.pid !== undefined) stopGroup(child.pid)
        } catch (error) {
          failure = error
          child.kill('SIGKILL')
        }
      }, timeoutMs)
      child.on('error', error => {
        failure = error
      })
      child.once('close', (code, signal) => {
        clearTimeout(timer)
        void (async () => {
          // A launcher can exit before its converter; the entire group belongs to this render.
          if (child.pid !== undefined) {
            stopGroup(child.pid)
            await awaitGroupTermination(child.pid)
          }
          if (failure) reject(failure)
          else if (code !== 0) reject(new Error(`LibreOffice conversion failed (${String(code ?? signal)})`))
          else resolve()
        })().catch(reject)
      })
    })
    convertedPdf = await readFile(join(root, 'source.pdf'))
  } catch (error) {
    conversionError = error
  }
  try {
    await rm(root, { recursive: true, force: true })
  } catch (error) {
    if (conversionError === undefined) conversionError = error
    else {
      console.error('Failed to clean up temporary LibreOffice conversion files.', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
  if (conversionError !== undefined) throw conversionError
  if (!convertedPdf) throw new Error('LibreOffice conversion returned no document bytes')
  return convertedPdf
}
