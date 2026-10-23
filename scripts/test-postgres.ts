import { runPostgresSuites } from '../tooling/gcs-ssc/scripts/test-postgres'

export * from '../tooling/gcs-ssc/scripts/test-postgres'

if (import.meta.main) await runPostgresSuites()
