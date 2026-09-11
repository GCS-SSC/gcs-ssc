import { defineRailway, github, postgres, preserve, project, service, volume } from 'railway/iac'

// Imported from the existing GCS Demo environment; names preserve resource identity.
// Railway retains the generated gcs-ssc-demo.up.railway.app domain outside this graph.
export default defineRailway((ctx) => {
  if (ctx.projectName !== 'GCS Demo' || ctx.environment !== 'demo') {
    throw new Error('Link Railway to the GCS Demo project and demo environment before applying')
  }
  const database = postgres('Postgres', { region: 'us-east4-eqdc4a' })
  database.deploy = { sleepApplication: true, limitOverride: { containers: { cpu: 2, memoryBytes: 3000000000 } } }
  database.networking = { privateNetworkEndpoint: 'postgres' }
  const postgresVolume = volume('postgres-volume', { alerts: { usage: { 100: {}, 80: {}, 95: {} } }, allowOnlineResize: true, region: 'us-east4-eqdc4a', sizeMB: 5000 })
  const gcsSscVolume = volume('gcs-ssc-volume', { alerts: { usage: { 100: {}, 80: {}, 95: {} } }, allowOnlineResize: true, region: 'us-east4-eqdc4a', sizeMB: 5000 })
  const gcsSsc = service('gcs-ssc', {
    source: github('GCS-SSC/gcs-ssc', { branch: 'main' }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    replicas: { 'us-east4-eqdc4a': 1 },
    // Railway's default restart policy is retained; explicit defaults report false drift.
    deploy: { healthcheckPath: '/api/health', healthcheckTimeout: 300, limitOverride: { containers: { cpu: 2, memoryBytes: 3000000000 } }, sleepApplication: true },
    volumeMounts: { '/app/.data': gcsSscVolume },
    env: { DATABASE_URL: database.env.DATABASE_URL, BETTER_AUTH_SECRET: preserve(), BETTER_AUTH_TRUSTED_ORIGINS: preserve(), BETTER_AUTH_URL: preserve(), ENVIRONMENT_TYPE: 'demo', GCS_EXTENSION_SECRETS_KEY: preserve(), RAILWAY_RUN_UID: preserve() }
  })

  return project('GCS Demo', {
    resources: [database, gcsSsc, postgresVolume, gcsSscVolume]
  })
})
