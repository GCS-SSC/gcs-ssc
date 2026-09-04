import type { Insertable } from 'kysely'
import { badRequest } from '~~/server/utils/api-errors'
import { FundingCaseAgreementAddressCreateSchema } from '~~/shared/types/schemas'
import type { CommonAddressTable, FundingCaseAgreementAddressTable } from '~~/shared/types/database'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementExists } from '~~/server/utils/agreement-child-resources'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const agreementContext = await authorizeAgreementResource(event, 'create', agreementId, db)
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  const agreement = await assertAgreementExists(event, agreementId, db)
  if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
    return agreement
  }

  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementAddressCreateSchema)

  const addressValues: Insertable<CommonAddressTable> = {
    egcs_cn_federalridingid: validated.egcs_cn_federalridingid,
    egcs_cn_addresscity: validated.egcs_cn_addresscity,
    egcs_cn_addresscountry: validated.egcs_cn_addresscountry,
    egcs_cn_addresssubdivision: validated.egcs_cn_addresssubdivision,
    egcs_cn_gc_addressid: validated.egcs_cn_gc_addressid,
    egcs_cn_latitude: validated.egcs_cn_latitude,
    egcs_cn_longitude: validated.egcs_cn_longitude,
    egcs_cn_mainphone: validated.egcs_cn_mainphone,
    egcs_cn_mainphoneextension: validated.egcs_cn_mainphoneextension,
    egcs_cn_postalcodezipcode: validated.egcs_cn_postalcodezipcode,
    egcs_cn_street1: validated.egcs_cn_street1,
    egcs_cn_street2: validated.egcs_cn_street2,
    egcs_cn_street3: validated.egcs_cn_street3
  }

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, currentContext) => {
    const addressType = await trx
      .selectFrom('Agency_Address_Type')
      .where('id', '=', validated.egcs_fc_addresstype)
      .where('egcs_ay_organizationagency', '=', currentContext.agencyId)
      .where('_deleted', '=', false)
      .select([
        'id',
        'egcs_ay_typename_en as address_type_name_en',
        'egcs_ay_typename_fr as address_type_name_fr'
      ])
      .executeTakeFirst()
    if (!addressType) {
      return await badRequest(event, 'INVALID_AGREEMENT_ADDRESS_TYPE', 'apiErrors.agreement.invalid_address_type')
    }

    const address = await trx
      .insertInto('Common_Address')
      .values(addressValues)
      .returning('id')
      .executeTakeFirstOrThrow()

    const linkValues: Insertable<FundingCaseAgreementAddressTable> = {
      egcs_fc_fundingagreement: agreementId,
      egcs_fc_addresstype: validated.egcs_fc_addresstype,
      egcs_fc_address: address.id
    }

    const link = await trx
      .insertInto('Funding_Case_Agreement_Address')
      .values(linkValues)
      .returning(['id', 'egcs_fc_fundingagreement', 'egcs_fc_addresstype', 'egcs_fc_address'])
      .executeTakeFirstOrThrow()
    return {
      ...link,
      address_type_name_en: addressType.address_type_name_en,
      address_type_name_fr: addressType.address_type_name_fr,
      ...validated
    }
  }, { action: 'create' })
})
