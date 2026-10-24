import { main } from '../tooling/gcs-ssc/scripts/test-webcontainer-artifact'

export * from '../tooling/gcs-ssc/scripts/test-webcontainer-artifact'

if (import.meta.main) await main()
