import { PaginationSchema } from '~~/shared/types/schemas'
import {
  CoreOrExtensionEntityTargetSchema,
  validateCoreOrExtensionEntityTarget
} from '~~/shared/types/schemas/common'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import {
  assertDirectReviewRuntimeEntitySupported,
  authorizeReviewRuntimeAction,
  getReviewRuntimeOwnerAgencyId,
  resolveReviewRuntimeEntityFromEntity,
  resolveReviewRuntimeSetupScopes,
  respondReviewRuntimeEntityNotFound
} from '~~/server/utils/review-runtime-access'
import { listEligibleRuntimeReviewSetSetupIds } from '~~/server/utils/review-runtime'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeExtensionLifecycleRead, resolveExtensionLifecycleRuntime } from '~~/server/utils/extension-lifecycle-runtime'
import { requireAuthContext } from '~~/server/utils/authorize'

const ReviewSetupLookupQuerySchema = PaginationSchema.safeExtend(CoreOrExtensionEntityTargetSchema.shape)
  .superRefine(validateCoreOrExtensionEntityTarget)

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const db = event.context.$db
  const { entityType, entityId, page, limit, search } = await getValidatedQueryI18n(event, ReviewSetupLookupQuerySchema)
  const unsupportedEntityResult = await assertDirectReviewRuntimeEntitySupported(event, entityType)

  if (unsupportedEntityResult) {
    return unsupportedEntityResult
  }

  const extensionRuntime = entityType.includes(':')
    ? await resolveExtensionLifecycleRuntime(event, entityType, entityId)
    : null
  const runtimeEntity = extensionRuntime?.context
    ?? await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  if (!runtimeEntity) {
    return await respondReviewRuntimeEntityNotFound(event, entityType)
  }

  // Setup lookup keeps its review-specific filtering rules; only auth and entity resolution are shared.
  if (extensionRuntime) await authorizeExtensionLifecycleRead(event, extensionRuntime)
  else await authorizeReviewRuntimeAction(event, 'lookup_review_setups', runtimeEntity)
  const ownerAgencyId = getReviewRuntimeOwnerAgencyId(runtimeEntity)
  if (!ownerAgencyId) {
    return { items: [], total: 0, stats: { total: 0 }, page, limit }
  }

  const setupScopes = await resolveReviewRuntimeSetupScopes(db, runtimeEntity)
  const eligibleSetupIds = await listEligibleRuntimeReviewSetSetupIds(db, entityType, ownerAgencyId, setupScopes)
  if (eligibleSetupIds.length === 0) {
    return { items: [], total: 0, stats: { total: 0 }, page, limit }
  }

  let query = db
    .selectFrom('Common_Review_Set_Setup')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Set_Setup.id')
    .innerJoin('Agency_Profile', join => join.on('Agency_Profile.id', '=', ownerAgencyId))
    .leftJoin('Transfer_Payment_Stream', join => join
      .onRef('Transfer_Payment_Stream.id', '=', 'Common_Review_Set_Setup.egcs_cn_scopeid')
      .on('Common_Review_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream'))
    .select([
      'Common_Review_Set_Setup.id as id',
      'Common_Review_Set_Setup.egcs_cn_name_en as egcs_cn_name_en',
      'Common_Review_Set_Setup.egcs_cn_name_fr as egcs_cn_name_fr',
      'Agency_Profile.egcs_ay_name_en as agency_name_en',
      'Agency_Profile.egcs_ay_name_fr as agency_name_fr',
      'Transfer_Payment_Stream.egcs_tp_name_en as stream_name_en',
      'Transfer_Payment_Stream.egcs_tp_name_fr as stream_name_fr',
      'Common_Review_Set_Setup.egcs_cn_scopetype as egcs_cn_scopetype'
    ])
    .where('Common_Review_Set_Setup.egcs_cn_entitytype', '=', entityType)
    .where('Common_Review_Set_Setup.id', 'in', eligibleSetupIds)
    .where('Common_Review_Set_Setup._deleted', '=', false)
    .where('Common_Publication.egcs_cn_state', '=', 'published')
    .where('Common_Publication._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    query = query.where(eb => eb.or([
      eb('Common_Review_Set_Setup.egcs_cn_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Common_Review_Set_Setup.egcs_cn_name_fr', 'ilike', `%${escapedSearch}%`),
      eb('Agency_Profile.egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Agency_Profile.egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`),
      eb('Transfer_Payment_Stream.egcs_tp_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Transfer_Payment_Stream.egcs_tp_name_fr', 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [setupRows, countResult] = await Promise.all([
    query.orderBy('Common_Review_Set_Setup.egcs_cn_name_en', 'asc')
      .orderBy('Common_Review_Set_Setup.id', 'asc')
      .limit(limit).offset((page - 1) * limit).execute(),
    query.clearSelect().select(eb => eb.fn.count('Common_Review_Set_Setup.id').as('total')).executeTakeFirst()
  ])

  const items = Array.from(setupRows.reduce((acc, row) => {
    const id = String(row.id)

    if (acc.has(id)) {
      return acc
    }

    const descriptionEnParts = [row.agency_name_en]
    const descriptionFrParts = [row.agency_name_fr]

    if (row.egcs_cn_scopetype === 'transferpaymentstream') {
      if (row.stream_name_en) {
        descriptionEnParts.push(row.stream_name_en)
      }

      if (row.stream_name_fr) {
        descriptionFrParts.push(row.stream_name_fr)
      }
    }

    acc.set(id, {
      id,
      egcs_cn_name_en: row.egcs_cn_name_en,
      egcs_cn_name_fr: row.egcs_cn_name_fr,
      description_en: descriptionEnParts.filter(Boolean).join(' | '),
      description_fr: descriptionFrParts.filter(Boolean).join(' | ')
    })

    return acc
  }, new Map<string, {
    id: string
    egcs_cn_name_en: string
    egcs_cn_name_fr: string
    description_en: string
    description_fr: string
  }>()).values())

  const total = Number(countResult?.total ?? 0)
  return { items, total, stats: { total }, page, limit }
})
