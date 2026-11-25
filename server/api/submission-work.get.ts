import { defineEventHandler } from 'h3'
import { sql } from 'kysely'
import { buildAssignedWorkReadPredicates } from '~~/server/utils/assigned-work-query'
import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { PaginationSchema } from '~~/shared/types/schemas'

const SubmissionWorkQuerySchema = PaginationSchema.pick({ page: true, limit: true })

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const { page, limit } = await getValidatedQueryI18n(event, SubmissionWorkQuerySchema)
  return await event.context.$db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    const predicates = buildAssignedWorkReadPredicates(auth.userAbilities.getGrants()
      .filter(grant => grant.subject === 'agreement' && grant.action === 'read'))
    if (predicates.length === 0) return { items: [], hasNext: false }

    const rows = await trx
      .with('work', db => db.selectFrom('Funding_Case_Agreement_Submission as submission')
        .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.id', 'submission.egcs_fc_fundingagreement')
        .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'agreement.egcs_fc_transferpaymentstream')
        .innerJoin('Transfer_Payment_Profile as program', 'program.id', 'stream.egcs_tp_transferpaymentprofile')
        .innerJoin('Agency_Profile as agency', 'agency.id', 'program.egcs_tp_agency')
        .innerJoin('Common_Entity_Assignment as assignment', join => join.on(sql<boolean>`(
          (submission.egcs_fc_target = 'claim'
            AND assignment.egcs_cn_entitytype = 'fundingcaseagreementclaim' AND assignment.egcs_cn_entityid = submission.egcs_fc_result)
          OR (submission.egcs_fc_target = 'forecast'
            AND assignment.egcs_cn_entitytype = 'fundingcaseforecast' AND assignment.egcs_cn_entityid = submission.egcs_fc_result)
        )`))
        .innerJoin('Common_User as commonUser', 'commonUser.id', 'assignment.egcs_cn_user')
        .innerJoin('user as authUser', 'authUser.id', 'commonUser.egcs_cn_authuserid')
        .where('submission._deleted', '=', false)
        .where('agreement._deleted', '=', false)
        .where('stream._deleted', '=', false)
        .where('program._deleted', '=', false)
        .where('agency._deleted', '=', false)
        .where('assignment._deleted', '=', false)
        .where('assignment.egcs_cn_isprimary', '=', true)
        .where('commonUser._deleted', '=', false)
        .where('authUser._deleted', '=', false)
        .where('authUser.id', '=', auth.userId)
        .where('submission.egcs_fc_state', 'in', ['submitted', 'reviewing'])
        .select([
          'submission.id', 'submission.egcs_fc_target as target', 'submission.egcs_fc_result as targetId',
          'submission.egcs_fc_state as state', 'submission.egcs_fc_sourceid as sourceId',
          'agreement.id as agreementId', 'agreement.egcs_fc_agreementnumber as agreementNumber',
          'program.egcs_tp_agency as agency_id', 'program.id as program_id',
          sql<string>`'agreement'`.as('owner_subject')
        ]))
      .selectFrom('work')
      .select(['id', 'target', 'targetId', 'state', 'sourceId', 'agreementId', 'agreementNumber'])
      .where(sql<boolean>`(${sql.join(predicates, sql` OR `)})`)
      .orderBy('id', 'desc')
      .limit(limit + 1)
      .offset((page - 1) * limit)
      .execute()
    return { items: rows.slice(0, limit), hasNext: rows.length > limit }
  })
})
