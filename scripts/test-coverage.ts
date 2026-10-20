import { runCoverageFiles } from '../tooling/gcs-ssc/scripts/test-coverage'
import { discoverUnitFiles } from './test-unit'

export * from '../tooling/gcs-ssc/scripts/test-coverage'

if (import.meta.main) process.exitCode = await runCoverageFiles(discoverUnitFiles())
