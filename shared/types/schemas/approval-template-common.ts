/* eslint-disable jsdoc/require-jsdoc */
import { z } from 'zod'

type StepSequenceItem = {
  egcs_cn_sequence?: number
  _deleted?: boolean
}

type CertificationPatchItem = {
  egcs_cn_name_en?: string
  egcs_cn_name_fr?: string
  egcs_cn_order?: number
  _deleted?: boolean
}

export const normalizeApprovalTemplateText = (value: string) => value.trim().toLowerCase()

export const validateUniqueByKey = <T>(
  items: T[],
  getKey: (item: T) => string,
  getPath: (index: number) => (string | number)[],
  ctx: z.RefinementCtx,
  message = 'validation.duplicate'
) => {
  const seen = new Map<string, number>()

  items.forEach((item, index) => {
    const key = getKey(item)
    const previousIndex = seen.get(key)

    if (previousIndex !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message,
        path: getPath(index)
      })
      return
    }

    seen.set(key, index)
  })
}

export const createApprovalTemplateCertificationBaseSchema = (requiredString: () => z.ZodString) => z.object({
  egcs_cn_order: z.coerce.number({ error: 'validation.required' }).int(),
  egcs_cn_description_en: requiredString(),
  egcs_cn_description_fr: requiredString(),
  egcs_cn_name_en: requiredString(),
  egcs_cn_name_fr: requiredString(),
  egcs_cn_optional: z.boolean().optional(),
  egcs_cn_certification_en: requiredString(),
  egcs_cn_certification_fr: requiredString()
})

export const createApprovalTemplateStepBaseSchema = <TCertificationSchema extends z.ZodTypeAny>(
  certificationSchema: TCertificationSchema,
  requiredId: () => z.ZodType<string, unknown>,
  requiredString: () => z.ZodString
) => z.object({
  egcs_cn_sequence: z.coerce.number({ error: 'validation.required' }).int(),
  egcs_cn_description_en: requiredString(),
  egcs_cn_description_fr: requiredString(),
  egcs_cn_name_en: requiredString(),
  egcs_cn_name_fr: requiredString(),
  egcs_cn_defaultuser: requiredId(),
  egcs_cn_approvertitle: requiredString(),
  certifications: z.array(certificationSchema).default([])
})

export const validateApprovalTemplateCertifications = <
  TCertification extends {
    egcs_cn_name_en: string
    egcs_cn_name_fr: string
    egcs_cn_order: number
  }
>(
  certifications: TCertification[],
  ctx: z.RefinementCtx,
  message = 'validation.duplicate'
) => {
  validateUniqueByKey(
    certifications,
    item => `${normalizeApprovalTemplateText(item.egcs_cn_name_en)}|${normalizeApprovalTemplateText(item.egcs_cn_name_fr)}`,
    index => ['certifications', index, 'egcs_cn_name_en'],
    ctx,
    message
  )

  validateUniqueByKey(
    certifications,
    item => String(item.egcs_cn_order),
    index => ['certifications', index, 'egcs_cn_order'],
    ctx,
    message
  )
}

export const validateApprovalTemplatePatchCertifications = (
  certifications: CertificationPatchItem[] | undefined,
  ctx: z.RefinementCtx,
  message = 'validation.duplicate'
) => {
  if (!certifications) {
    return
  }

  const activeCertifications = certifications
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item._deleted !== true)
  const namedCertifications = activeCertifications.filter(({ item }) =>
    item.egcs_cn_name_en !== undefined && item.egcs_cn_name_fr !== undefined
  )
  const orderedCertifications = activeCertifications.filter(({ item }) => item.egcs_cn_order !== undefined)

  validateUniqueByKey(
    namedCertifications,
    ({ item }) => `${normalizeApprovalTemplateText(String(item.egcs_cn_name_en))}|${normalizeApprovalTemplateText(String(item.egcs_cn_name_fr))}`,
    index => ['certifications', namedCertifications[index]?.index ?? index, 'egcs_cn_name_en'],
    ctx,
    message
  )

  validateUniqueByKey(
    orderedCertifications,
    ({ item }) => String(item.egcs_cn_order),
    index => ['certifications', orderedCertifications[index]?.index ?? index, 'egcs_cn_order'],
    ctx,
    message
  )
}

export const validateApprovalTemplateStepSequences = <
  TData extends {
    steps?: StepSequenceItem[]
  }
>(
  data: TData,
  ctx: z.RefinementCtx,
  message = 'validation.duplicate'
) => {
  if (!data.steps) {
    return
  }

  const activeSteps = data.steps
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item._deleted !== true && item.egcs_cn_sequence !== undefined)

  validateUniqueByKey(
    activeSteps,
    ({ item }) => String(item.egcs_cn_sequence),
    index => ['steps', activeSteps[index]?.index ?? index, 'egcs_cn_sequence'],
    ctx,
    message
  )
}
