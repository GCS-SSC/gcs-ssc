/* eslint-disable jsdoc/require-jsdoc -- The private fixture helpers share the seed transaction. */
import { sql, type Insertable, type Transaction } from 'kysely'
import type { Database, JsonValue } from '~~/shared/types/database'
import { evaluateChecklist } from '~~/shared/utils/checklist-evaluation'
import { ChecklistDefinitionSchema } from '~~/shared/types/schemas/checklist/checklist'
import { buildReviewSchemaDefinition } from '../utils/review-schema-versioning'
import { buildReviewSetupPublication } from '../utils/review-setup-versioning'
import { publishDefinition } from '../utils/system-publication'

const agencyId = '21'
const streamId = '118'
const entityType = 'applicantrecipient'
const bands = [
  { max: 1, label: { en: 'Ready', fr: 'Prêt' }, indicator: '#16A34A' },
  { max: 5, label: { en: 'Follow-up required', fr: 'Suivi requis' }, indicator: '#DC2626' }
]
const assessmentDefinition = {
  sections: [{
    name: 'readiness', number: '1', icon: 'i-lucide-clipboard-check', weight: 1,
    label: { en: 'Readiness', fr: 'Préparation' },
    subSections: [{
      name: 'evidence', label: { en: 'Evidence', fr: 'Éléments probants' },
      weight: { adjustable: false, weight: 1 }, questions: [{
        name: 'file_complete', type: 'question', weight: { adjustable: false, weight: 1 },
        question: { en: 'Is the file ready for review?', fr: 'Le dossier est-il prêt pour l’examen?' },
        commentThreshold: { min: 5, max: 5 }, help: [],
        options: bands.map(band => ({ value: band.max, label: band.label, description: band.label }))
      }]
    }]
  }],
  sectionMatrix: bands,
  outcomes: []
}
const checklistContent = {
  sections: [{
    key: 'evidence', label: { en: 'Evidence', fr: 'Éléments probants' }, questions: [{
      key: 'verified', required: true, commentPolicy: 'optional',
      question: { en: 'Has the evidence been verified?', fr: 'Les éléments probants ont-ils été vérifiés?' }
    }]
  }]
} satisfies JsonValue
const checklistDefinition = ChecklistDefinitionSchema.parse(checklistContent)

export const seedReviewCopyDemo = async (db: Transaction<Database>): Promise<void> => {
  const agency = await db.selectFrom('Agency_Profile').select('id').where('id', '=', agencyId).executeTakeFirst()
  if (!agency) return
  await sql`SET CONSTRAINTS ALL DEFERRED`.execute(db)
  const actor = await db.selectFrom('Common_User').select('id')
    .where('egcs_cn_email', '=', 'root@example.com').where('_deleted', '=', false).executeTakeFirstOrThrow()
  const applicant = await db.insertInto('Applicant_Recipient_Profile').values({
    egcs_ar_leadagency: agencyId,
    egcs_ar_legalname_en: 'Reassessment Copy Demo',
    egcs_ar_legalname_fr: 'Démonstration de copie de réévaluation',
    egcs_ar_operatingname_en: 'Reassessment Copy Demo',
    egcs_ar_operatingname_fr: 'Démonstration de copie de réévaluation',
    egcs_ar_description_en: 'Demo for copying previous assessment and checklist answers.',
    egcs_ar_description_fr: 'Démonstration de copie des réponses aux évaluations et aux listes de contrôle.'
  }).returning('id').executeTakeFirstOrThrow()
  const assign = async (type: 'applicantrecipient' | 'commonreview', id: string) => {
    await db.insertInto('Common_Entity_Assignment').values({
      egcs_cn_entityid: id, egcs_cn_entitytype: type, egcs_cn_user: actor.id,
      egcs_cn_createdby: actor.id, egcs_cn_isprimary: true
    }).execute()
  }
  await assign(entityType, applicant.id)

  const [assessmentSchema, checklistSchema] = await db.insertInto('Common_Review_Schema').values(
    (['assessment', 'checklist'] as const).map(kind => ({
      egcs_cn_agency: agencyId,
      egcs_cn_entitytype: entityType,
      egcs_cn_reviewtype: kind,
      egcs_cn_name_en: kind === 'assessment' ? 'Reassessment demo assessment' : 'Reassessment demo checklist',
      egcs_cn_name_fr: kind === 'assessment' ? 'Évaluation de démonstration' : 'Liste de contrôle de démonstration',
      egcs_cn_outcomename_en: 'Readiness result',
      egcs_cn_outcomename_fr: 'Résultat de préparation',
      egcs_cn_disablealignment: true,
      egcs_cn_disablecustomoutcomes: true,
      egcs_cn_disablereviewers: true,
      egcs_cn_scoringmatrix: kind === 'assessment' ? sql`${JSON.stringify(bands)}::jsonb` : null,
      egcs_cn_assessmentschema: kind === 'assessment' ? assessmentDefinition : null
    }))
  ).returningAll().execute()
  if (!assessmentSchema || !checklistSchema) throw new Error('Reassessment demo schemas were not created')
  await db.insertInto('Common_Checklist_Schema').values({
    egcs_cn_reviewschema: checklistSchema.id, egcs_cn_checklistschema: checklistContent
  }).execute()

  const publishSchema = async (schema: typeof assessmentSchema, checklist: JsonValue = null) => {
    await publishDefinition(db, {
      publicationId: schema.id, kind: 'review_schema', actorId: actor.id,
      definition: buildReviewSchemaDefinition(schema, checklist)
    })
  }
  await publishSchema(assessmentSchema)
  await publishSchema(checklistSchema, checklistContent)

  const { order } = await db.selectFrom('Common_Review_Set_Setup').select(eb => eb.fn.max('egcs_cn_order').as('order'))
    .where('egcs_cn_agency', '=', agencyId).where('egcs_cn_entitytype', '=', entityType).executeTakeFirstOrThrow()
  const createSetup = async (version: number) => {
    const setup = await db.insertInto('Common_Review_Set_Setup').values({
      egcs_cn_agency: agencyId, egcs_cn_entitytype: entityType, egcs_cn_order: (order ?? 0) + version,
      egcs_cn_name_en: `Reassessment Copy Demo v${version}`,
      egcs_cn_name_fr: `Démonstration de copie de réévaluation v${version}`,
      egcs_cn_directreview: true, egcs_cn_sequential: false
    }).returningAll().executeTakeFirstOrThrow()
    await db.insertInto('Common_Review_Setup').values([assessmentSchema, checklistSchema].map((schema, index) => ({
      egcs_cn_entitytype: entityType, egcs_cn_order: index + 1, egcs_cn_reviewset: setup.id,
      egcs_cn_reviewschema: schema.id, egcs_cn_failonchecklistfailure: false
    }))).execute()
    const plan = await buildReviewSetupPublication(db, setup)
    const publication = await publishDefinition(db, {
      publicationId: setup.id, kind: 'review_set_setup', actorId: actor.id, ...plan
    })
    if (publication.publicationVersionId === null || publication.publicationVersion === null) {
      throw new Error('Reassessment demo review set was not published')
    }
    await db.insertInto('Transfer_Payment_Stream_Review_Set').values({
      egcs_tp_transferpaymentstream: streamId, egcs_tp_reviewset: setup.id
    }).execute()
    return { id: setup.id, versionId: publication.publicationVersionId, version: publication.publicationVersion, members: plan.definition.members }
  }
  const transition = async (runtimeId: string, runtimeItemId: string | null, to: 'active' | 'succeeded') => {
    await db.insertInto('Common_Runtime_Transition').values({
      egcs_cn_runtime: runtimeId, egcs_cn_runtimeitem: runtimeItemId,
      egcs_cn_fromstate: to === 'active' ? 'pending' : 'active', egcs_cn_tostate: to,
      egcs_cn_actor: actor.id, egcs_cn_reason: 'reassessment_copy_demo'
    }).execute()
  }
  const createItem = async (values: Insertable<Database['Common_Runtime_Item']>) =>
    (await db.insertInto('Common_Runtime_Item').values(values).returning('id').executeTakeFirstOrThrow()).id
  const start = async (setup: Awaited<ReturnType<typeof createSetup>>) => {
    const { id: runtimeId } = await db.insertInto('Common_Runtime').values({
      egcs_cn_kind: 'review_set', egcs_cn_entitytype: entityType, egcs_cn_entityid: applicant.id,
      egcs_cn_purpose: 'standard', egcs_cn_initiatedby: actor.id,
      egcs_cn_sourcepublication: setup.id, egcs_cn_sourcepublicationkind: 'review_set_setup',
      egcs_cn_sourcepublicationversion: setup.versionId, egcs_cn_sourceversion: setup.version,
      egcs_cn_previousruntime: null, egcs_cn_attempt: 1
    }).returning('id').executeTakeFirstOrThrow()
    const setItemId = await createItem({
      egcs_cn_runtime: runtimeId, egcs_cn_parentruntimeitem: null, egcs_cn_kind: 'review_set', egcs_cn_order: 1,
      egcs_cn_publication: setup.id, egcs_cn_publicationkind: 'review_set_setup',
      egcs_cn_publicationversion: setup.versionId, egcs_cn_version: setup.version
    })
    const set = await db.insertInto('Common_Review_Set').values({
      egcs_cn_entitytype: entityType, egcs_cn_entityid: applicant.id,
      egcs_cn_reviewsetsetup: setup.id, egcs_cn_runtimeitem: setItemId
    }).returning('id').executeTakeFirstOrThrow()
    await transition(runtimeId, null, 'active')
    await transition(runtimeId, setItemId, 'active')
    const reviews = []
    for (const member of setup.members) {
      const runtimeItemId = await createItem({
        egcs_cn_runtime: runtimeId, egcs_cn_parentruntimeitem: setItemId, egcs_cn_kind: 'review', egcs_cn_order: member.order,
        egcs_cn_publication: member.schema.publicationId, egcs_cn_publicationkind: 'review_schema',
        egcs_cn_publicationversion: member.schema.publicationVersionId, egcs_cn_version: member.schema.publicationVersion
      })
      const review = await db.insertInto('Common_Review').values({
        egcs_cn_reviewset: set.id, egcs_cn_reviewschema: member.schema.publicationId, egcs_cn_runtimeitem: runtimeItemId,
        egcs_cn_disablealignment: true, egcs_cn_disablecustomoutcomes: true, egcs_cn_disablereviewers: true,
        egcs_cn_failonchecklistfailure: false, egcs_cn_reviewresult: member.reviewType === 'assessment' ? 0 : null
      }).returning('id').executeTakeFirstOrThrow()
      await assign('commonreview', review.id)
      if (member.reviewType === 'assessment') {
        await db.insertInto('Common_Assessment').values({
          egcs_cn_review: review.id, egcs_cn_reviewresult: 0, egcs_cn_disablecustomoutcomes: true, egcs_cn_disablealignment: true
        }).execute()
      } else {
        await db.insertInto('Common_Checklist').values({ egcs_cn_review: review.id }).execute()
      }
      await transition(runtimeId, runtimeItemId, 'active')
      reviews.push({ ...review, runtimeItemId, kind: member.reviewType })
    }
    const assessment = reviews.find(review => review.kind === 'assessment')
    const checklist = reviews.find(review => review.kind === 'checklist')
    if (!assessment || !checklist) throw new Error('Reassessment demo review set is incomplete')
    return { runtimeId, setItemId, assessment, checklist }
  }
  const complete = async (runtimeId: string, review: { id: string; runtimeItemId: string }) => {
    await db.insertInto('Common_Completion').values({
      egcs_cn_entitytype: 'commonreview', egcs_cn_entityid: review.id, egcs_cn_user: actor.id,
      egcs_cn_comments: '', egcs_cn_disposition: 'not_applicable'
    }).execute()
    await transition(runtimeId, review.runtimeItemId, 'succeeded')
  }
  const completeChecklist = async (run: Awaited<ReturnType<typeof start>>) => {
    const { id } = await db.selectFrom('Common_Checklist').select('id')
      .where('egcs_cn_review', '=', run.checklist.id).executeTakeFirstOrThrow()
    const response = { questionKey: 'verified', answer: 'pass', comment: 'Evidence verified.' } as const
    const { result, trace } = evaluateChecklist(checklistDefinition, [response])
    await db.insertInto('Common_Checklist_Response').values({
      egcs_cn_checklist: id, egcs_cn_section: 'evidence', egcs_cn_question: response.questionKey,
      egcs_cn_answer: response.answer, egcs_cn_comment: response.comment
    }).execute()
    await db.updateTable('Common_Checklist').set({
      egcs_cn_result: result, egcs_cn_evaluationtrace: sql`${JSON.stringify(trace)}::jsonb`
    }).where('id', '=', id).execute()
    await complete(run.runtimeId, run.checklist)
  }

  const firstSetup = await createSetup(1)
  const first = await start(firstSetup)
  await db.insertInto('Common_Review_Response').values({
    egcs_cn_assessment: first.assessment.id, egcs_cn_section: 'readiness', egcs_cn_subsection: 'evidence',
    egcs_cn_question: 'file_complete', egcs_cn_value: 1, egcs_cn_comment: 'Supporting documents reviewed.'
  }).execute()
  await db.updateTable('Common_Review').set({ egcs_cn_reviewresult: 1 }).where('id', '=', first.assessment.id).execute()
  await complete(first.runtimeId, first.assessment)
  await completeChecklist(first)
  await transition(first.runtimeId, first.setItemId, 'succeeded')
  await transition(first.runtimeId, null, 'succeeded')
  await start(firstSetup)

  const revise = async (schema: typeof assessmentSchema, checklist: JsonValue = null) => {
    const updated = await db.updateTable('Common_Review_Schema').set({
      egcs_cn_name_en: `${schema.egcs_cn_name_en} (revised)`,
      egcs_cn_name_fr: `${schema.egcs_cn_name_fr} (révisée)`
    }).where('id', '=', schema.id).returningAll().executeTakeFirstOrThrow()
    await publishSchema(updated, checklist)
  }
  await revise(assessmentSchema)
  await revise(checklistSchema, checklistContent)
  const revised = await start(await createSetup(2))
  await completeChecklist(revised)
  await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(db)
}
