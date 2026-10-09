import { z } from 'zod'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { resolveApplicantRecipientAuthorization } from '~~/server/utils/applicant-recipient-auth'
import { APPLICANT_RECIPIENT_CHILD_ERROR_KEYS, assertApplicantRecipientChildExists } from '~~/server/utils/applicant-recipient-child-resources'
import { buildAgreementScope, canAccessAgreement } from '~~/server/utils/agreement'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const QuerySchema = z.object({ permission_action: z.enum(['read', 'update', 'delete']).default('read') })

export default defineEventHandler(async event => {
  const proponentId = getRouterParam(event, 'id')
  const financialId = getRouterParam(event, 'childId')
  if (!proponentId || !financialId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(proponentId)) return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
  if (!isPositivePostgresBigintText(financialId)) return await notFound(event, ...APPLICANT_RECIPIENT_CHILD_ERROR_KEYS.agencyFinancialIdNotFound)
  const query = await getValidatedQueryI18n(event, QuerySchema)
  return await executeFreshReadSnapshot(event, async db => {
    await authorize(event, 'applicant_recipient', query.permission_action, async ({ context }) =>
      await resolveApplicantRecipientAuthorization(context, proponentId, query.permission_action, db))
    const financial = await assertApplicantRecipientChildExists(event,
      db.selectFrom('Applicant_Recipient_Agency_Financial_Id').where('id', '=', financialId)
        .where('egcs_ar_applicantrecipient', '=', proponentId).where('_deleted', '=', false)
        .select('id').executeTakeFirst(), ...APPLICANT_RECIPIENT_CHILD_ERROR_KEYS.agencyFinancialIdNotFound)
    if (!financial || typeof financial !== 'object' || !('id' in financial)) return financial
    const auth = await requireAuthContext(event)
    const uses = await db.selectFrom('Funding_Case_Agreement_Applicant_Recipient as r')
      .innerJoin('Funding_Case_Agreement_Profile as a', 'a.id', 'r.egcs_fc_fundingagreement')
      .innerJoin('Common_Status as status', 'status.id', 'a.egcs_fc_status')
      .innerJoin('Transfer_Payment_Stream as s', 's.id', 'a.egcs_fc_transferpaymentstream')
      .innerJoin('Transfer_Payment_Profile as p', 'p.id', 's.egcs_tp_transferpaymentprofile')
      .where('r.egcs_fc_agencyfinancialid', '=', financialId).where('r.egcs_fc_applicantrecipient', '=', proponentId)
      .where('r._deleted', '=', false).where('a._deleted', '=', false).where('status.egcs_cn_terminal', '=', false)
      .select(['a.id', 'a.egcs_fc_agreementnumber', 'a.egcs_fc_title_en', 'a.egcs_fc_title_fr',
        's.id as stream_id', 'p.id as program_id', 'p.egcs_tp_agency as agency_id'])
      .orderBy('a.id').execute()
    const items = await Promise.all(uses.map(async use => {
      const readable = await canAccessAgreement(auth, 'read', buildAgreementScope(
        String(use.agency_id), String(use.program_id), String(use.stream_id), String(use.id)), db)
      // Proponent funding history already exposes minimal Agreement metadata for
      // restricted uses; detail identity and navigation require Agreement read.
      return { id: readable ? String(use.id) : null, can_read: readable,
        egcs_fc_agreementnumber: use.egcs_fc_agreementnumber,
        egcs_fc_title_en: use.egcs_fc_title_en, egcs_fc_title_fr: use.egcs_fc_title_fr }
    }))
    return { items, total: items.length }
  })
})
