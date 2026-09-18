import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

/**
 * Prepare the existing application contract from ECS-injected secret values.
 * @param {NodeJS.ProcessEnv} environment - Container environment.
 * @returns {void}
 */
export const prepareAwsEnvironment = (environment) => {
  for (const name of ['AWS_DB_HOST', 'AWS_DB_USER', 'AWS_DB_PASSWORD', 'AWS_EXTENSION_SECRET_SEED']) {
    if (!environment[name]) throw new Error(`Missing required AWS runtime input: ${name}`)
  }
  const url = new URL('postgresql://localhost:5432/gcs_ssc')
  url.hostname = environment.AWS_DB_HOST
  url.username = encodeURIComponent(environment.AWS_DB_USER)
  url.password = encodeURIComponent(environment.AWS_DB_PASSWORD)
  url.searchParams.set('sslmode', 'verify-full')
  url.searchParams.set('sslrootcert', '/app/.output/rds-ca.pem')
  environment.DATABASE_URL = url.toString()
  environment.GCS_EXTENSION_SECRETS_KEY = createHash('sha256')
    .update(environment.AWS_EXTENSION_SECRET_SEED).digest('base64')
  delete environment.AWS_DB_PASSWORD
  delete environment.AWS_EXTENSION_SECRET_SEED
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareAwsEnvironment(process.env)
  await import('./index.mjs')
}
