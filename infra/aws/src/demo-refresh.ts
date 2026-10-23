import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const execute = promisify(execFile)
const manifestPath = new URL('../../../deployment/demo-image.json', import.meta.url)
const repository = 'gcs-ssc/gcs-ssc-demo'
type Container = { name: string; image: string; environment?: Array<{ name: string; value: string }>; secrets?: Array<{ name: string; valueFrom: string }>; command?: string[] }
export type TaskDefinition = Record<string, unknown> & { containerDefinitions: Container[] }
type Service = {
  status: string; desiredCount: number; runningCount: number; pendingCount: number; taskDefinition: string
  networkConfiguration: unknown; platformVersion: string
  deploymentConfiguration: { deploymentCircuitBreaker?: { enable: boolean; rollback: boolean } }
  deployments: Array<{ taskDefinition: string; rolloutState?: string }>
}
type Task = { taskArn: string; lastStatus: string; taskDefinitionArn: string; stoppedReason?: string; containers: Array<{ name: string; exitCode?: number; imageDigest?: string }> }
type Aws = <T>(args: string[]) => Promise<T>
/** Run an AWS CLI request using the operator profile.
 * @param args - AWS CLI arguments without shell interpolation.
 * @returns Parsed AWS response.
 */
export const aws: Aws = async <T>(args: string[]): Promise<T> => {
  const request = () => execute('aws', [...args, '--region', 'ca-central-1', '--output', 'json', '--no-cli-pager'], {
    timeout: 60000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, AWS_PAGER: '', AWS_CLI_AUTO_PROMPT: 'off' }
  })
  let result
  try {
    result = await request()
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : ''
    if (args[0] !== 'sts' || args[1] !== 'get-caller-identity'
      || !/Error when retrieving token from sso|SSO session.*expired|Token has expired and refresh failed/i.test(stderr)) throw error
    console.log('AWS SSO session expired. Signing in; complete the browser or device-code prompt to continue.')
    await new Promise<void>((resolve, reject) => {
      const child = spawn('aws', ['sso', 'login', ...(process.env.AWS_PROFILE ? ['--profile', process.env.AWS_PROFILE] : [])], {
        stdio: 'inherit', env: process.env
      })
      child.once('error', reject)
      child.once('exit', code => code === 0 ? resolve() : reject(new Error('AWS SSO sign-in did not complete; no deployment changes made.')))
    })
    result = await request()
  }
  return JSON.parse(result.stdout) as T
}

/** Resolve the public latest image and verify its registry digest.
 * @returns Immutable GCS demo image reference.
 */
export const resolveLatestImage = async (): Promise<string> => {
  const tokenResponse = await fetch(`https://ghcr.io/token?service=ghcr.io&scope=repository:${repository}:pull`, { signal: AbortSignal.timeout(30000) })
  if (!tokenResponse.ok) throw new Error(`GHCR token request failed (${tokenResponse.status})`)
  const { token } = await tokenResponse.json() as { token: string }
  const response = await fetch(`https://ghcr.io/v2/${repository}/manifests/latest`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' },
    signal: AbortSignal.timeout(30000)
  })
  if (!response.ok) throw new Error(`GHCR latest lookup failed (${response.status}). Run the image workflow on main first.`)
  const body = await response.text()
  const digest = `sha256:${createHash('sha256').update(body).digest('hex')}`
  if (response.headers.get('docker-content-digest') !== digest) throw new Error('GHCR manifest digest mismatch')
  const manifest = JSON.parse(body) as { mediaType: string }
  if (!['application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json'].includes(manifest.mediaType)) throw new Error('Expected the workflow’s single-platform image manifest')
  return `ghcr.io/${repository}@${digest}`
}

/** Preserve the validated demo task contract in a registrable revision.
 * @param definition - Current ECS task definition.
 * @param image - Selected immutable image.
 * @returns New task registration input.
 */
export const cloneTaskDefinition = (definition: TaskDefinition, image: string): TaskDefinition => {
  const fields = ['family', 'taskRoleArn', 'executionRoleArn', 'networkMode', 'containerDefinitions', 'volumes', 'placementConstraints',
    'requiresCompatibilities', 'cpu', 'memory', 'pidMode', 'ipcMode', 'proxyConfiguration', 'inferenceAccelerators', 'ephemeralStorage', 'runtimePlatform', 'enableFaultInjection']
  const input = Object.fromEntries(fields.filter(key => definition[key] !== undefined).map(key => [key, structuredClone(definition[key])])) as TaskDefinition
  const [container] = input.containerDefinitions
  const env = Object.fromEntries((container?.environment ?? []).map(item => [item.name, item.value]))
  if (input.containerDefinitions.length !== 1 || container?.name !== 'Application' || env.ENVIRONMENT_TYPE !== 'demo'
    || env.AWS_DB_USER !== 'gcs_ssc' || !env.AWS_DB_HOST?.endsWith('.ca-central-1.rds.amazonaws.com')
    || env.AWS_ACCESS_DB_USER !== 'gcs_access' || !env.AWS_ACCESS_DB_HOST?.endsWith('.ca-central-1.rds.amazonaws.com')
    || env.AWS_ACCESS_DB_HOST === env.AWS_DB_HOST
    || container.command?.join(' ') !== 'node .output/server/aws-start.mjs'
    || !container.secrets?.some(secret => secret.name === 'AWS_DB_PASSWORD')
    || !container.secrets.some(secret => secret.name === 'AWS_ACCESS_DB_PASSWORD')) throw new Error('Refusing a task outside the AWS GCS demo runtime contract')
  container.image = image
  return input
}

// Command override only: database credentials remain ECS-injected secrets.
export const databaseTaskScript = `
import pg from 'pg';
import { readFileSync } from 'node:fs';
if (process.env.ENVIRONMENT_TYPE !== 'demo' || process.env.AWS_DB_USER !== 'gcs_ssc') throw new Error('Not the GCS demo database');
for (const target of [{prefix:'AWS_DB',database:'gcs_ssc',role:'gcs_ssc'}, {prefix:'AWS_ACCESS_DB',database:'gcs_access',role:'gcs_access'}]) {
  const client = new pg.Client({host:process.env[target.prefix+'_HOST'],user:target.role,password:process.env[target.prefix+'_PASSWORD'],database:target.database,connectionTimeoutMillis:10000,statement_timeout:60000,ssl:{ca:readFileSync('/app/.output/rds-ca.pem','utf8'),rejectUnauthorized:true}});
  try {
    await client.connect();
    const {rows:[row]} = await client.query('SELECT current_database() AS db, current_user AS role');
    if (row.db !== target.database || row.role !== target.role) throw new Error('Unexpected database identity');
    if (process.argv.includes('--reset-db') && target.database === 'gcs_ssc') {
      await client.query('BEGIN');
      await client.query('DROP SCHEMA IF EXISTS audit CASCADE; DROP SCHEMA IF EXISTS extensions CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION gcs_ssc; GRANT USAGE ON SCHEMA public TO PUBLIC;');
      await client.query('COMMIT');
      console.log('GCS demo schemas reset; access history and attachment files preserved');
    } else console.log('GCS database connectivity and TLS verified');
  } catch {
    console.error('GCS database task failed; inspect its CloudWatch logs.');
    process.exitCode = 1;
  } finally { await client.end(); }
}
`

type Dependencies = {
  aws: Aws; resolveImage: () => Promise<string>; wait: () => Promise<void>; health: (url: string) => Promise<boolean>
  savePin: (image: string) => void; log: (message: string) => void
}
const defaults: Dependencies = {
  aws, resolveImage: resolveLatestImage, wait: () => new Promise(resolve => setTimeout(resolve, 10000)),
  /** Probe public readiness without following redirects.
   * @param url - Stack-owned health URL.
   * @returns Whether the application is ready.
   */
  health: async url => {
    try {
      return (await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' })).ok
    } catch {
      return false
    }
  },
  savePin: image => writeFileSync(manifestPath, `${JSON.stringify({ image }, null, 2)}\n`), log: console.log
}

/** Deploy the latest GCS demo release with an optional explicit schema reset.
 * @param options - Reset and preview selection.
 * @param options.resetDb - Explicitly wipe the GCS demo schemas.
 * @param options.preview - Inspect without external mutations.
 * @param dependencies - AWS and verification operations.
 * @returns Completion after verified public readiness.
 */
export const refreshDemo = async (options: { resetDb: boolean; preview: boolean }, dependencies: Dependencies = defaults): Promise<void> => {
  const { aws, wait, log } = dependencies
  const image = await dependencies.resolveImage()
  if (!/^ghcr\.io\/gcs-ssc\/gcs-ssc-demo@sha256:[a-f0-9]{64}$/.test(image)) throw new Error('Invalid resolved GCS demo image')
  const identity = await aws<{ Account: string }>(['sts', 'get-caller-identity'])
  const { Stacks: [stack] } = await aws<{ Stacks: Array<{ StackStatus: string; Outputs: Array<{ OutputKey: string; OutputValue: string }> }> }>(['cloudformation', 'describe-stacks', '--stack-name', 'GcsSscDemo'])
  if (!['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'].includes(stack.StackStatus)) throw new Error('Stack is not ready for refresh')
  const outputs = Object.fromEntries(stack.Outputs.map(item => [item.OutputKey, item.OutputValue]))
  const { ClusterName: cluster, ServiceName: serviceName, HealthUrl: healthUrl } = outputs
  if (!cluster || !serviceName || !/^https:\/\/[a-z0-9]+\.cloudfront\.net\/api\/health$/.test(healthUrl ?? '')) throw new Error('Missing GCS demo stack outputs')
  const serviceArgs = ['--cluster', cluster, '--service', serviceName]
  /** Read the single stack-owned GCS service.
   * @returns Current service deployment state.
   */
  const describeService = async (): Promise<Service> => {
    const result = await aws<{ services: Service[]; failures: unknown[] }>(['ecs', 'describe-services', '--cluster', cluster, '--services', serviceName])
    if (result.failures.length || result.services.length !== 1) throw new Error('Cannot resolve GCS service')
    return result.services[0]!
  }
  const service = await describeService()
  if (service.status !== 'ACTIVE' || service.desiredCount !== 1 || service.pendingCount !== 0
    || service.deployments.length !== 1 || service.deployments[0]?.rolloutState !== 'COMPLETED') throw new Error('GCS must have one completed deployment and desired count 1')
  const { taskDefinition } = await aws<{ taskDefinition: TaskDefinition }>(['ecs', 'describe-task-definition', '--task-definition', service.taskDefinition])
  const registration = cloneTaskDefinition(taskDefinition, image)
  log(`AWS account ${identity.Account}, GcsSscDemo, ca-central-1, service ${serviceName}\nImage: ${image}\nReset database: ${options.resetDb}; attachment files preserved.`)
  if (options.preview) {
    log('Preview only; no changes made.')
    return
  }
  const registered = await aws<{ taskDefinition: { taskDefinitionArn: string } }>(['ecs', 'register-task-definition', '--cli-input-json', JSON.stringify(registration)])
  const newDefinition = registered.taskDefinition.taskDefinitionArn
  log(`Registered ${newDefinition}`)
  const listTasks = async (): Promise<string[]> => (await aws<{ taskArns: string[] }>(['ecs', 'list-tasks', '--cluster', cluster, '--service-name', serviceName, '--desired-status', 'RUNNING'])).taskArns
  /** Verify all requested task records are returned.
   * @param arns - ECS task identifiers.
   * @returns Task statuses and container results.
   */
  const describeTasks = async (arns: string[]): Promise<Task[]> => {
    const result = await aws<{ tasks: Task[]; failures: unknown[] }>(['ecs', 'describe-tasks', '--cluster', cluster, '--tasks', ...arns])
    if (result.failures.length || result.tasks.length !== arns.length) throw new Error('Cannot verify ECS tasks')
    return result.tasks
  }
  /** Run and await a bounded one-off database operation.
   * @param reset - Whether to reset after verifying database identity.
   * @returns Completion only after exit code zero.
   */
  const runDatabaseTask = async (reset: boolean): Promise<void> => {
    const result = await aws<{ tasks: Task[]; failures: unknown[] }>(['ecs', 'run-task', '--cluster', cluster, '--task-definition', newDefinition,
      '--launch-type', 'FARGATE', '--platform-version', service.platformVersion, '--network-configuration', JSON.stringify(service.networkConfiguration),
      '--overrides', JSON.stringify({ containerOverrides: [{ name: 'Application', command: ['node', '--input-type=module', '-e', databaseTaskScript, '--', ...(reset ? ['--reset-db'] : [])] }] })])
    if (result.failures.length || result.tasks.length !== 1) throw new Error('Could not launch database task')
    const arn = result.tasks[0]!.taskArn
    log(`${reset ? 'Reset' : 'Preflight'} task: ${arn}`)
    for (let attempt = 0; attempt < 60; attempt++) {
      const [task] = await describeTasks([arn])
      if (task!.lastStatus === 'STOPPED') {
        if (task!.containers.find(container => container.name === 'Application')?.exitCode !== 0) throw new Error(`Database task failed: ${task!.stoppedReason ?? arn}`)
        return
      }
      await wait()
    }
    await aws(['ecs', 'stop-task', '--cluster', cluster, '--task', arn, '--reason', 'Demo refresh timed out'])
    throw new Error('Database task timed out; inspect logs before recovery')
  }
  await runDatabaseTask(false)
  if ((await describeService()).taskDefinition !== service.taskDefinition) throw new Error('Another deployment changed the service during preflight')
  let stopped = false
  try {
    if (options.resetDb) {
      const oldTasks = await listTasks()
      await aws(['ecs', 'update-service', ...serviceArgs, '--desired-count', '0'])
      stopped = true
      let empty = false
      for (let attempt = 0; attempt < 60; attempt++) {
        const current = await describeService()
        if (current.desiredCount !== 0 || current.taskDefinition !== service.taskDefinition) throw new Error('Another operator changed the stopped service')
        const oldTasksStopped = oldTasks.length === 0 || (await describeTasks(oldTasks)).every(task => task.lastStatus === 'STOPPED')
        if (oldTasksStopped && (await listTasks()).length === 0 && current.runningCount === 0 && current.pendingCount === 0) {
          empty = true
          break
        }
        await wait()
      }
      if (!empty) throw new Error('GCS tasks did not stop; database was not reset')
      log('GCS stopped; resetting demo schemas.')
      await runDatabaseTask(true)
    }
    await aws(['ecs', 'update-service', ...serviceArgs, '--task-definition', newDefinition, '--desired-count', '1', '--force-new-deployment',
      ...(options.resetDb ? ['--deployment-configuration', JSON.stringify({ deploymentCircuitBreaker: { enable: true, rollback: false } })] : [])])
    for (let attempt = 0; attempt < 120; attempt++) {
      const current = await describeService()
      if (current.taskDefinition !== newDefinition) throw new Error('Deployment rolled back or was replaced by another operator')
      if (current.deployments.some(deployment => deployment.rolloutState === 'FAILED')) throw new Error('ECS deployment failed')
      if (current.deployments.length === 1 && current.deployments[0]?.rolloutState === 'COMPLETED' && current.runningCount === 1 && current.pendingCount === 0) {
        const arns = await listTasks()
        if (arns.length !== 1) throw new Error('Expected exactly one running GCS task')
        const [task] = await describeTasks(arns)
        if (task!.taskDefinitionArn !== newDefinition || task!.lastStatus !== 'RUNNING'
          || task!.containers.find(container => container.name === 'Application')?.imageDigest !== image.split('@')[1]) throw new Error('Running image does not match the selected release')
        if (await dependencies.health(healthUrl)) {
          if (options.resetDb && service.deploymentConfiguration.deploymentCircuitBreaker) await aws(['ecs', 'update-service', ...serviceArgs, '--deployment-configuration', JSON.stringify({ deploymentCircuitBreaker: service.deploymentConfiguration.deploymentCircuitBreaker })])
          dependencies.savePin(image)
          log(`GCS demo ready: ${healthUrl}\nSaved deployment/demo-image.json for future CDK deployments.`)
          return
        }
      }
      if (attempt % 6 === 0) log('Waiting for ECS deployment and public readiness…')
      await wait()
    }
    throw new Error('Timed out waiting for GCS readiness')
  } catch (error) {
    if (stopped) log(`Refresh failed after stopping GCS. No old revision will be restarted automatically. Inspect CloudWatch logs; recover with task definition ${newDefinition}.`)
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  if (args.some(arg => !['--reset-db', '--preview'].includes(arg))) throw new Error('Usage: bun run aws:demo:refresh [--reset-db] [--preview]')
  try {
    await refreshDemo({ resetDb: args.includes('--reset-db'), preview: args.includes('--preview') })
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'AWS demo refresh failed')
    process.exitCode = 1
  }
}
