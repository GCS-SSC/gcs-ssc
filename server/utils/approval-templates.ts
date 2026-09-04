/* eslint-disable jsdoc/require-jsdoc */
import { sql, type Kysely, type Selectable, type Transaction } from 'kysely'
import { readPublicationMetadataBatch } from './system-publication'
import type { Database } from '~~/shared/types/database'
import type {
  ApprovalTemplate,
  ApprovalTemplateCreateInput,
  ApprovalTemplatePatch,
  ApprovalTemplateItem,
  ApprovalTemplateScopeType
} from '~~/shared/types/schemas'

type DbClient = Kysely<Database> | Transaction<Database>

type ApprovalTemplateRow = Selectable<Database['Common_Approval_Template']>

export type CanonicalApprovalTemplateItem = ApprovalTemplateItem

type ApprovalStepRow = {
  id: string | number
  egcs_cn_approvaltemplate: string | number
  egcs_cn_sequence: number
  egcs_cn_description_en: string
  egcs_cn_description_fr: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_defaultuser: string | number
  egcs_cn_approvertitle: string
}

type CertificationRow = {
  id: string | number
  egcs_cn_approvalstep: string | number
  egcs_cn_order: number
  egcs_cn_description_en: string
  egcs_cn_description_fr: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_optional?: boolean | null
  egcs_cn_certification_en: string
  egcs_cn_certification_fr: string
}

type ApprovalTemplateCertificationInput = {
  id?: string
  _deleted?: boolean
  egcs_cn_order?: number
  egcs_cn_description_en?: string
  egcs_cn_description_fr?: string
  egcs_cn_name_en?: string
  egcs_cn_name_fr?: string
  egcs_cn_optional?: boolean
  egcs_cn_certification_en?: string
  egcs_cn_certification_fr?: string
}

type AdditionalApprovalCertificationInput = {
  id?: string
  _deleted?: boolean
  egcs_cn_order?: number
  egcs_cn_description_en?: string
  egcs_cn_description_fr?: string
  egcs_cn_name_en?: string
  egcs_cn_name_fr?: string
  egcs_cn_optional?: boolean
  egcs_cn_certification_en?: string
  egcs_cn_certification_fr?: string
}

type ApprovalTemplateStepInput = {
  id?: string
  _deleted?: boolean
  egcs_cn_sequence?: number
  egcs_cn_description_en?: string
  egcs_cn_description_fr?: string
  egcs_cn_name_en?: string
  egcs_cn_name_fr?: string
  egcs_cn_defaultuser?: string
  egcs_cn_approvertitle?: string
  certifications?: ApprovalTemplateCertificationInput[]
}

type ApprovalTemplateScopeRecord = {
  id: string
  scopeType: ApprovalTemplateScopeType
  scopeId: string
}

type ApprovalTemplateMergedPatch = Omit<ApprovalTemplate, 'steps' | 'additionalApprovalCertifications'> & {
  steps: ApprovalTemplateStepInput[]
  additionalApprovalCertifications: AdditionalApprovalCertificationInput[]
}

const sortTemplates = (left: ApprovalTemplateRow, right: ApprovalTemplateRow) => {
  const leftId = BigInt(left.id)
  const rightId = BigInt(right.id)
  return leftId < rightId ? -1 : Number(leftId > rightId)
}

export const listApprovalTemplates = async (
  db: DbClient,
  scopeType: ApprovalTemplateScopeType,
  scopeId: string
): Promise<CanonicalApprovalTemplateItem[]> => {
  const templates = await db
    .selectFrom('Common_Approval_Template')
    .selectAll()
    .where('egcs_cn_scopetype', '=', scopeType)
    .where('egcs_cn_scopeid', '=', scopeId)
    .where('_deleted', '=', false)
    .execute()

  const templateIds = templates.map(item => String(item.id))
  const steps = templateIds.length > 0
    ? await db
        .selectFrom('Common_Approval_Step')
        .selectAll()
        .where('egcs_cn_approvaltemplate', 'in', templateIds)
        .where('_deleted', '=', false)
        .orderBy('egcs_cn_sequence', 'asc')
        .orderBy('id', 'asc')
        .execute()
    : []

  const stepIds = steps.map(item => String(item.id))
  const certifications = stepIds.length > 0
    ? await db
        .selectFrom('Common_Certification')
        .select([
          'id',
          'egcs_cn_order',
          'egcs_cn_description_en',
          'egcs_cn_description_fr',
          'egcs_cn_name_en',
          'egcs_cn_name_fr',
          'egcs_cn_optional',
          'egcs_cn_certification_en',
          'egcs_cn_certification_fr',
          sql<string>`egcs_cn_approvalstep`.as('egcs_cn_approvalstep')
        ])
        .where('egcs_cn_approvalstep', 'in', stepIds)
        .where('_deleted', '=', false)
        .orderBy('egcs_cn_order', 'asc')
        .orderBy('id', 'asc')
        .execute()
    : []

  const additionalCertifications = templateIds.length > 0
    ? await db
        .selectFrom('Common_Certification')
        .selectAll()
        .where('egcs_cn_approvaltemplate', 'in', templateIds)
        .where('_deleted', '=', false)
        .orderBy('egcs_cn_order', 'asc')
        .orderBy('id', 'asc')
        .execute()
    : []

  const additionalCertificationsByTemplateId = new Map<string, typeof additionalCertifications>()
  for (const certification of additionalCertifications) {
    const templateId = String(certification.egcs_cn_approvaltemplate)
    const rows = additionalCertificationsByTemplateId.get(templateId)
    if (rows) {
      rows.push(certification)
    } else {
      additionalCertificationsByTemplateId.set(templateId, [certification])
    }
  }

  const certificationsByStepId = new Map<string, CertificationRow[]>()
  for (const certification of certifications) {
    const stepId = String(certification.egcs_cn_approvalstep)
    const rows = certificationsByStepId.get(stepId)
    if (rows) {
      rows.push(certification)
      continue
    }

    certificationsByStepId.set(stepId, [certification])
  }

  const stepsByTemplateId = new Map<string, ApprovalStepRow[]>()
  for (const step of steps) {
    const templateId = String(step.egcs_cn_approvaltemplate)
    const rows = stepsByTemplateId.get(templateId)
    if (rows) {
      rows.push(step)
      continue
    }

    stepsByTemplateId.set(templateId, [step])
  }

  const items = templates
    .slice()
    .sort(sortTemplates)
    .map(template => ({
      id: String(template.id),
      egcs_cn_description_en: template.egcs_cn_description_en,
      egcs_cn_description_fr: template.egcs_cn_description_fr,
      egcs_cn_name_en: template.egcs_cn_name_en,
      egcs_cn_name_fr: template.egcs_cn_name_fr,
      egcs_cn_allowadditionalapprovals: template.egcs_cn_allowadditionalapprovals,
      egcs_cn_defaultaddedapprovalname_en: template.egcs_cn_defaultaddedapprovalname_en ?? undefined,
      egcs_cn_defaultaddedapprovalname_fr: template.egcs_cn_defaultaddedapprovalname_fr ?? undefined,
      egcs_cn_allowaddedapprovalnamechanges: template.egcs_cn_allowaddedapprovalnamechanges,
      egcs_cn_allowaddedapprovalcertificationchanges: template.egcs_cn_allowaddedapprovalcertificationchanges,
      additionalApprovalCertifications: (additionalCertificationsByTemplateId.get(String(template.id)) ?? []).map(certification => ({
        id: String(certification.id),
        egcs_cn_order: certification.egcs_cn_order,
        egcs_cn_description_en: certification.egcs_cn_description_en,
        egcs_cn_description_fr: certification.egcs_cn_description_fr,
        egcs_cn_name_en: certification.egcs_cn_name_en,
        egcs_cn_name_fr: certification.egcs_cn_name_fr,
        egcs_cn_optional: certification.egcs_cn_optional === true,
        egcs_cn_certification_en: certification.egcs_cn_certification_en,
        egcs_cn_certification_fr: certification.egcs_cn_certification_fr
      })),
      steps: (stepsByTemplateId.get(String(template.id)) ?? []).map(step => ({
        id: String(step.id),
        egcs_cn_sequence: step.egcs_cn_sequence,
        egcs_cn_description_en: step.egcs_cn_description_en,
        egcs_cn_description_fr: step.egcs_cn_description_fr,
        egcs_cn_name_en: step.egcs_cn_name_en,
        egcs_cn_name_fr: step.egcs_cn_name_fr,
        egcs_cn_defaultuser: String(step.egcs_cn_defaultuser),
        egcs_cn_approvertitle: step.egcs_cn_approvertitle,
        certifications: (certificationsByStepId.get(String(step.id)) ?? []).map(certification => ({
          id: String(certification.id),
          egcs_cn_order: certification.egcs_cn_order,
          egcs_cn_description_en: certification.egcs_cn_description_en,
          egcs_cn_description_fr: certification.egcs_cn_description_fr,
          egcs_cn_name_en: certification.egcs_cn_name_en,
          egcs_cn_name_fr: certification.egcs_cn_name_fr,
          egcs_cn_optional: certification.egcs_cn_optional ?? undefined,
          egcs_cn_certification_en: certification.egcs_cn_certification_en,
          egcs_cn_certification_fr: certification.egcs_cn_certification_fr
        }))
      }))
    }))
  const metadata = await readPublicationMetadataBatch(db, items.map(item => ({
    publicationId: item.id,
    workingDefinition: {
      templateId: item.id,
      nameEn: item.egcs_cn_name_en,
      nameFr: item.egcs_cn_name_fr,
      descriptionEn: item.egcs_cn_description_en,
      descriptionFr: item.egcs_cn_description_fr,
      allowAdditionalApprovals: item.egcs_cn_allowadditionalapprovals,
      ...(item.egcs_cn_defaultaddedapprovalname_en
        ? { defaultAddedApprovalNameEn: item.egcs_cn_defaultaddedapprovalname_en }
        : {}),
      ...(item.egcs_cn_defaultaddedapprovalname_fr
        ? { defaultAddedApprovalNameFr: item.egcs_cn_defaultaddedapprovalname_fr }
        : {}),
      allowAddedApprovalNameChanges: item.egcs_cn_allowaddedapprovalnamechanges,
      allowAddedApprovalCertificationChanges: item.egcs_cn_allowaddedapprovalcertificationchanges,
      additionalCertifications: item.additionalApprovalCertifications.map(certification => ({
        order: certification.egcs_cn_order,
        descriptionEn: certification.egcs_cn_description_en,
        descriptionFr: certification.egcs_cn_description_fr,
        nameEn: certification.egcs_cn_name_en,
        nameFr: certification.egcs_cn_name_fr,
        optional: certification.egcs_cn_optional === true,
        certificationEn: certification.egcs_cn_certification_en,
        certificationFr: certification.egcs_cn_certification_fr
      })),
      steps: item.steps.map(step => ({
        stepId: step.id,
        sequence: Number(step.egcs_cn_sequence),
        nameEn: step.egcs_cn_name_en,
        nameFr: step.egcs_cn_name_fr,
        defaultUser: step.egcs_cn_defaultuser,
        certifications: step.certifications.map(certification => ({
          optional: certification.egcs_cn_optional === true,
          certificationEn: certification.egcs_cn_certification_en,
          certificationFr: certification.egcs_cn_certification_fr
        }))
      }))
    }
  })))
  return items.map(item => ({ ...item, ...metadata.get(item.id)! }))
}

export const getApprovalTemplateScopeRecord = async (
  db: DbClient,
  templateId: string
): Promise<ApprovalTemplateScopeRecord | null> => {
  const template = await db
    .selectFrom('Common_Approval_Template')
    .select([
      'id',
      'egcs_cn_scopetype as scopeType',
      'egcs_cn_scopeid as scopeId'
    ])
    .where('id', '=', templateId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (!template) {
    return null
  }

  return {
    id: String(template.id),
    scopeType: template.scopeType as ApprovalTemplateScopeType,
    scopeId: String(template.scopeId)
  }
}

export const getApprovalTemplate = async (
  db: DbClient,
  templateId: string
): Promise<CanonicalApprovalTemplateItem | null> => {
  const scopeRecord = await getApprovalTemplateScopeRecord(db, templateId)
  if (!scopeRecord) {
    return null
  }

  const templates = await listApprovalTemplates(db, scopeRecord.scopeType, scopeRecord.scopeId)
  return templates.find(item => String(item.id) === templateId) ?? null
}

/**
 * Merges patch-shaped nested children with their current parent-owned records.
 * Returns null when any supplied child identifier belongs outside the aggregate.
 *
 * @param existing - Current aggregate loaded under the template scope lock.
 * @param patch - Validated patch-shaped template input.
 * @returns Parent-merged persistence input, or null for an ownership mismatch.
 */
export const mergeApprovalTemplatePatch = (
  existing: ApprovalTemplateItem,
  patch: ApprovalTemplatePatch
): ApprovalTemplateMergedPatch | null => {
  const existingSteps = new Map((existing.steps ?? []).map(step => [String(step.id), step]))
  const existingAdditionalCertifications = new Map(
    (existing.additionalApprovalCertifications ?? []).map(certification => [String(certification.id), certification])
  )
  let invalidOwnership = false
  const steps = patch.steps === undefined
    ? existing.steps ?? []
    : patch.steps.map(step => {
        const existingStep = step.id === undefined ? undefined : existingSteps.get(String(step.id))
        if (step.id !== undefined && existingStep === undefined) {
          invalidOwnership = true
        }

        if (existingStep === undefined) {
          if (step.certifications?.some(certification => certification.id !== undefined)) {
            invalidOwnership = true
          }
          return step
        }

        const existingCertifications = new Map(
          existingStep.certifications.map(certification => [String(certification.id), certification])
        )
        const certifications = step.certifications === undefined
          ? existingStep.certifications
          : step.certifications.map(certification => {
              const existingCertification = certification.id === undefined
                ? undefined
                : existingCertifications.get(String(certification.id))
              if (certification.id !== undefined && existingCertification === undefined) {
                invalidOwnership = true
              }

              return existingCertification === undefined
                ? certification
                : { ...existingCertification, ...certification }
            })

        return {
          ...existingStep,
          ...step,
          certifications
        }
      })
  const additionalApprovalCertifications = patch.additionalApprovalCertifications === undefined
    ? existing.additionalApprovalCertifications ?? []
    : patch.additionalApprovalCertifications.map(certification => {
        const existingCertification = certification.id === undefined
          ? undefined
          : existingAdditionalCertifications.get(String(certification.id))
        if (certification.id !== undefined && existingCertification === undefined) {
          invalidOwnership = true
        }

        return existingCertification === undefined
          ? certification
          : { ...existingCertification, ...certification }
      })

  if (invalidOwnership) {
    return null
  }

  return {
    egcs_cn_description_en: patch.egcs_cn_description_en ?? existing.egcs_cn_description_en,
    egcs_cn_description_fr: patch.egcs_cn_description_fr ?? existing.egcs_cn_description_fr,
    egcs_cn_name_en: patch.egcs_cn_name_en ?? existing.egcs_cn_name_en,
    egcs_cn_name_fr: patch.egcs_cn_name_fr ?? existing.egcs_cn_name_fr,
    egcs_cn_allowadditionalapprovals: patch.egcs_cn_allowadditionalapprovals ?? existing.egcs_cn_allowadditionalapprovals,
    egcs_cn_defaultaddedapprovalname_en: patch.egcs_cn_defaultaddedapprovalname_en ?? existing.egcs_cn_defaultaddedapprovalname_en,
    egcs_cn_defaultaddedapprovalname_fr: patch.egcs_cn_defaultaddedapprovalname_fr ?? existing.egcs_cn_defaultaddedapprovalname_fr,
    egcs_cn_allowaddedapprovalnamechanges: patch.egcs_cn_allowaddedapprovalnamechanges ?? existing.egcs_cn_allowaddedapprovalnamechanges,
    egcs_cn_allowaddedapprovalcertificationchanges: patch.egcs_cn_allowaddedapprovalcertificationchanges
      ?? existing.egcs_cn_allowaddedapprovalcertificationchanges,
    additionalApprovalCertifications,
    steps
  }
}

const softDeleteCertifications = async (
  db: DbClient,
  stepId: string,
  certificationIds: string[]
) => {
  if (certificationIds.length === 0) {
    return
  }

  await db
    .updateTable('Common_Certification')
    .set({ _deleted: true })
    .where('id', 'in', certificationIds)
    .where('egcs_cn_approvalstep', '=', stepId)
    .where('_deleted', '=', false)
    .execute()
}

const getCertificationWriteValues = (certification: ApprovalTemplateCertificationInput) => ({
  egcs_cn_order: certification.egcs_cn_order ?? 0,
  egcs_cn_description_en: certification.egcs_cn_description_en ?? '',
  egcs_cn_description_fr: certification.egcs_cn_description_fr ?? '',
  egcs_cn_name_en: certification.egcs_cn_name_en ?? '',
  egcs_cn_name_fr: certification.egcs_cn_name_fr ?? '',
  egcs_cn_optional: certification.egcs_cn_optional,
  egcs_cn_certification_en: certification.egcs_cn_certification_en ?? '',
  egcs_cn_certification_fr: certification.egcs_cn_certification_fr ?? '',
  _deleted: false
})

const updateCertification = async (
  db: DbClient,
  stepId: string,
  certification: ApprovalTemplateCertificationInput
) => {
  if (!certification.id) {
    return
  }

  const values = {
    ...(certification.egcs_cn_order === undefined ? {} : { egcs_cn_order: certification.egcs_cn_order }),
    ...(certification.egcs_cn_description_en === undefined ? {} : { egcs_cn_description_en: certification.egcs_cn_description_en }),
    ...(certification.egcs_cn_description_fr === undefined ? {} : { egcs_cn_description_fr: certification.egcs_cn_description_fr }),
    ...(certification.egcs_cn_name_en === undefined ? {} : { egcs_cn_name_en: certification.egcs_cn_name_en }),
    ...(certification.egcs_cn_name_fr === undefined ? {} : { egcs_cn_name_fr: certification.egcs_cn_name_fr }),
    ...(certification.egcs_cn_optional === undefined ? {} : { egcs_cn_optional: certification.egcs_cn_optional }),
    ...(certification.egcs_cn_certification_en === undefined ? {} : { egcs_cn_certification_en: certification.egcs_cn_certification_en }),
    ...(certification.egcs_cn_certification_fr === undefined ? {} : { egcs_cn_certification_fr: certification.egcs_cn_certification_fr })
  }

  if (Object.keys(values).length === 0) {
    return
  }

  await db
    .updateTable('Common_Certification')
    .set(values)
    .where('id', '=', String(certification.id))
    .where('egcs_cn_approvalstep', '=', stepId)
    .where('_deleted', '=', false)
    .execute()
}

const createCertification = async (
  db: DbClient,
  stepId: string,
  certification: ApprovalTemplateCertificationInput
) => {
  const created = await db
    .insertInto('Common_Certification')
    .values({
      ...getCertificationWriteValues(certification),
      egcs_cn_approvalstep: stepId
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  return String(created.id)
}

const syncCertification = async (
  db: DbClient,
  stepId: string,
  certification: ApprovalTemplateCertificationInput,
  existingIds: Set<string>
) => {
  if (certification.id && !existingIds.has(String(certification.id))) {
    throw new Error('Approval template certification is outside its parent step.')
  }

  if ('_deleted' in certification && certification._deleted === true && certification.id) {
    await softDeleteCertifications(db, stepId, [String(certification.id)])
    return null
  }

  if (certification.id) {
    await updateCertification(db, stepId, certification)
    return String(certification.id)
  }

  return await createCertification(db, stepId, certification)
}

const syncCertifications = async (
  db: DbClient,
  stepId: string,
  certifications?: ApprovalTemplateCertificationInput[]
) => {
  if (!certifications) {
    return
  }

  const existing = await db
    .selectFrom('Common_Certification')
    .select(['id'])
    .where('egcs_cn_approvalstep', '=', stepId)
    .where('_deleted', '=', false)
    .execute()

  const existingIds = new Set(existing.map(item => String(item.id)))
  const retainedIds = new Set<string>()

  for (const certification of certifications) {
    const retainedId = await syncCertification(db, stepId, certification, existingIds)
    if (retainedId) {
      retainedIds.add(retainedId)
    }
  }

  const removedIds = existing
    .map(item => String(item.id))
    .filter(id => !retainedIds.has(id))

  await softDeleteCertifications(db, stepId, removedIds)
}

const softDeleteSteps = async (
  db: DbClient,
  templateId: string,
  stepIds: string[]
) => {
  if (stepIds.length === 0) {
    return
  }

  await db
    .updateTable('Common_Certification')
    .set({ _deleted: true })
    .where('egcs_cn_approvalstep', 'in', stepIds)
    .where('_deleted', '=', false)
    .execute()

  await db
    .updateTable('Common_Approval_Step')
    .set({ _deleted: true })
    .where('id', 'in', stepIds)
    .where('egcs_cn_approvaltemplate', '=', templateId)
    .where('_deleted', '=', false)
    .execute()
}

const syncAdditionalApprovalCertifications = async (
  db: DbClient,
  templateId: string,
  certifications: AdditionalApprovalCertificationInput[] | undefined
) => {
  if (certifications === undefined) return

  const existing = await db
    .selectFrom('Common_Certification')
    .select(['id', 'egcs_cn_order'])
    .where('egcs_cn_approvaltemplate', '=', templateId)
    .where('_deleted', '=', false)
    .execute()
  const existingIds = new Set(existing.map(item => String(item.id)))
  const existingOrderById = new Map(existing.map(item => [String(item.id), item.egcs_cn_order]))
  const retainedIds = new Set<string>()

  if (existingIds.size > 0) {
    await db
      .updateTable('Common_Certification')
      .set({ egcs_cn_order: sql<number>`-egcs_cn_order` })
      .where('egcs_cn_approvaltemplate', '=', templateId)
      .where('_deleted', '=', false)
      .execute()
  }

  for (const certification of certifications) {
    if (certification.id && !existingIds.has(String(certification.id))) {
      throw new Error('Additional approval certification is outside its parent template.')
    }

    if (certification.id && certification._deleted === true) {
      await db
        .updateTable('Common_Certification')
        .set({ _deleted: true })
        .where('id', '=', certification.id)
        .where('egcs_cn_approvaltemplate', '=', templateId)
        .execute()
      continue
    }

    if (certification.id) {
      await db
        .updateTable('Common_Certification')
        .set({
          egcs_cn_order: certification.egcs_cn_order ?? existingOrderById.get(String(certification.id)) ?? 0,
          ...(certification.egcs_cn_description_en === undefined ? {} : { egcs_cn_description_en: certification.egcs_cn_description_en }),
          ...(certification.egcs_cn_description_fr === undefined ? {} : { egcs_cn_description_fr: certification.egcs_cn_description_fr }),
          ...(certification.egcs_cn_name_en === undefined ? {} : { egcs_cn_name_en: certification.egcs_cn_name_en }),
          ...(certification.egcs_cn_name_fr === undefined ? {} : { egcs_cn_name_fr: certification.egcs_cn_name_fr }),
          ...(certification.egcs_cn_optional === undefined ? {} : { egcs_cn_optional: certification.egcs_cn_optional }),
          ...(certification.egcs_cn_certification_en === undefined ? {} : { egcs_cn_certification_en: certification.egcs_cn_certification_en }),
          ...(certification.egcs_cn_certification_fr === undefined ? {} : { egcs_cn_certification_fr: certification.egcs_cn_certification_fr })
        })
        .where('id', '=', certification.id)
        .where('egcs_cn_approvaltemplate', '=', templateId)
        .where('_deleted', '=', false)
        .execute()
      retainedIds.add(certification.id)
      continue
    }

    const created = await db
      .insertInto('Common_Certification')
      .values({
        egcs_cn_order: certification.egcs_cn_order ?? 0,
        egcs_cn_description_en: certification.egcs_cn_description_en ?? '',
        egcs_cn_description_fr: certification.egcs_cn_description_fr ?? '',
        egcs_cn_name_en: certification.egcs_cn_name_en ?? '',
        egcs_cn_name_fr: certification.egcs_cn_name_fr ?? '',
        egcs_cn_optional: certification.egcs_cn_optional ?? false,
        egcs_cn_certification_en: certification.egcs_cn_certification_en ?? '',
        egcs_cn_certification_fr: certification.egcs_cn_certification_fr ?? '',
        egcs_cn_approvaltemplate: templateId,
        _deleted: false
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    retainedIds.add(String(created.id))
  }

  const removedIds = existing
    .map(item => String(item.id))
    .filter(id => !retainedIds.has(id))
  if (removedIds.length > 0) {
    await db
      .updateTable('Common_Certification')
      .set({ _deleted: true })
      .where('id', 'in', removedIds)
      .where('egcs_cn_approvaltemplate', '=', templateId)
      .execute()
  }
}

const getApprovalTemplateWriteValues = (
  input: {
    scopeType: ApprovalTemplateScopeType
    scopeId: string
    payload: ApprovalTemplate | ApprovalTemplatePatch | ApprovalTemplateCreateInput
  }
) => ({
  egcs_cn_scopetype: input.scopeType,
  egcs_cn_scopeid: input.scopeId,
  egcs_cn_description_en: input.payload.egcs_cn_description_en ?? '',
  egcs_cn_description_fr: input.payload.egcs_cn_description_fr ?? '',
  egcs_cn_name_en: input.payload.egcs_cn_name_en ?? '',
  egcs_cn_name_fr: input.payload.egcs_cn_name_fr ?? '',
  egcs_cn_allowadditionalapprovals: input.payload.egcs_cn_allowadditionalapprovals ?? false,
  egcs_cn_defaultaddedapprovalname_en: input.payload.egcs_cn_defaultaddedapprovalname_en,
  egcs_cn_defaultaddedapprovalname_fr: input.payload.egcs_cn_defaultaddedapprovalname_fr,
  egcs_cn_allowaddedapprovalnamechanges: input.payload.egcs_cn_allowaddedapprovalnamechanges ?? false,
  egcs_cn_allowaddedapprovalcertificationchanges: input.payload.egcs_cn_allowaddedapprovalcertificationchanges ?? false,
  _deleted: false
})

const saveApprovalTemplate = async (
  db: DbClient,
  input: {
    scopeType: ApprovalTemplateScopeType
    scopeId: string
    payload: ApprovalTemplate | ApprovalTemplatePatch | ApprovalTemplateCreateInput
    templateId?: string
  }
) => {
  const values = getApprovalTemplateWriteValues(input)

  return input.templateId
    ? await db
        .updateTable('Common_Approval_Template')
        .set(values)
        .where('id', '=', input.templateId)
        .where('egcs_cn_scopetype', '=', input.scopeType)
        .where('egcs_cn_scopeid', '=', input.scopeId)
        .returningAll()
        .executeTakeFirstOrThrow()
    : await db
        .insertInto('Common_Approval_Template')
        .values(values)
        .returningAll()
        .executeTakeFirstOrThrow()
}

const getApprovalStepWriteValues = (
  step: ApprovalTemplateStepInput,
  templateId: string
) => ({
  egcs_cn_sequence: step.egcs_cn_sequence ?? 0,
  egcs_cn_description_en: step.egcs_cn_description_en ?? '',
  egcs_cn_description_fr: step.egcs_cn_description_fr ?? '',
  egcs_cn_name_en: step.egcs_cn_name_en ?? '',
  egcs_cn_name_fr: step.egcs_cn_name_fr ?? '',
  egcs_cn_defaultuser: step.egcs_cn_defaultuser ?? '',
  egcs_cn_approvertitle: step.egcs_cn_approvertitle ?? '',
  egcs_cn_approvaltemplate: templateId,
  _deleted: false
})

const saveApprovalStep = async (
  db: DbClient,
  step: ApprovalTemplateStepInput,
  templateId: string,
  existingIds: Set<string>
) => {
  if (step.id && !existingIds.has(String(step.id))) {
    throw new Error('Approval template step is outside its parent template.')
  }

  if (step.id) {
    const stepValues = {
      ...(step.egcs_cn_sequence === undefined ? {} : { egcs_cn_sequence: step.egcs_cn_sequence }),
      ...(step.egcs_cn_description_en === undefined ? {} : { egcs_cn_description_en: step.egcs_cn_description_en }),
      ...(step.egcs_cn_description_fr === undefined ? {} : { egcs_cn_description_fr: step.egcs_cn_description_fr }),
      ...(step.egcs_cn_name_en === undefined ? {} : { egcs_cn_name_en: step.egcs_cn_name_en }),
      ...(step.egcs_cn_name_fr === undefined ? {} : { egcs_cn_name_fr: step.egcs_cn_name_fr }),
      ...(step.egcs_cn_defaultuser === undefined ? {} : { egcs_cn_defaultuser: step.egcs_cn_defaultuser }),
      ...(step.egcs_cn_approvertitle === undefined ? {} : { egcs_cn_approvertitle: step.egcs_cn_approvertitle })
    }

    if (Object.keys(stepValues).length === 0) {
      return await db
        .selectFrom('Common_Approval_Step')
        .selectAll()
        .where('id', '=', String(step.id))
        .where('egcs_cn_approvaltemplate', '=', templateId)
        .where('_deleted', '=', false)
        .executeTakeFirstOrThrow()
    }

    return await db
      .updateTable('Common_Approval_Step')
      .set(stepValues)
      .where('id', '=', String(step.id))
      .where('egcs_cn_approvaltemplate', '=', templateId)
      .where('_deleted', '=', false)
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  return await db
    .insertInto('Common_Approval_Step')
    .values(getApprovalStepWriteValues(step, templateId))
    .returningAll()
    .executeTakeFirstOrThrow()
}

const syncApprovalStep = async (
  db: DbClient,
  step: ApprovalTemplateStepInput,
  templateId: string,
  existingIds: Set<string>
) => {
  if (step.id && !existingIds.has(String(step.id))) {
    throw new Error('Approval template step is outside its parent template.')
  }

  if ('_deleted' in step && step._deleted === true && step.id) {
    await softDeleteSteps(db, templateId, [String(step.id)])
    return null
  }

  const savedStep = await saveApprovalStep(db, step, templateId, existingIds)
  await syncCertifications(db, String(savedStep.id), step.certifications)
  return String(savedStep.id)
}

export const syncApprovalTemplate = async (
  db: DbClient,
  input: {
    scopeType: ApprovalTemplateScopeType
    scopeId: string
    payload: ApprovalTemplate | ApprovalTemplatePatch | ApprovalTemplateCreateInput
    templateId?: string
  }
) => {
  if (input.templateId) {
    const publication = await db.selectFrom('Common_Publication').select('egcs_cn_state')
      .where('id', '=', input.templateId).where('_deleted', '=', false).executeTakeFirstOrThrow()
    if (publication.egcs_cn_state === 'retired') {
      throw new Error('Retired approval templates are immutable.')
    }
  }

  const savedTemplate = await saveApprovalTemplate(db, input)

  await syncAdditionalApprovalCertifications(
    db,
    String(savedTemplate.id),
    input.payload.additionalApprovalCertifications as AdditionalApprovalCertificationInput[] | undefined
  )

  const steps = input.payload.steps as ApprovalTemplateStepInput[] | undefined
  if (!steps) {
    return savedTemplate
  }

  const existing = await db
    .selectFrom('Common_Approval_Step')
    .select(['id'])
    .where('egcs_cn_approvaltemplate', '=', String(savedTemplate.id))
    .where('_deleted', '=', false)
    .execute()

  const existingIds = new Set(existing.map(item => String(item.id)))
  const retainedIds = new Set<string>()

  for (const step of steps) {
    const retainedId = await syncApprovalStep(db, step, String(savedTemplate.id), existingIds)
    if (retainedId) {
      retainedIds.add(retainedId)
    }
  }

  const removedIds = existing
    .map(item => String(item.id))
    .filter(id => !retainedIds.has(id))

  await softDeleteSteps(db, String(savedTemplate.id), removedIds)

  return savedTemplate
}

export const softDeleteApprovalTemplate = async (
  db: DbClient,
  templateId: string
) => {
  const publication = await db.selectFrom('Common_Publication').select('egcs_cn_state')
    .where('id', '=', templateId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  if (publication.egcs_cn_state !== 'draft') {
    throw new Error('Only draft approval templates may be deleted.')
  }

  await db
    .updateTable('Common_Certification')
    .set({ _deleted: true })
    .where('egcs_cn_approvaltemplate', '=', templateId)
    .where('_deleted', '=', false)
    .execute()

  const stepIds = await db
    .selectFrom('Common_Approval_Step')
    .select('id')
    .where('egcs_cn_approvaltemplate', '=', templateId)
    .where('_deleted', '=', false)
    .execute()

  const resolvedStepIds = stepIds.map(item => String(item.id))
  if (resolvedStepIds.length > 0) {
    await db
      .updateTable('Common_Certification')
      .set({ _deleted: true })
      .where('egcs_cn_approvalstep', 'in', resolvedStepIds)
      .where('_deleted', '=', false)
      .execute()

    await db
      .updateTable('Common_Approval_Step')
      .set({ _deleted: true })
      .where('id', 'in', resolvedStepIds)
      .execute()
  }

  await db
    .updateTable('Common_Approval_Template')
    .set({ _deleted: true })
    .where('id', '=', templateId)
    .execute()

  await db
    .updateTable('Common_Publication')
    .set({ _deleted: true })
    .where('id', '=', templateId)
    .execute()
}
