import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

/**
 * Prepare the existing application contract from ECS-injected secret values.
 * @param {NodeJS.ProcessEnv} environment - Container environment.
 * @returns {void}
 */
export const prepareAwsEnvironment = (environment) => {
  for (const name of ['AWS_DB_HOST', 'AWS_DB_USER', 'AWS_DB_PASSWORD', 'AWS_ACCESS_DB_HOST', 'AWS_ACCESS_DB_USER', 'AWS_ACCESS_DB_PASSWORD', 'AWS_EXTENSION_SECRET_SEED']) {
    if (!environment[name]) throw new Error(`Missing required AWS runtime input: ${name}`)
  }
  for (const [prefix, database, destination] of [
    ['AWS_DB', 'gcs_ssc', 'DATABASE_URL'],
    ['AWS_ACCESS_DB', 'gcs_access', 'GCS_ACCESS_DATABASE_URL']
  ]) {
    const url = new URL(`postgresql://localhost:5432/${database}`)
    url.hostname = environment[`${prefix}_HOST`]
    url.username = encodeURIComponent(environment[`${prefix}_USER`])
    url.password = encodeURIComponent(environment[`${prefix}_PASSWORD`])
    url.searchParams.set('sslmode', 'verify-full')
    url.searchParams.set('sslrootcert', '/app/.output/rds-ca.pem')
    environment[destination] = url.toString()
  }
  environment.GCS_EXTENSION_SECRETS_KEY = createHash('sha256')
    .update(environment.AWS_EXTENSION_SECRET_SEED).digest('base64')
  delete environment.AWS_ACCESS_DB_PASSWORD
  delete environment.AWS_DB_PASSWORD
  delete environment.AWS_EXTENSION_SECRET_SEED
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareAwsEnvironment(process.env)
  await import('./index.mjs')
}
