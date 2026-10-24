import { main } from '../tooling/gcs-ssc/scripts/test-production-artifact'

export * from '../tooling/gcs-ssc/scripts/test-production-artifact'

if (import.meta.main) await main()
