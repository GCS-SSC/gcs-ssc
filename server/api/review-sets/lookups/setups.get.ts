import { PaginationSchema } from '~~/shared/types/schemas'
import { CoreOrExtensionEntityTargetSchema, validateCoreOrExtensionEntityTarget } from '~~/shared/types/schemas/common'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import {
  assertDirectReviewRuntimeEntitySupported, authorizeReviewRuntimeAction,
  getReviewRuntimeOwnerAgencyId, resolveReviewRuntimeEntityFromEntity,
  resolveReviewRuntimeSetupScopes, respondReviewRuntimeEntityNotFound
} from '~~/server/utils/review-runtime-access'
import { listEligibleRuntimeReviewSetSetupAgencyIds } from '~~/server/utils/review-runtime'
import { authorizeExtensionLifecycleRead, resolveExtensionLifecycleRuntime } from '~~/server/utils/extension-lifecycle-runtime'
import { requireAuthContext } from '~~/server/utils/authorize'
import { resolveApplicantRecipientVisibility } from '~~/server/utils/applicant-recipient-auth'

const ReviewSetupLookupQuerySchema = PaginationSchema.safeExtend(CoreOrExtensionEntityTargetSchema.shape)
  .superRefine(validateCoreOrExtensionEntityTarget)

export default defineEventHandler(async event => {
  const auth = await requireAuthContext(event)
  const db = event.context.$db
  const { entityType, entityId, page, limit, search } = await getValidatedQueryI18n(event, ReviewSetupLookupQuerySchema)
  const unsupported = await assertDirectReviewRuntimeEntitySupported(event, entityType)
  if (unsupported) return unsupported
  const extensionRuntime = entityType.includes(':')
    ? await resolveExtensionLifecycleRuntime(event, entityType, entityId)
    : null
  const runtimeEntity = extensionRuntime?.context
    ?? await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  if (!runtimeEntity) return await respondReviewRuntimeEntityNotFound(event, entityType)
  if (extensionRuntime) await authorizeExtensionLifecycleRead(event, extensionRuntime)
  else await authorizeReviewRuntimeAction(event, 'lookup_review_setups', runtimeEntity)

  let agencyIds: string[]
  if (entityType === 'applicantrecipient') {
    const visibility = await resolveApplicantRecipientVisibility(auth, 'update', db)
    if (visibility.hasGlobalAccess) {
      agencyIds = (await db.selectFrom('Agency_Profile').select('id')
        .where('_deleted', '=', false).where('egcs_ay_active', '=', true).execute()).map(row => String(row.id))
    } else agencyIds = visibility.agencyIds
  } else {
    const ownerAgencyId = getReviewRuntimeOwnerAgencyId(runtimeEntity)
    agencyIds = ownerAgencyId ? [ownerAgencyId] : []
  }
  if (agencyIds.length === 0) return { items: [], total: 0, stats: { total: 0 }, page, limit }

  const setupScopes = await resolveReviewRuntimeSetupScopes(db, runtimeEntity)
  const agencyBySetup = await listEligibleRuntimeReviewSetSetupAgencyIds(db, entityType, agencyIds, setupScopes)
  const eligibleSetupIds = [...agencyBySetup.keys()]
  if (eligibleSetupIds.length === 0) return { items: [], total: 0, stats: { total: 0 }, page, limit }

  const [setups, agencies] = await Promise.all([
    db.selectFrom('Common_Review_Set_Setup')
      .leftJoin('Transfer_Payment_Stream', join => join
        .onRef('Transfer_Payment_Stream.id', '=', 'Common_Review_Set_Setup.egcs_cn_scopeid')
        .on('Common_Review_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream'))
      .select([
        'Common_Review_Set_Setup.id', 'Common_Review_Set_Setup.egcs_cn_name_en',
        'Common_Review_Set_Setup.egcs_cn_name_fr', 'Common_Review_Set_Setup.egcs_cn_scopetype',
        'Transfer_Payment_Stream.egcs_tp_name_en as stream_name_en',
        'Transfer_Payment_Stream.egcs_tp_name_fr as stream_name_fr'
      ])
      .where('Common_Review_Set_Setup.id', 'in', eligibleSetupIds)
      .where('Common_Review_Set_Setup._deleted', '=', false)
      .orderBy('Common_Review_Set_Setup.egcs_cn_name_en').orderBy('Common_Review_Set_Setup.id').execute(),
    db.selectFrom('Agency_Profile').select(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr'])
      .where('id', 'in', agencyIds).where('_deleted', '=', false).execute()
  ])
  const agencyNames = new Map(agencies.map(row => [String(row.id), row]))
  const term = search?.trim().toLocaleLowerCase()
  const items = setups.flatMap(row => {
    const agencyId = agencyBySetup.get(String(row.id))
    const agency = agencyId ? agencyNames.get(agencyId) : null
    if (!agency) return []
    const descriptionEn = [agency.egcs_ay_name_en, row.egcs_cn_scopetype === 'transferpaymentstream' ? row.stream_name_en : null].filter(Boolean).join(' | ')
    const descriptionFr = [agency.egcs_ay_name_fr, row.egcs_cn_scopetype === 'transferpaymentstream' ? row.stream_name_fr : null].filter(Boolean).join(' | ')
    if (term && ![row.egcs_cn_name_en, row.egcs_cn_name_fr, descriptionEn, descriptionFr]
      .some(value => value?.toLocaleLowerCase().includes(term))) return []
    return [{ id: String(row.id), egcs_cn_name_en: row.egcs_cn_name_en,
      egcs_cn_name_fr: row.egcs_cn_name_fr, description_en: descriptionEn, description_fr: descriptionFr }]
  })
  return { items: items.slice((page - 1) * limit, page * limit), total: items.length,
    stats: { total: items.length }, page, limit }
})
