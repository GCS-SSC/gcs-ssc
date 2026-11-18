import { parseSafeDecimal } from '~~/shared/utils/decimal'
import { defineEventHandler, getRouterParam } from 'h3'
import { loadAgreementBudgetProponentName, resolveAgreementBudgetProponent } from '~~/server/utils/agreement-budget-proponent'
import { assertAgreementCurrency, assertCurrencyMoneyValues } from '~~/server/utils/agreement-currency'
import { fetchAgreementBudgetCostCategory } from '~~/server/utils/cost-configuration-integrity'
import { FundingCaseAgreementBudgetLineItemCreateSchema } from '~~/shared/types/schemas'
import { prepareBudgetCalculation, prepareNewBudgetLine, recalculateBudgetAfterLineWrite } from '~~/server/utils/agreement-budget-calculation'
import { loadAgreementBudgetManagement } from '~~/server/utils/agreement-funding-breakdown'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertDraftAgreementAmendmentCapability, resolveDraftAgreementAmendmentBudgetVersion } from '~~/server/utils/agreement-amendment'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { budgetFiscalYearStableId } from '~~/server/utils/agreement-budget-lineage'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import { sql } from 'kysely'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id'), amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const context = await authorizeAgreementResource(event, 'create', agreementId, db, {
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  const body = await readValidatedBodyI18n(event, FundingCaseAgreementBudgetLineItemCreateSchema)
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async (trx, currentContext) => {
    const amendment = await assertDraftAgreementAmendmentCapability(event, trx, agreementId, amendmentId, ['budget'])
    if (!('id' in amendment)) return amendment
    const versionId = await resolveDraftAgreementAmendmentBudgetVersion(event, trx, agreementId, amendmentId)
    if (typeof versionId !== 'string') return versionId
    const year = await trx.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year').select('id')
      .where(budgetFiscalYearStableId, '=', body.egcs_fc_fundingagreementbudgetfiscalyear).where('egcs_fc_budgetversion', '=', versionId).where('_deleted', '=', false).executeTakeFirst()
    if (!year) return await notFound(event, 'AGREEMENT_BUDGET_FISCAL_YEAR_NOT_FOUND', 'apiErrors.agreement.budget_fiscal_year_not_found')
    const category = await fetchAgreementBudgetCostCategory(trx, currentContext.streamId, body.egcs_fc_organizationcostcategory)
    if (!category) return await badRequest(event, 'INVALID_AGREEMENT_BUDGET_LINE_ITEM', 'apiErrors.agreement.invalid_cost_category_line_item')
    const proponentId = await resolveAgreementBudgetProponent(event, trx, { agreementId, proponentId: body.egcs_fc_applicantrecipient })
    await assertAgreementCurrency(event, trx, agreementId, body.egcs_fc_currency)
    const calculation = await prepareBudgetCalculation(event, trx, body, undefined, String(year.id))
    const settings = await loadAgreementBudgetManagement(trx, agreementId)
    const line = await prepareNewBudgetLine(event, settings, body, calculation.egcs_fc_programfunding ?? body.egcs_fc_programfunding!)
    const evaluateFunding = settings.egcs_tp_budgetfundingmode !== 'program_only'
    await assertCurrencyMoneyValues(event, body.egcs_fc_currency, [line.egcs_fc_totalamount, line.egcs_fc_programfunding])
    const inserted = await trx.insertInto('Funding_Case_Agreement_Budget_Line_Item').values({
      ...line,
      ...calculation,
      egcs_fc_applicantrecipient: proponentId,
      egcs_fc_totalamount: databaseMoneyValue(line.egcs_fc_totalamount),
      egcs_fc_programfunding: databaseMoneyValue(line.egcs_fc_programfunding),
      egcs_fc_pendingfunding: evaluateFunding,
      egcs_fc_fundingagreement: agreementId,
      egcs_fc_fundingagreementbudgetfiscalyear: String(year.id)
    }).returning([
      'egcs_fc_applicantrecipient',
      'egcs_fc_calculationmode', 'egcs_fc_sourcecategory', 'egcs_fc_percentage', 'egcs_fc_allowpercentageoverride',
      'id', 'egcs_fc_originalbudgetlineitem', 'egcs_fc_fundingagreementbudgetfiscalyear',
      'egcs_fc_organizationcostcategory', 'egcs_fc_costsubsection', 'egcs_fc_costsubsection_fr', 'egcs_fc_description', 'egcs_fc_description_fr',
      databaseMoneyText(sql.ref('egcs_fc_totalamount')).as('egcs_fc_totalamount'),
      databaseMoneyText(sql.ref('egcs_fc_programfunding')).as('egcs_fc_programfunding'),
      'egcs_fc_currency'
    ]).executeTakeFirstOrThrow()
    const { amounts, totals, pendingFunding } = await recalculateBudgetAfterLineWrite(event, trx, {
      lineId: inserted.id,
      streamId: currentContext.streamId,
      state: evaluateFunding ? 'pending' : 'active'
    })
    return {
      ...inserted,
      egcs_fc_percentage: inserted.egcs_fc_percentage === null ? null : parseSafeDecimal(String(inserted.egcs_fc_percentage)),
      ...await loadAgreementBudgetProponentName(trx, proponentId),
      egcs_fc_totalamount: totals.get(inserted.id) ?? parseDatabaseMoney(inserted.egcs_fc_totalamount, inserted.egcs_fc_currency),
      egcs_fc_programfunding: amounts.get(inserted.id) ?? parseDatabaseMoney(inserted.egcs_fc_programfunding, inserted.egcs_fc_currency),
      egcs_fc_fundingsources: [],
      egcs_fc_pendingfunding: pendingFunding,
      id: inserted.id,
      egcs_fc_fundingagreementbudgetfiscalyear: body.egcs_fc_fundingagreementbudgetfiscalyear
    }
  }, {
    action: 'create',
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
    businessStatusTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
})
