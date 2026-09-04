import { generateAdminSqlDump } from '../server/utils/admin-sql-generator'

const main = async (): Promise<void> => {
  process.stdout.write(await generateAdminSqlDump())
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
