import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertDraftAgreementAmendmentCapability, resolveDraftAgreementAmendmentBudgetVersion } from '~~/server/utils/agreement-amendment'
import { FundingCaseAgreementBudgetLineItemCreateSchema } from '~~/shared/types/schemas'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { budgetFiscalYearStableId } from '~~/server/utils/agreement-budget-lineage'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import { sql } from 'kysely'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id'), amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const context = await authorizeAgreementResource(event, 'create', agreementId, db)
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  const body = await readValidatedBodyI18n(event, FundingCaseAgreementBudgetLineItemCreateSchema)
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
    const amendment = await assertDraftAgreementAmendmentCapability(event, trx, agreementId, amendmentId, ['budget'])
    if (!('id' in amendment)) return amendment
    const versionId = await resolveDraftAgreementAmendmentBudgetVersion(event, trx, agreementId, amendmentId)
    if (typeof versionId !== 'string') return versionId
    const year = await trx.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year').select('id')
      .where(budgetFiscalYearStableId, '=', body.egcs_fc_fundingagreementbudgetfiscalyear).where('egcs_fc_budgetversion', '=', versionId).where('_deleted', '=', false).executeTakeFirst()
    if (!year) return await notFound(event, 'AGREEMENT_BUDGET_FISCAL_YEAR_NOT_FOUND', 'apiErrors.agreement.budget_fiscal_year_not_found')
    const category = await trx.selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item').select('id')
      .where('id', '=', body.egcs_fc_organizationcostcategory).where('egcs_tp_transferpaymentstream', '=', context.streamId).where('_deleted', '=', false)
      .forUpdate().executeTakeFirst()
    if (!category) return await badRequest(event, 'INVALID_AGREEMENT_BUDGET_LINE_ITEM', 'apiErrors.agreement.invalid_cost_category_line_item')
    const inserted = await trx.insertInto('Funding_Case_Agreement_Budget_Line_Item').values({
      ...body,
      egcs_fc_totalamount: databaseMoneyValue(body.egcs_fc_totalamount),
      egcs_fc_programfunding: databaseMoneyValue(body.egcs_fc_programfunding),
      egcs_fc_otherfederalfunding: body.egcs_fc_otherfederalfunding === undefined ? undefined : databaseMoneyValue(body.egcs_fc_otherfederalfunding),
      egcs_fc_othergovfunding: body.egcs_fc_othergovfunding === undefined ? undefined : databaseMoneyValue(body.egcs_fc_othergovfunding),
      egcs_fc_otherfunding: body.egcs_fc_otherfunding === undefined ? undefined : databaseMoneyValue(body.egcs_fc_otherfunding),
      egcs_fc_fundingagreement: agreementId,
      egcs_fc_fundingagreementbudgetfiscalyear: String(year.id)
    }).returning([
      'id', 'egcs_fc_originalbudgetlineitem', 'egcs_fc_fundingagreementbudgetfiscalyear',
      'egcs_fc_organizationcostcategory', 'egcs_fc_costsubsection', 'egcs_fc_description',
      databaseMoneyText(sql.ref('egcs_fc_totalamount')).as('egcs_fc_totalamount'),
      databaseMoneyText(sql.ref('egcs_fc_programfunding')).as('egcs_fc_programfunding'),
      databaseMoneyText(sql.ref('egcs_fc_otherfederalfunding')).as('egcs_fc_otherfederalfunding'),
      databaseMoneyText(sql.ref('egcs_fc_othergovfunding')).as('egcs_fc_othergovfunding'),
      databaseMoneyText(sql.ref('egcs_fc_otherfunding')).as('egcs_fc_otherfunding'),
      'egcs_fc_currency'
    ]).executeTakeFirstOrThrow()
    return {
      ...inserted,
      egcs_fc_totalamount: parseDatabaseMoney(inserted.egcs_fc_totalamount),
      egcs_fc_programfunding: parseDatabaseMoney(inserted.egcs_fc_programfunding),
      egcs_fc_otherfederalfunding: inserted.egcs_fc_otherfederalfunding === null ? null : parseDatabaseMoney(inserted.egcs_fc_otherfederalfunding),
      egcs_fc_othergovfunding: inserted.egcs_fc_othergovfunding === null ? null : parseDatabaseMoney(inserted.egcs_fc_othergovfunding),
      egcs_fc_otherfunding: inserted.egcs_fc_otherfunding === null ? null : parseDatabaseMoney(inserted.egcs_fc_otherfunding),
      id: inserted.id,
      egcs_fc_fundingagreementbudgetfiscalyear: body.egcs_fc_fundingagreementbudgetfiscalyear
    }
  }, {
    action: 'create',
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
    businessStatusTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
})
