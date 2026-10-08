import { defineRailway, group, github, image, postgres, preserve, project, service, volume } from 'railway/iac'
import { readDemoImage } from '../deployment/demo-image.ts'
import { readPortalDemoImage } from '../deployment/portal-demo-image.ts'

// Imported from the existing GCS Demo environment; names preserve resource identity.
// Railway retains the generated gcs-ssc-demo.up.railway.app domain outside this graph.
export default defineRailway((ctx) => {
  if (ctx.projectName !== 'GCS Demo' || ctx.environment !== 'demo') {
    throw new Error('Link Railway to the GCS Demo project and demo environment before applying')
  }
  const demoImage = readDemoImage()
  const portalImage = readPortalDemoImage()
  const database = postgres('GCS DB', { region: 'us-east4-eqdc4a' })
  database.deploy = { sleepApplication: true, limitOverride: { containers: { cpu: 2, memoryBytes: 3000000000 } } }
  database.networking = { privateNetworkEndpoint: 'postgres' }
  const metabaseDatabase = postgres('Metabase DB', { region: 'us-east4-eqdc4a' })
  metabaseDatabase.deploy = { sleepApplication: true }
  metabaseDatabase.networking = { privateNetworkEndpoint: 'postgres-xwyo' }
  // The imported Metabase DB has no managed source in Railway. Keep its image unchanged.
  delete metabaseDatabase.source
  const freshPostgresVolume = volume('gcs-db-volume-release-reset', { alerts: { usage: { 100: {}, 80: {}, 95: {} } }, allowOnlineResize: true, region: 'us-east4-eqdc4a', sizeMB: 5000 })
  database.volumeAttachments = { 'gcs-db-volume-release-reset': { volume: freshPostgresVolume.address, mountPath: '/var/lib/postgresql/data' } }
  const gcsSscVolume = volume('gcs-ssc-volume', { alerts: { usage: { 100: {}, 80: {}, 95: {} } }, allowOnlineResize: true, region: 'us-east4-eqdc4a', sizeMB: 5000 })
  const metabaseVolume = volume('postgres-volume-4aPn', { alerts: { usage: { 100: {}, 80: {}, 95: {} } }, allowOnlineResize: true, region: 'us-east4-eqdc4a', sizeMB: 5000 })
  const portalVolume = volume('portal-db-volume', { allowOnlineResize: true, region: 'us-east4-eqdc4a', sizeMB: 5000 })
  const gcsSsc = service('gcs-ssc', {
    source: demoImage
      ? image(demoImage)
      : github('GCS-SSC/gcs-ssc', { branch: 'main' }),
    // Railway retains these legacy build fields on the live image service.
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    preDeploy: [],
    replicas: { 'us-east4-eqdc4a': 1 },
    deploy: { healthcheckPath: '/api/health', healthcheckTimeout: 300, sleepApplication: true, limitOverride: { containers: { cpu: 8, memoryBytes: 8000000000 } } },
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
  const gcsGroup = group('GCS', [gcsSsc, database])
  const portalDatabase = postgres('Portal DB', { region: 'us-east4-eqdc4a' })
  portalDatabase.volumeAttachments = { 'portal-db-volume': { volume: portalVolume.address, mountPath: '/var/lib/postgresql/data' } }
  const portal = service('gcs-ssc-portal', {
    source: image(portalImage),
    replicas: { 'us-east4-eqdc4a': 1 },
    deploy: { healthcheckPath: '/api/session', healthcheckTimeout: 300, sleepApplication: true },
    env: {
      DATABASE_URL: portalDatabase.env.DATABASE_URL,
      BETTER_AUTH_SECRET: ctx.shared.PORTAL_AUTH_SECRET,
      PORTAL_ENVIRONMENT: 'demo',
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: '3000'
    }
  })
  const portalGroup = group('Portal', [portal, portalDatabase])

  return project('GCS Demo', {
    resources: [gcsGroup, portalGroup, freshPostgresVolume, gcsSscVolume, portalVolume, metabaseVolume, metabaseGroup]
  })
})
