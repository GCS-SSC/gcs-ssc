import { parentPort } from 'node:worker_threads'
import { generateAdminSqlDump } from '../utils/admin-sql-generator'

if (parentPort === null) {
  throw new Error('Admin SQL dump worker started without a parent message port')
}

try {
  parentPort.postMessage({
    ok: true,
    sql: await generateAdminSqlDump()
  })
} catch (error: unknown) {
  parentPort.postMessage({
    error: error instanceof Error ? error.message : String(error),
    ok: false
  })
} finally {
  parentPort.close()
}
