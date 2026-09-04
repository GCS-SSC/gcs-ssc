/* eslint-disable jsdoc/require-jsdoc -- typed publication primitives */
import type { Kysely, Selectable, Transaction } from 'kysely'
import type { PublicationMetadata, PublishedDefinition } from './system-publication'
import { publishDefinition, readPublicationMetadata, retirePublication } from './system-publication'
import type { Database, JsonValue } from '~~/shared/types/database'

type ApprovalTemplateRow = Selectable<Database['Common_Approval_Template']>
type ReadDbClient = Kysely<Database> | Transaction<Database>

export type PublishedApprovalTemplate = {
  templateId: string
  nameEn: string
  nameFr: string
  descriptionEn: string
  descriptionFr: string
  allowAdditionalApprovals: boolean
  defaultAddedApprovalNameEn?: string
  defaultAddedApprovalNameFr?: string
  allowAddedApprovalNameChanges: boolean
  allowAddedApprovalCertificationChanges: boolean
  additionalCertifications: Array<{
    order: number
    descriptionEn: string
    descriptionFr: string
    nameEn: string
    nameFr: string
    optional: boolean
    certificationEn: string
    certificationFr: string
  }>
  steps: Array<{
    stepId: string
    sequence: number
    nameEn: string
    nameFr: string
    defaultUser: string
    certifications: Array<{ optional: boolean, certificationEn: string, certificationFr: string }>
  }>
}

export const buildApprovalTemplateConfiguration = async (
  db: ReadDbClient,
  template: ApprovalTemplateRow
): Promise<PublishedApprovalTemplate> => {
  const steps = await db.selectFrom('Common_Approval_Step').selectAll()
    .where('egcs_cn_approvaltemplate', '=', String(template.id)).where('_deleted', '=', false)
    .orderBy('egcs_cn_sequence', 'asc').orderBy('id', 'asc').execute()
  const stepIds = steps.map(step => String(step.id))
  const certifications = stepIds.length > 0
    ? await db.selectFrom('Common_Certification').selectAll().where('egcs_cn_approvalstep', 'in', stepIds)
        .where('_deleted', '=', false).orderBy('egcs_cn_order', 'asc').orderBy('id', 'asc').execute()
    : []
  const additionalCertifications = await db.selectFrom('Common_Certification').selectAll()
    .where('egcs_cn_approvaltemplate', '=', String(template.id)).where('_deleted', '=', false)
    .orderBy('egcs_cn_order', 'asc').orderBy('id', 'asc').execute()
  return {
    templateId: String(template.id),
    nameEn: template.egcs_cn_name_en,
    nameFr: template.egcs_cn_name_fr,
    descriptionEn: template.egcs_cn_description_en,
    descriptionFr: template.egcs_cn_description_fr,
    allowAdditionalApprovals: template.egcs_cn_allowadditionalapprovals,
    ...(template.egcs_cn_defaultaddedapprovalname_en
      ? { defaultAddedApprovalNameEn: template.egcs_cn_defaultaddedapprovalname_en }
      : {}),
    ...(template.egcs_cn_defaultaddedapprovalname_fr
      ? { defaultAddedApprovalNameFr: template.egcs_cn_defaultaddedapprovalname_fr }
      : {}),
    allowAddedApprovalNameChanges: template.egcs_cn_allowaddedapprovalnamechanges,
    allowAddedApprovalCertificationChanges: template.egcs_cn_allowaddedapprovalcertificationchanges,
    additionalCertifications: additionalCertifications.map(item => ({
      order: item.egcs_cn_order,
      descriptionEn: item.egcs_cn_description_en,
      descriptionFr: item.egcs_cn_description_fr,
      nameEn: item.egcs_cn_name_en,
      nameFr: item.egcs_cn_name_fr,
      optional: item.egcs_cn_optional === true,
      certificationEn: item.egcs_cn_certification_en,
      certificationFr: item.egcs_cn_certification_fr
    })),
    steps: steps.map(step => ({
      stepId: String(step.id),
      sequence: Number(step.egcs_cn_sequence),
      nameEn: step.egcs_cn_name_en,
      nameFr: step.egcs_cn_name_fr,
      defaultUser: String(step.egcs_cn_defaultuser),
      certifications: certifications
        .filter(item => String(item.egcs_cn_approvalstep) === String(step.id))
        .map(item => ({
          optional: item.egcs_cn_optional === true,
          certificationEn: item.egcs_cn_certification_en,
          certificationFr: item.egcs_cn_certification_fr
        }))
    }))
  }
}

export const readPublishedApprovalTemplate = (value: JsonValue): PublishedApprovalTemplate => value as PublishedApprovalTemplate

export const readApprovalTemplatePublicationMetadata = async (
  db: ReadDbClient,
  template: ApprovalTemplateRow
): Promise<PublicationMetadata> => await readPublicationMetadata(
  db,
  String(template.id),
  await buildApprovalTemplateConfiguration(db, template) as JsonValue
)

export const publishApprovalTemplate = async (
  db: Transaction<Database>,
  template: ApprovalTemplateRow,
  actorId: string
): Promise<PublishedDefinition> => await publishDefinition(db, {
  publicationId: String(template.id),
  kind: 'approval_template',
  definition: await buildApprovalTemplateConfiguration(db, template) as JsonValue,
  actorId
})

export const retireApprovalTemplate = async (
  db: Transaction<Database>,
  templateId: string,
  actorId: string
): Promise<PublicationMetadata> => await retirePublication(db, {
  publicationId: templateId,
  kind: 'approval_template',
  actorId
})
