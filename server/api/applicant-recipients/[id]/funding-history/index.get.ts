import { sql } from 'kysely'
import { authorizeWithFreshAuthContext, requireFreshAuthContext, type AuthContext } from '~~/server/utils/authorize'
import { badRequest, throwApiError } from '~~/server/utils/api-errors'
import { canAccessAgreement, buildAgreementScope } from '~~/server/utils/agreement'
import {
  canAccessApplicantRecipientIds,
  resolveApplicantRecipientAuthorization
} from '~~/server/utils/applicant-recipient-auth'
import { assertApplicantRecipientProfileExists } from '~~/server/utils/applicant-recipient-child-resources'
import { PaginationSchema } from '~~/shared/types/schemas'
import { isValidFundingHistoryId } from '~~/server/utils/funding-history-id'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'
import { addMoney, parseMoney, type Money } from '~~/shared/utils/money'
import type { Database } from '~~/shared/types/database'
import type { Transaction } from 'kysely'

interface FundingTotal {
  currency: string
  amount: Money
}

const ZERO_MONEY = parseMoney('0')
const MAX_HISTORY_ROWS = 5_000
const MAX_HISTORY_DETAIL_ROWS = 50_000

const addTotal = (totals: Map<string, Money>, currency: string, amount: Money): void => {
  totals.set(currency, addMoney(totals.get(currency) ?? ZERO_MONEY, amount))
}

// eslint-disable-next-line local/require-authorize -- fresh authorization is performed inside the repeatable-read transaction.
export default defineEventHandler(async event => {
  const database = event.context.$db
  const applicantRecipientId = getRouterParam(event, 'id')
  if (!isValidFundingHistoryId(applicantRecipientId)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')

  /** Reads the composite history and permissions from one snapshot.
   * @param db - Active repeatable-read transaction.
   * @param authContext - Fresh authorization context loaded in the transaction.
   * @returns Paginated funding-history response.
   */
  const read = async (db: Transaction<Database>, authContext: AuthContext) => {
    await authorizeWithFreshAuthContext(event, authContext, 'applicant_recipient', 'read', async ({ context }) =>
      await resolveApplicantRecipientAuthorization(context, applicantRecipientId, 'read', db))
    const profile = await assertApplicantRecipientProfileExists(event, applicantRecipientId, db)
    if (!profile || typeof profile !== 'object' || !('id' in profile)) return profile
    const query = await getValidatedQueryI18n(event, PaginationSchema)

    const [systemRecords, externalRecords] = await Promise.all([
      db
        .selectFrom('Funding_Case_Agreement_Applicant_Recipient')
        .innerJoin(
          'Funding_Case_Agreement_Profile',
          'Funding_Case_Agreement_Profile.id',
          'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_fundingagreement'
        )
        .innerJoin(
          'Transfer_Payment_Stream',
          'Transfer_Payment_Stream.id',
          'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'
        )
        .innerJoin(
          'Transfer_Payment_Profile',
          'Transfer_Payment_Profile.id',
          'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
        )
        .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
        .where('Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient', '=', applicantRecipientId)
        .where('Funding_Case_Agreement_Applicant_Recipient._deleted', '=', false)
        .where('Funding_Case_Agreement_Profile._deleted', '=', false)
        .select([
          'Funding_Case_Agreement_Profile.id as agreementId',
          'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream as streamId',
          'Funding_Case_Agreement_Profile.egcs_fc_agreementnumber as agreementNumber',
          'Funding_Case_Agreement_Profile.egcs_fc_title_en as titleEn',
          'Funding_Case_Agreement_Profile.egcs_fc_title_fr as titleFr',
          'Funding_Case_Agreement_Profile.egcs_fc_description_en as descriptionEn',
          'Funding_Case_Agreement_Profile.egcs_fc_description_fr as descriptionFr',
          'Funding_Case_Agreement_Profile.egcs_fc_authorizedassistancestartdate as startDate',
          'Funding_Case_Agreement_Profile.egcs_fc_authorizedassistanceenddate as endDate',
          'Transfer_Payment_Profile.id as programId',
          'Transfer_Payment_Profile.egcs_tp_agency as agencyId',
          'Transfer_Payment_Profile.egcs_tp_name_en as programNameEn',
          'Transfer_Payment_Profile.egcs_tp_name_fr as programNameFr',
          'Agency_Profile.egcs_ay_name_en as agencyNameEn',
          'Agency_Profile.egcs_ay_name_fr as agencyNameFr'
        ])
        .orderBy('Funding_Case_Agreement_Profile.id', 'asc')
        .limit(MAX_HISTORY_ROWS + 1)
        .execute(),
      db
        .selectFrom('Applicant_Recipient_Funding_History_Recipient')
        .innerJoin(
          'Applicant_Recipient_Funding_History',
          'Applicant_Recipient_Funding_History.id',
          'Applicant_Recipient_Funding_History_Recipient.egcs_ar_fundinghistory'
        )
        .where('Applicant_Recipient_Funding_History_Recipient.egcs_ar_applicantrecipient', '=', applicantRecipientId)
        .where('Applicant_Recipient_Funding_History_Recipient._deleted', '=', false)
        .where('Applicant_Recipient_Funding_History._deleted', '=', false)
        .select([
          'Applicant_Recipient_Funding_History.id as historyId',
          'Applicant_Recipient_Funding_History.egcs_ar_agencyname_en as agencyNameEn',
          'Applicant_Recipient_Funding_History.egcs_ar_agencyname_fr as agencyNameFr',
          'Applicant_Recipient_Funding_History.egcs_ar_programname_en as programNameEn',
          'Applicant_Recipient_Funding_History.egcs_ar_programname_fr as programNameFr',
          'Applicant_Recipient_Funding_History.egcs_ar_agreementnumber as agreementNumber',
          'Applicant_Recipient_Funding_History.egcs_ar_title_en as titleEn',
          'Applicant_Recipient_Funding_History.egcs_ar_title_fr as titleFr',
          'Applicant_Recipient_Funding_History.egcs_ar_description_en as descriptionEn',
          'Applicant_Recipient_Funding_History.egcs_ar_description_fr as descriptionFr',
          'Applicant_Recipient_Funding_History.egcs_ar_startdate as startDate',
          'Applicant_Recipient_Funding_History.egcs_ar_enddate as endDate',
          databaseMoneyText(sql.ref('Applicant_Recipient_Funding_History.egcs_ar_fundingamount')).as('amount'),
          'Applicant_Recipient_Funding_History.egcs_ar_currency as currency'
        ])
        .orderBy('Applicant_Recipient_Funding_History.id', 'asc')
        .limit(MAX_HISTORY_ROWS + 1)
        .execute()
    ])
    if (systemRecords.length > MAX_HISTORY_ROWS || externalRecords.length > MAX_HISTORY_ROWS) {
      return await throwApiError(event, {
        statusCode: 413, code: 'FUNDING_HISTORY_TOO_LARGE', key: 'apiErrors.applicant_recipient.funding_history_too_large'
      })
    }

    const systemIds = systemRecords.map(record => String(record.agreementId))
    const externalIds = externalRecords.map(record => String(record.historyId))
    const [budgetLines, recipientRecords] = await Promise.all([
      systemIds.length === 0
        ? []
        : db
            .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
            .innerJoin(
              'Funding_Case_Agreement_Budget_Version',
              'Funding_Case_Agreement_Budget_Version.id',
              'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
            )
            .innerJoin(
              'Funding_Case_Agreement_Budget_Line_Item',
              'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear',
              'Funding_Case_Agreement_Budget_Fiscal_Year.id'
            )
            .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', 'in', systemIds)
            .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
            .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
            .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
            .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
            .select([
              'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement as agreementId',
              'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_currency as currency',
              databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_programfunding')).as('amount')
            ])
            .limit(MAX_HISTORY_DETAIL_ROWS + 1)
            .execute(),
      externalIds.length === 0
        ? []
        : db
            .selectFrom('Applicant_Recipient_Funding_History_Recipient')
            .innerJoin(
              'Applicant_Recipient_Profile',
              'Applicant_Recipient_Profile.id',
              'Applicant_Recipient_Funding_History_Recipient.egcs_ar_applicantrecipient'
            )
            .where('Applicant_Recipient_Funding_History_Recipient.egcs_ar_fundinghistory', 'in', externalIds)
            .where('Applicant_Recipient_Funding_History_Recipient._deleted', '=', false)
            .select([
              'Applicant_Recipient_Funding_History_Recipient.egcs_ar_fundinghistory as historyId',
              'Applicant_Recipient_Profile.id as id',
              'Applicant_Recipient_Profile.egcs_ar_legalname_en as labelEn',
              'Applicant_Recipient_Profile.egcs_ar_legalname_fr as labelFr'
            ])
            .orderBy('Applicant_Recipient_Profile.id', 'asc')
            .limit(MAX_HISTORY_DETAIL_ROWS + 1)
            .execute()
    ])
    if (budgetLines.length > MAX_HISTORY_DETAIL_ROWS || recipientRecords.length > MAX_HISTORY_DETAIL_ROWS) {
      return await throwApiError(event, {
        statusCode: 413, code: 'FUNDING_HISTORY_TOO_LARGE', key: 'apiErrors.applicant_recipient.funding_history_too_large'
      })
    }

    const totalsByAgreement = new Map<string, Map<string, Money>>()
    for (const line of budgetLines) {
      const agreementId = String(line.agreementId)
      const totals = totalsByAgreement.get(agreementId) ?? new Map<string, Money>()
      addTotal(totals, line.currency, parseDatabaseMoney(line.amount))
      totalsByAgreement.set(agreementId, totals)
    }
    const toTotals = (totals: Map<string, Money> | undefined): FundingTotal[] =>
      [...(totals ?? new Map<string, Money>()).entries()].map(([currency, amount]) => ({ currency, amount }))

    const systemRows = await Promise.all(systemRecords.map(async record => {
      const agreementId = String(record.agreementId)
      const scope = buildAgreementScope(
        String(record.agencyId),
        String(record.programId),
        String(record.streamId),
        agreementId
      )
      if (!await canAccessAgreement(authContext, 'read', scope, db)) {
        return { rowKey: `system:${agreementId}`, source: 'system' as const, restricted: true }
      }
      const [canUpdate, canDelete] = await Promise.all([
        canAccessAgreement(authContext, 'update', scope, db),
        canAccessAgreement(authContext, 'delete', scope, db)
      ])
      return {
        rowKey: `system:${agreementId}`,
        source: 'system' as const,
        restricted: false,
        agreementId,
        agencyNameEn: record.agencyNameEn,
        agencyNameFr: record.agencyNameFr,
        programNameEn: record.programNameEn,
        programNameFr: record.programNameFr,
        agreementNumber: record.agreementNumber,
        titleEn: record.titleEn,
        titleFr: record.titleFr,
        descriptionEn: record.descriptionEn,
        descriptionFr: record.descriptionFr,
        startDate: record.startDate,
        endDate: record.endDate,
        totals: toTotals(totalsByAgreement.get(agreementId)),
        canUpdate,
        canDelete
      }
    }))

    const recipientsByHistory = new Map<string, typeof recipientRecords>()
    for (const recipient of recipientRecords) {
      const historyId = String(recipient.historyId)
      recipientsByHistory.set(historyId, [...(recipientsByHistory.get(historyId) ?? []), recipient])
    }
    const externalRows = await Promise.all(externalRecords.map(async record => {
      const historyId = String(record.historyId)
      const recipients = (recipientsByHistory.get(historyId) ?? []).map(recipient => ({
        id: String(recipient.id),
        labelEn: recipient.labelEn,
        labelFr: recipient.labelFr
      }))
      const recipientIds = recipients.map(recipient => recipient.id)
      if (!await canAccessApplicantRecipientIds(authContext, recipientIds, 'read', db)) {
        return { rowKey: `external:${historyId}`, source: 'external' as const, restricted: true }
      }
      const [canUpdate, canDelete] = await Promise.all([
        canAccessApplicantRecipientIds(authContext, recipientIds, 'update', db),
        canAccessApplicantRecipientIds(authContext, [applicantRecipientId], 'delete', db)
      ])
      return {
        rowKey: `external:${historyId}`,
        source: 'external' as const,
        restricted: false,
        historyId,
        agencyNameEn: record.agencyNameEn,
        agencyNameFr: record.agencyNameFr,
        programNameEn: record.programNameEn,
        programNameFr: record.programNameFr,
        agreementNumber: record.agreementNumber,
        titleEn: record.titleEn,
        titleFr: record.titleFr,
        descriptionEn: record.descriptionEn,
        descriptionFr: record.descriptionFr,
        startDate: record.startDate,
        endDate: record.endDate,
        totals: [{ currency: record.currency, amount: parseDatabaseMoney(record.amount) }],
        recipients,
        canUpdate,
        canDelete
      }
    }))

    const normalizedSearch = (query.search || '').trim().toLocaleLowerCase('en-CA')
    const rows = [...systemRows, ...externalRows]
      .filter(row => {
        if (!normalizedSearch || row.restricted) return true
        return [row.agencyNameEn, row.agencyNameFr, row.programNameEn, row.programNameFr,
          row.agreementNumber, row.titleEn, row.titleFr]
          .some(value => String(value ?? '').toLocaleLowerCase('en-CA').includes(normalizedSearch))
      })
      .sort((left, right) => left.rowKey.localeCompare(right.rowKey))
    const total = rows.length
    const offset = (query.page - 1) * query.limit
    return {
      items: rows.slice(offset, offset + query.limit),
      total,
      stats: { total, active: total },
      page: query.page,
      limit: query.limit
    }
  }
  return await database.transaction().setIsolationLevel('repeatable read').execute(async trx =>
    await read(trx, await requireFreshAuthContext(event, trx)))
})
