/* eslint-disable jsdoc/require-jsdoc -- Shared assessment-schema scope helpers. */
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export const fetchAssessmentReviewSchemaForAgency = async (
  db: Kysely<Database>,
  agencyId: string,
  schemaId: string,
  forUpdate = false
) => {
  if (!isPositivePostgresBigintText(schemaId)) return undefined
  const query = db.selectFrom('Common_Review_Schema')
    .selectAll()
    .where('id', '=', schemaId)
    .where('egcs_cn_agency', '=', agencyId)
    .where('egcs_cn_reviewtype', '=', 'assessment')
    .where('_deleted', '=', false)
  return await (forUpdate ? query.forUpdate() : query).executeTakeFirst()
}
