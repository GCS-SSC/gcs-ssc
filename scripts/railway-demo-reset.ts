/* eslint-disable jsdoc/require-jsdoc -- Standalone operational script; typed helpers and runbook describe its contract. */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'

export const TARGET = {
  project: '8705eadd-788e-4efb-b070-f03b6a1cdc3d',
  environment: 'demo',
  service: 'gcs-ssc',
  volume: 'gcs-ssc-volume',
  repository: 'https://github.com/GCS-SSC/gcs-ssc.git',
  health: 'https://gcs-ssc-demo.up.railway.app/api/health'
} as const

const deploymentsSchema = z.array(z.object({ id: z.string(), status: z.string() }))
const filesSchema = z.object({
  volume: z.object({ id: z.string(), name: z.literal(TARGET.volume), mountPath: z.literal('/app/.data') }),
  files: z.array(z.object({ name: z.string(), path: z.string(), type: z.string(), size: z.number().nullable() }))
})
const templatesSchema = z.array(z.object({ filename: z.string(), object: z.string(), size: z.number().positive() }))
type Deployment = z.infer<typeof deploymentsSchema>[number]
export type RunCommand = (command: string, args: string[], cwd: string) => Promise<string>

const execFileAsync = promisify(execFile)
export const sshFailureHint = (stderr: string): string => {
  if (stderr.includes('No SSH keys found')) return 'No local SSH key was found. Generate one with ssh-keygen -t ed25519, then register it with railway ssh keys add.'
  if (stderr.includes('Host key verification failed')) return 'SSH host verification failed. Connect interactively to inspect and verify the Railway host key before retrying.'
  if (stderr.includes('Permission denied')) return 'Railway SSH authentication was denied. Check the registered key and your project access.'
  if (stderr.includes('No target found')) return 'Railway SSH could not find a running target. Check whether Postgres is sleeping or unavailable.'
  return 'The Railway SSH/database check failed. Run the read-only SSH diagnostic below to see the underlying error.'
}

const runCommand: RunCommand = async (command, args, cwd) => {
  try {
    const result = await execFileAsync(command, args, { cwd, timeout: 1_800_000, maxBuffer: 16 * 1024 * 1024 })
    return result.stdout.trim()
  } catch (error) {
    // Variable responses and subprocess errors can contain credentials. Never echo them.
    const stderr = (error as { stderr?: string }).stderr ?? ''
    if (stderr.includes('agents cannot delete files')) {
      throw new Error('Railway refuses file deletion by AI agents. Run this command yourself in a terminal; do not bypass the restriction.')
    }
    if (command === 'railway' && args[0] === 'ssh') {
      throw new Error(`${sshFailureHint(stderr)}\nrailway ssh --project ${TARGET.project} --environment demo --service Postgres -- true`)
    }
    throw new Error(`${command} ${args[0] ?? ''} failed. Check authentication/CLI access and Railway deployment logs. Remote state may have changed.`)
  }
}

export const parseMode = (args: string[]): 'preview' | 'execute' => {
  if (args.length === 0 || (args.length === 1 && ['--preview', '--help'].includes(args[0]!))) return 'preview'
  if (args.length === 1 && args[0] === '--execute') return 'execute'
  throw new Error('Usage: bun run railway:demo:reset [--preview | --execute]')
}

export const assertHumanExecution = (env: NodeJS.ProcessEnv) => {
  // Fail before downtime for common harness markers; Railway remains the authority
  // and can also detect other agents. Do not remove markers to bypass its refusal.
  if (['CODEX_THREAD_ID', 'CODEX_SANDBOX', 'OPENAI_CODEX', 'CLAUDECODE', 'CLAUDE_CODE_SESSION_ID',
    'CURSOR_AGENT', 'CURSOR_TRACE_ID', 'COPILOT_AGENT_SESSION_ID', 'RAILWAY_AGENT_SESSION', 'AI_AGENT']
    .some(key => Boolean(env[key]))) {
    throw new Error('Railway file deletion requires a human terminal. Run --execute yourself outside the agent session.')
  }
}

export const validateVariables = (app: Record<string, string>, database: Record<string, string>) => {
  if (app.RAILWAY_PROJECT_ID !== TARGET.project || app.RAILWAY_ENVIRONMENT_NAME !== 'demo'
    || app.RAILWAY_SERVICE_NAME !== TARGET.service || app.ENVIRONMENT_TYPE !== 'demo') {
    throw new Error('Refusing to reset anything outside GCS Demo / demo / gcs-ssc in demo seed mode.')
  }
  if (app.GCS_LOCAL_FILE_STORAGE_DIR && app.GCS_LOCAL_FILE_STORAGE_DIR !== '/app/.data/files') {
    throw new Error('Unexpected attachment directory; expected /app/.data/files.')
  }
  let url: URL
  try {
    url = new URL(app.DATABASE_URL ?? '')
  } catch {
    throw new Error('Expected the demo PostgreSQL DATABASE_URL.')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== 'postgres.railway.internal'
    || url.pathname !== '/railway' || decodeURIComponent(url.username) !== 'postgres'
    || database.RAILWAY_PROJECT_ID !== TARGET.project || database.RAILWAY_ENVIRONMENT_NAME !== 'demo'
    || database.RAILWAY_SERVICE_NAME !== 'Postgres' || database.PGDATABASE !== 'railway'
    || database.PGUSER !== 'postgres' || !database.PGPASSWORD
    || decodeURIComponent(url.password) !== database.PGPASSWORD
    || (url.port || '5432') !== (database.PGPORT || '5432')) {
    throw new Error('Database configuration does not match the dedicated demo Postgres / railway database.')
  }
}

export const assertQuiescent = (deployments: Deployment[], activeId?: string) => {
  const inactive = new Set(['REMOVED', 'FAILED', 'CRASHED', 'SKIPPED'])
  const active = deployments.filter(deployment => !inactive.has(deployment.status))
  if (activeId) {
    if (deployments[0]?.id !== activeId || active.length !== 1 || active[0]?.id !== activeId || active[0]?.status !== 'SUCCESS') {
      throw new Error('Expected only our successful deployment; another deployment is running or teardown is incomplete.')
    }
  } else if (active.some(deployment => !['SUCCESS', 'SLEEPING'].includes(deployment.status)) || active.length > 1) {
    // A sleeping service is an existing release, not an in-flight deployment.
    // Keep it in the active set: it must still be removed before any deletion.
    const states = active.map(deployment => `${deployment.id}: ${deployment.status}`).join(', ')
    throw new Error(`Deployment state is not ready for reset (${states}). Wait for in-progress deployments to finish.`)
  }
}

export const maintenanceDockerfile = (runId: string): string => {
  const code = `const e=process.env;
if(e.RAILWAY_PROJECT_ID!==${JSON.stringify(TARGET.project)}||e.RAILWAY_ENVIRONMENT_NAME!=='demo'||e.RAILWAY_SERVICE_NAME!=='gcs-ssc'||e.ENVIRONMENT_TYPE!=='demo'||e.RAILWAY_VOLUME_NAME!=='gcs-ssc-volume'||e.RAILWAY_VOLUME_MOUNT_PATH!=='/app/.data')throw Error('Wrong maintenance target');
require('node:http').createServer((req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.statusCode=req.url==='/api/health'?200:503;res.end(JSON.stringify({maintenance:${JSON.stringify(runId)}}))}).listen(Number(e.PORT||3000),'0.0.0.0');`
  return `FROM node:24-bookworm-slim\nWORKDIR /app\nCMD ${JSON.stringify(['node', '-e', code])}\n`
}

const shellQuote = (value: string): string => `'${value.replaceAll('\'', '\'\\\'\'')}'`
export const postgresCommand = (sql: string, database: 'postgres' | 'railway' = 'postgres'): string[] => [
  'ssh', '--project', TARGET.project, '--environment', 'demo', '--service', 'Postgres', '--', 'sh', '-ceu',
  `test "$RAILWAY_PROJECT_ID" = ${shellQuote(TARGET.project)}; test "$RAILWAY_ENVIRONMENT_NAME" = demo; test "$RAILWAY_SERVICE_NAME" = Postgres; test "$PGDATABASE" = railway; test "$PGUSER" = postgres; export PGPASSWORD; psql -X -h 127.0.0.1 -U postgres -d ${database} -v ON_ERROR_STOP=1 -At -c ${shellQuote(sql)}`
]

export const TEMPLATE_SQL = `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
  SELECT a.egcs_cn_filename AS filename, a.egcs_cn_providerobjectid AS object, a.egcs_cn_filesize AS size
  FROM "Common_Attachment" a
  WHERE a.id IN (SELECT egcs_tp_templateattachment_en FROM "Transfer_Payment_Stream_Document_Template" WHERE egcs_tp_transferpaymentstream = 31 AND NOT _deleted
    UNION SELECT egcs_tp_templateattachment_fr FROM "Transfer_Payment_Stream_Document_Template" WHERE egcs_tp_transferpaymentstream = 31 AND NOT _deleted)
    AND NOT a._deleted AND a.egcs_cn_provider = 'gcs-storage-local'
) t`

export const validateTemplates = (value: unknown) => {
  const templates = templatesSchema.parse(value)
  const expected = ['contribution-agreement', 'schedule-1', 'schedule-2', 'schedule-3', 'schedule-4', 'agreement-closeout-report']
    .flatMap(slug => ['en', 'fr'].map(language => `${slug}-${language}.docx`)).sort()
  if (JSON.stringify(templates.map(template => template.filename).sort()) !== JSON.stringify(expected)) {
    throw new Error('The demo seed did not restore all twelve expected English/French template attachments.')
  }
  for (const template of templates) {
    if (!/^[a-zA-Z0-9._/-]+$/.test(template.object) || template.object.startsWith('/')
      || template.object.split('/').some(segment => ['.', '..', ''].includes(segment))) {
      throw new Error('Unsafe template object path.')
    }
  }
  return templates
}

export const resetDemo = async (options: {
  cwd: string
  run?: RunCommand
  sleep?: () => Promise<void>
  health?: () => Promise<unknown>
}) => {
  const run = options.run ?? runCommand
  const sleep = options.sleep ?? (() => new Promise(resolve => setTimeout(resolve, 5000)))
  const health = options.health ?? (async () => {
    const response = await fetch(TARGET.health, { signal: AbortSignal.timeout(10_000), cache: 'no-store' })
    if (!response.ok) throw new Error('Public healthcheck is not ready.')
    return response.json()
  })
  const waitForHealth = async (expected: Record<string, string>) => {
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        if (JSON.stringify(await health()) === JSON.stringify(expected)) return
      } catch {
        // Railway routing may lag deployment SUCCESS. Retry briefly without exposing response details.
      }
      await sleep()
    }
    throw new Error('Public healthcheck did not converge to the expected deployment.')
  }
  const cli = (args: string[]) => run('railway', args, options.cwd)
  const targetArgs = ['--project', TARGET.project, '--environment', 'demo', '--service', TARGET.service]
  const deployments = async () => deploymentsSchema.parse(JSON.parse(await cli(['deployment', 'list', ...targetArgs, '--limit', '100', '--json'])))
  const version = await cli(['--version'])
  const versionParts = /^railway (\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!versionParts || Number(versionParts[1]) !== 5 || Number(versionParts[2]) < 54
    || (Number(versionParts[2]) === 54 && Number(versionParts[3]) < 1)) {
    throw new Error('Install Railway CLI 5.54.1 or newer (major 5).')
  }
  await cli(['link', ...targetArgs])
  const app = z.record(z.string(), z.string()).parse(JSON.parse(await cli(['variable', 'list', '--service', TARGET.service, '--environment', 'demo', '--json'])))
  const database = z.record(z.string(), z.string()).parse(JSON.parse(await cli(['variable', 'list', '--service', 'Postgres', '--environment', 'demo', '--json'])))
  validateVariables(app, database)
  const initialDeployments = await deployments()
  assertQuiescent(initialDeployments)
  if (initialDeployments.some(deployment => deployment.status === 'SLEEPING')) {
    console.info('Sending a health request to wake the sleeping demo before checking database SSH access.')
    try {
      await health()
    } catch {
      // A cold start or broken migrations may return 502/503. The reset must not
      // require application readiness; the request only wakes the existing service.
    }
  }
  if (await cli(postgresCommand('SELECT rolsuper FROM pg_roles WHERE rolname = current_user')) !== 't') {
    throw new Error('The demo database reset requires the dedicated Postgres superuser.')
  }
  const files = async (path: string) => filesSchema.parse(JSON.parse(await cli([
    'volume', ...targetArgs, 'files', '--volume', TARGET.volume, 'list', path, '--json'
  ])))
  // Volume file access requires a running container, so validate it in maintenance
  // before deleting anything. This also supports resetting a crashed application.
  const originalDockerfile = await readFile(join(options.cwd, 'Dockerfile'), 'utf8')
  await readFile(join(options.cwd, 'demo-assets', 'Contribution Agreement.docx'))
  const runId = randomUUID()
  let maintenanceId: string | undefined
  const deploy = async (message: string) => {
    const previousIds = new Set((await deployments()).map(deployment => deployment.id))
    const result = JSON.parse(await cli(['up', options.cwd, '--path-as-root', ...targetArgs, '--detach', '--json', '--message', message]))
    const id = z.object({ deploymentId: z.string().min(1) }).parse(result).deploymentId
    console.info(`Waiting for Railway deployment ${id}.`)
    for (let attempt = 0; attempt < 240; attempt++) {
      const current = await deployments()
      if (!current.some(deployment => deployment.id === id) && current.every(deployment => previousIds.has(deployment.id))) {
        await sleep()
        continue
      }
      if (current[0]?.id !== id) throw new Error('Another deployment superseded this reset. Stop and inspect Railway.')
      const state = current[0].status
      if (['FAILED', 'CRASHED', 'REMOVED', 'SKIPPED'].includes(state)) throw new Error(`Deployment ${id} ended with ${state}.`)
      if (state === 'SUCCESS') {
        const others = current.slice(1).filter(item => !['REMOVED', 'FAILED', 'CRASHED', 'SKIPPED'].includes(item.status))
        if (others.length === 0) return id
      }
      await sleep()
    }
    throw new Error(`Timed out waiting for deployment ${id} and prior deployment teardown.`)
  }
  try {
    console.info('Deploying maintenance mode. The demo will be unavailable until the final deployment succeeds.')
    await writeFile(join(options.cwd, 'Dockerfile'), maintenanceDockerfile(runId))
    maintenanceId = await deploy(`Demo reset maintenance ${runId}`)
    await waitForHealth({ maintenance: runId })
    assertQuiescent(await deployments(), maintenanceId)
    const root = await files('/')
    const attachments = root.files.find(file => file.name === 'files')
    if (attachments) {
      if (attachments.type !== 'directory') throw new Error('The volume files entry is not a directory.')
      console.info('Deleting uploaded attachments from gcs-ssc-volume:/files.')
      await cli(['volume', ...targetArgs, 'files', '--volume', root.volume.id, 'delete', '/files', '--yes', '--json'])
    }
    if ((await files('/')).files.some(file => file.name === 'files')) throw new Error('Attachment directory was not removed.')
    assertQuiescent(await deployments(), maintenanceId)
    console.info('Recreating the demo database and migration history.')
    // Separate commands: CREATE/DROP DATABASE cannot run inside an implicit multi-statement transaction.
    await cli(postgresCommand('DROP DATABASE IF EXISTS railway WITH (FORCE)'))
    await cli(postgresCommand('CREATE DATABASE railway OWNER postgres'))
    assertQuiescent(await deployments(), maintenanceId)
    await writeFile(join(options.cwd, 'Dockerfile'), originalDockerfile)
    console.info('Deploying the captured main commit; startup will run demo migrations and restore templates.')
    const appId = await deploy(`Demo reset complete ${runId}`)
    await waitForHealth({ status: 'ok' })
    const templates = validateTemplates(JSON.parse(await cli(postgresCommand(TEMPLATE_SQL, 'railway'))))
    const directories = new Map<string, Awaited<ReturnType<typeof files>>>()
    for (const template of templates) {
      const path = `/files/gcs-storage-local/${template.object}`
      const directory = path.slice(0, path.lastIndexOf('/'))
      if (!directories.has(directory)) directories.set(directory, await files(directory))
      const file = directories.get(directory)!.files.find(entry => entry.name === path.slice(path.lastIndexOf('/') + 1))
      if (!file || file.type !== 'file' || file.size !== template.size) throw new Error(`Seeded template file missing or size mismatch: ${template.filename}`)
    }
    assertQuiescent(await deployments(), appId)
    console.info('Reset complete: application healthy; all twelve demo template files restored and size-checked.')
  } finally {
    // Restore the local deployment source even on failure. Never auto-deploy over a partial reset.
    await writeFile(join(options.cwd, 'Dockerfile'), originalDockerfile)
  }
}

const main = async () => {
  const mode = parseMode(process.argv.slice(2))
  console.info(`GCS Demo / demo / gcs-ssc (${TARGET.project})\nReset: Postgres database railway + gcs-ssc-volume:/files\nRestore: latest main at start of run + all twelve seeded demo templates\nExternal object storage and the old PGlite directory are outside this reset.\nKeep GitHub pushes and other deployments paused for the duration.`)
  if (mode === 'preview') {
    console.info('Preview only. Run bun run railway:demo:reset --execute yourself to perform this destructive reset.')
    return
  }
  assertHumanExecution(process.env)
  const directory = await mkdtemp(join(tmpdir(), 'gcs-demo-reset-'))
  console.info(`Deployment checkout: ${directory} (retained for recovery).`)
  await runCommand('git', ['clone', '--depth', '1', '--branch', 'main', '--single-branch', TARGET.repository, directory], process.cwd())
  const commit = await runCommand('git', ['rev-parse', 'HEAD'], directory)
  console.info(`Deploying main commit ${commit}.`)
  try {
    await resetDemo({ cwd: directory })
  } catch (error) {
    console.error(`Reset stopped. Inspect Railway before continuing. Clean main checkout retained at ${directory}.`)
    throw error
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Railway demo reset failed.')
    process.exitCode = 1
  })
}
