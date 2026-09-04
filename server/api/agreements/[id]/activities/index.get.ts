import { badRequest } from '~~/server/utils/api-errors'
import { PaginationSchema } from '~~/shared/types/schemas'
import { sql } from 'kysely'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementExists } from '~~/server/utils/agreement-child-resources'
import {
  getAgreementActivityOutcomeTags,
  getAgreementActivityResponsiblePartyTags
} from '~~/server/utils/agreement-activity'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  return await executeFreshReadSnapshot(event, async db => {
    const agreementContext = await authorizeAgreementResource(event, 'read', agreementId, db, { freshAuth: true })
    if (!agreementContext) {
      return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    }

    const agreement = await assertAgreementExists(event, agreementId, db)
    if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
      return agreement
    }

    const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
    const offset = (page - 1) * limit

    let activityIdsQuery = db
      .selectFrom('Funding_Case_Agreement_Activity')
      .innerJoin(
        'Funding_Case_Agreement_Activity_Version',
        'Funding_Case_Agreement_Activity_Version.id',
        'Funding_Case_Agreement_Activity.egcs_fc_activityversion'
      )
      .leftJoin(
        'Funding_Case_Agreement_Outcome_Activity',
        'Funding_Case_Agreement_Outcome_Activity.egcs_fc_activity',
        'Funding_Case_Agreement_Activity.id'
      )
      .leftJoin(
        'Transfer_Payment_Outcome',
        'Transfer_Payment_Outcome.id',
        'Funding_Case_Agreement_Outcome_Activity.egcs_fc_outcomes'
      )
      .leftJoin(
        'Funding_Case_Agreement_Responsible_Party_Activity',
        'Funding_Case_Agreement_Responsible_Party_Activity.egcs_fc_activity',
        'Funding_Case_Agreement_Activity.id'
      )
      .leftJoin(
        'Funding_Case_Agreement_Applicant_Recipient',
        'Funding_Case_Agreement_Applicant_Recipient.id',
        'Funding_Case_Agreement_Responsible_Party_Activity.egcs_fc_responsibleparty'
      )
      .leftJoin(
        'Applicant_Recipient_Profile',
        'Applicant_Recipient_Profile.id',
        'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient'
      )
      .where('Funding_Case_Agreement_Activity.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Activity._deleted', '=', false)
      .where('Funding_Case_Agreement_Activity_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Activity_Version._deleted', '=', false)
      .where(eb => eb.or([
        eb('Funding_Case_Agreement_Outcome_Activity.id', 'is', null),
        eb('Funding_Case_Agreement_Outcome_Activity._deleted', '=', false)
      ]))
      .where(eb => eb.or([
        eb('Transfer_Payment_Outcome.id', 'is', null),
        eb('Transfer_Payment_Outcome._deleted', '=', false)
      ]))
      .where(eb => eb.or([
        eb('Funding_Case_Agreement_Responsible_Party_Activity.id', 'is', null),
        eb('Funding_Case_Agreement_Responsible_Party_Activity._deleted', '=', false)
      ]))
      .where(eb => eb.or([
        eb('Funding_Case_Agreement_Applicant_Recipient.id', 'is', null),
        eb('Funding_Case_Agreement_Applicant_Recipient._deleted', '=', false)
      ]))
      .where(eb => eb.or([
        eb('Applicant_Recipient_Profile.id', 'is', null),
        eb('Applicant_Recipient_Profile._deleted', '=', false)
      ]))

    if (search) {
      const escapedSearch = escapeLikePattern(search)
      activityIdsQuery = activityIdsQuery.where(eb => eb.or([
        eb(sql<string>`CAST(${sql.ref('Funding_Case_Agreement_Activity.id')} AS TEXT)`, '=', escapedSearch),
        eb('Funding_Case_Agreement_Activity.egcs_fc_name_en', 'ilike', `%${escapedSearch}%`),
        eb('Funding_Case_Agreement_Activity.egcs_fc_name_fr', 'ilike', `%${escapedSearch}%`),
        eb('Funding_Case_Agreement_Activity.egcs_fc_description_en', 'ilike', `%${escapedSearch}%`),
        eb('Funding_Case_Agreement_Activity.egcs_fc_description_fr', 'ilike', `%${escapedSearch}%`),
        eb('Funding_Case_Agreement_Activity.egcs_fc_expectedresults_en', 'ilike', `%${escapedSearch}%`),
        eb('Funding_Case_Agreement_Activity.egcs_fc_expectedresults_fr', 'ilike', `%${escapedSearch}%`),
        eb('Transfer_Payment_Outcome.egcs_tp_name_en', 'ilike', `%${escapedSearch}%`),
        eb('Transfer_Payment_Outcome.egcs_tp_name_fr', 'ilike', `%${escapedSearch}%`),
        eb(sql<string>`COALESCE("Applicant_Recipient_Profile"."egcs_ar_legalname_en", "Applicant_Recipient_Profile"."egcs_ar_operatingname_en")`, 'ilike', `%${escapedSearch}%`),
        eb(sql<string>`COALESCE("Applicant_Recipient_Profile"."egcs_ar_legalname_fr", "Applicant_Recipient_Profile"."egcs_ar_operatingname_fr")`, 'ilike', `%${escapedSearch}%`)
      ]))
    }

    const [matchingActivityIds, countResult] = await Promise.all([
      activityIdsQuery
        .select('Funding_Case_Agreement_Activity.id as id')
        .distinct()
        .orderBy('Funding_Case_Agreement_Activity.id', 'asc')
        .limit(limit)
        .offset(offset)
        .execute(),
      activityIdsQuery
        .select(sql<string>`count(distinct ${sql.ref('Funding_Case_Agreement_Activity.id')})`.as('total'))
        .executeTakeFirst()
    ])
    const pagedActivityIds = matchingActivityIds.map(row => String(row.id))
    const total = Number(countResult?.total ?? 0)

    if (pagedActivityIds.length === 0) {
      return {
        items: [],
        total,
        stats: {
          total,
          active: total
        },
        page,
        limit
      }
    }

    const [activityRows, outcomeTagsByActivityId, responsiblePartyTagsByActivityId] = await Promise.all([
      db
        .selectFrom('Funding_Case_Agreement_Activity')
        .where('Funding_Case_Agreement_Activity.id', 'in', pagedActivityIds)
        .where('Funding_Case_Agreement_Activity._deleted', '=', false)
        .select([
          'Funding_Case_Agreement_Activity.id as id',
          'Funding_Case_Agreement_Activity.egcs_fc_fundingagreement as egcs_fc_fundingagreement',
          'Funding_Case_Agreement_Activity.egcs_fc_name_en as egcs_fc_name_en',
          'Funding_Case_Agreement_Activity.egcs_fc_name_fr as egcs_fc_name_fr',
          'Funding_Case_Agreement_Activity.egcs_fc_description_en as egcs_fc_description_en',
          'Funding_Case_Agreement_Activity.egcs_fc_description_fr as egcs_fc_description_fr',
          'Funding_Case_Agreement_Activity.egcs_fc_expectedresults_en as egcs_fc_expectedresults_en',
          'Funding_Case_Agreement_Activity.egcs_fc_expectedresults_fr as egcs_fc_expectedresults_fr',
          'Funding_Case_Agreement_Activity.egcs_fc_startdate as egcs_fc_startdate',
          'Funding_Case_Agreement_Activity.egcs_fc_enddate as egcs_fc_enddate'
        ])
        .execute(),
      getAgreementActivityOutcomeTags(db, pagedActivityIds),
      getAgreementActivityResponsiblePartyTags(db, pagedActivityIds)
    ])

    const rowsById = new Map(activityRows.map(row => [String(row.id), row]))
    const items = pagedActivityIds
      .map(activityId => {
        const row = rowsById.get(activityId)
        if (!row) {
          return null
        }

        const outcomes = outcomeTagsByActivityId.get(activityId) ?? []
        const responsibleParties = responsiblePartyTagsByActivityId.get(activityId) ?? []

        return {
          ...row,
          outcome_ids: outcomes.map(outcome => outcome.id),
          responsible_party_ids: responsibleParties.map(responsibleParty => responsibleParty.id),
          outcomes,
          responsible_parties: responsibleParties
        }
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))

    return {
      items,
      total,
      stats: {
        total,
        active: total
      },
      page,
      limit
    }
  })
})
