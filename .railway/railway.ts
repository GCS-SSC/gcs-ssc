import { defineRailway, group, github, image, postgres, preserve, project, service, volume } from 'railway/iac'
import { readDemoImage } from '../deployment/demo-image.ts'

// Imported from the existing GCS Demo environment; names preserve resource identity.
// Railway retains the generated gcs-ssc-demo.up.railway.app domain outside this graph.
export default defineRailway((ctx) => {
  if (ctx.projectName !== 'GCS Demo' || ctx.environment !== 'demo') {
    throw new Error('Link Railway to the GCS Demo project and demo environment before applying')
  }
  const demoImage = readDemoImage()
  const database = postgres('GCS DB', { region: 'us-east4-eqdc4a' })
  database.deploy = { limitOverride: { containers: { cpu: 2, memoryBytes: 3000000000 } } }
  database.networking = { privateNetworkEndpoint: 'postgres' }
  const metabaseDatabase = postgres('Metabase DB', { region: 'us-east4-eqdc4a' })
  metabaseDatabase.deploy = { sleepApplication: true }
  metabaseDatabase.networking = { privateNetworkEndpoint: 'postgres-xwyo' }
  // The imported Metabase DB has no managed source in Railway. Keep its image unchanged.
  delete metabaseDatabase.source
  const postgresVolume = volume('gcs-db-volume', { alerts: { usage: { 100: {}, 80: {}, 95: {} } }, allowOnlineResize: true, region: 'us-east4-eqdc4a', sizeMB: 5000 })
  const gcsSscVolume = volume('gcs-ssc-volume', { alerts: { usage: { 100: {}, 80: {}, 95: {} } }, allowOnlineResize: true, region: 'us-east4-eqdc4a', sizeMB: 5000 })
  const metabaseVolume = volume('postgres-volume-4aPn', { alerts: { usage: { 100: {}, 80: {}, 95: {} } }, allowOnlineResize: true, region: 'us-east4-eqdc4a', sizeMB: 5000 })
  const gcsSsc = service('gcs-ssc', {
    source: demoImage
      ? image(demoImage)
      : github('GCS-SSC/gcs-ssc', { branch: 'main' }),
    // Railway retains these legacy build fields on the live image service.
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    preDeploy: [],
    replicas: { 'us-east4-eqdc4a': 1 },
    deploy: { healthcheckPath: '/api/health', healthcheckTimeout: 300, limitOverride: { containers: { cpu: 8, memoryBytes: 8000000000 } } },
    volumeMounts: { '/app/.data': gcsSscVolume },
    env: { DATABASE_URL: preserve(), BETTER_AUTH_SECRET: preserve(), BETTER_AUTH_TRUSTED_ORIGINS: preserve(), BETTER_AUTH_URL: preserve(), ENVIRONMENT_TYPE: 'demo', GCS_EXTENSION_SECRETS_KEY: preserve(), RAILWAY_RUN_UID: preserve() }
  })
  const metabase = service('Metabase', {
    source: image('metabase/metabase'),
    replicas: { 'us-east4-eqdc4a': 1 },
    deploy: { healthcheckPath: '/api/health', sleepApplication: true },
    networking: { privateNetworkEndpoint: 'metabase' },
    env: { ENABLE_ALPINE_PRIVATE_NETWORKING: preserve(), MB_DB_DBNAME: preserve(), MB_DB_HOST: preserve(), MB_DB_PASS: preserve(), MB_DB_PORT: preserve(), MB_DB_TYPE: preserve(), MB_DB_USER: preserve(), MB_PASSWORD_COMPLEXITY: preserve(), MB_SITE_URL: preserve(), PORT: preserve() }
  })
  const metabaseGroup = group('Metabase', [metabase, metabaseDatabase])

  return project('GCS Demo', {
    resources: [database, gcsSsc, postgresVolume, gcsSscVolume, metabaseVolume, metabaseGroup]
  })
})
