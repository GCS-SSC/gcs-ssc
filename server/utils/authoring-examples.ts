import { PortableAuthoringSchema, type PortableAuthoringKind } from '~~/shared/utils/portable-authoring-schema'

const label = { en: 'Eligibility', fr: 'Admissibilité' }
const yes = { en: 'Yes', fr: 'Oui' }
const no = { en: 'No', fr: 'Non' }
const question = { en: 'Is the file complete?', fr: 'Le dossier est-il complet?' }
const names = { egcs_cn_name_en: 'Example eligibility draft', egcs_cn_name_fr: 'Exemple d’ébauche d’admissibilité' }
const review = {
  ...names, egcs_cn_entitytype: 'applicantrecipient',
  egcs_cn_outcomename_en: label.en, egcs_cn_outcomename_fr: label.fr
}
const weight = { adjustable: false, weight: 100 }
const examples = {
  checklist: {
    ...review,
    egcs_cn_checklistschema: {
      sections: [{ key: 'eligibility', label, questions: [{ key: 'complete', question, required: true, commentPolicy: 'optional' }] }],
      resultPolicy: { anyFailureFails: true, groups: [] }
    }
  },
  assessment: {
    ...review,
    egcs_cn_scoringmatrix: [{ max: 5, label, indicator: '#1E6243' }],
    egcs_cn_assessmentschema: {
      sections: [{
        name: 'eligibility', number: '1', label, weight: 100, icon: 'i-lucide-file-check',
        subSections: [{
          name: 'criteria', label, weight,
          questions: [{
            type: 'question', name: 'complete', question, weight, commentThreshold: { min: 0, max: 5 },
            options: [{ value: 0, label: no, description: { en: 'Incomplete', fr: 'Incomplet' } }, { value: 5, label: yes, description: { en: 'Complete', fr: 'Complet' } }], help: []
          }]
        }]
      }],
      sectionMatrix: [], outcomes: []
    }
  },
  recommendation: {
    ...names,
    egcs_cn_result: {},
    egcs_cn_recommendationschema: {
      sections: [{
        key: 'eligibility', label, subSections: [{
          key: 'decision', label, questions: [{
            key: 'recommend', type: 'radio', question, required: true, isResult: true,
            options: [
              { key: 'yes', label: yes, outcome: 'recommended' },
              { key: 'no', label: no, outcome: 'not_recommended' }
            ]
          }]
        }]
      }]
    }
  },
  approval: {
    ...names,
    egcs_cn_description_en: 'Confirm the decision.',
    egcs_cn_description_fr: 'Confirmer la décision.',
    egcs_cn_allowadditionalapprovals: false,
    steps: [{
      egcs_cn_sequence: 1,
      ...names,
      egcs_cn_description_en: 'Review eligibility.',
      egcs_cn_description_fr: 'Examiner l’admissibilité.',
      egcs_cn_approvertitle: 'Program Director',
      egcs_cn_defaultgroup: null
    }]
  }
}

/**
 * Returns a response example based on the same schema used to import a draft.
 * @param kind - Selected catalog type.
 * @returns An example of the accepted response format.
 */
export const authoringResponseExample = (kind: PortableAuthoringKind) => ({
  payload: PortableAuthoringSchema.parse({ version: 1, kind, payload: examples[kind] }).payload,
  notices: [],
  ...(kind === 'approval' ? { approvalAssignees: [{ stepIndex: 0, groupName: 'Example group from source' }] } : {})
})
