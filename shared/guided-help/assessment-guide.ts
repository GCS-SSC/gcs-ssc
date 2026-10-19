import type { GuideDocument } from '@gcs-ssc/guided-help/contracts'

/** Reusable guidance for one real assessment, independent of its workflow position. */
export const assessmentGuide: GuideDocument = {
  formatVersion: 1,
  title: { en: 'Complete a workflow assessment', fr: 'Terminer une évaluation du processus' },
  description: {
    en: 'Answer, save and complete this assessment, then return to the agreement to find the next task. This guide uses real casework.',
    fr: 'Répondez à cette évaluation, enregistrez-la et terminez-la, puis retournez à l’entente pour trouver la tâche suivante. Ce guide utilise des dossiers réels.'
  },
  steps: [
    {
      id: 'answer', view: 'assessment.detail', target: 'assessment.detail.question-heading', kind: 'section', advanceOn: 'manual', appearance: 'anchor-only',
      title: { en: 'Assess the evidence', fr: 'Évaluer les éléments probants' },
      instructions: {
        en: 'Read each question’s help and rating criteria, then choose a rating. Explain the evidence in the required answer comment. Repeat for the remaining questions, using the summary to change sections, then select **Next**.',
        fr: 'Lisez l’aide et les critères de chaque question, puis choisissez une cote. Justifiez votre choix dans le commentaire obligatoire. Répondez aux autres questions en changeant de section dans le sommaire, puis sélectionnez **Suivant**.'
      }
    },
    {
      id: 'save', view: 'assessment.detail', target: 'assessment.detail.save', kind: 'button', advanceOn: 'completion',
      title: { en: 'Save your answers', fr: 'Enregistrer vos réponses' },
      instructions: {
        en: 'Select **Save** in the summary. Resolve any validation messages and wait for the success confirmation. Saving keeps your work but does not complete the assessment. The guide continues after a successful save of your current answers.',
        fr: 'Sélectionnez **Enregistrer** dans le sommaire. Corrigez les erreurs de validation et attendez la confirmation de réussite. L’enregistrement conserve votre travail sans terminer l’évaluation. Le guide se poursuit après l’enregistrement réussi de vos réponses actuelles.'
      }
    },
    {
      id: 'review', view: 'assessment.detail', target: 'assessment.detail.additional-review', kind: 'button', advanceOn: 'completion',
      title: { en: 'Open Additional Review', fr: 'Ouvrir Examen supplémentaire' },
      instructions: {
        en: 'Select **Additional Review** in the summary to inspect reviewer requirements, assignments and Completion. The guide continues when that section opens.',
        fr: 'Sélectionnez **Examen supplémentaire** dans le sommaire pour consulter les exigences de révision, les affectations et l’achèvement. Le guide se poursuit lorsque cette section est ouverte.'
      }
    },
    {
      id: 'complete', view: 'assessment.detail', target: 'assessment.detail.complete', kind: 'button', advanceOn: 'manual',
      title: { en: 'Complete this task and find the next', fr: 'Terminer cette tâche et trouver la suivante' },
      instructions: {
        en: 'In **Completion**, add an optional completion note and select **Complete Review**. Resolve any requirements and wait for success. Then return to the agreement using its breadcrumb and open **Risk Rating** for a risk workflow, or the section where you started. The workflow shows what actually completed, and this guide follows the next available task. Finishing this guide alone never completes casework.',
        fr: 'Dans **Achèvement**, ajoutez une note d’achèvement facultative et sélectionnez **Terminer l\'examen**. Répondez aux exigences et attendez la confirmation. Retournez ensuite à l’entente par le fil d’Ariane et ouvrez **Évaluation du risque** pour un processus de risque, ou la section de départ. Le processus indique les tâches réellement terminées et ce guide suit la prochaine tâche disponible. Terminer ce guide ne termine jamais le travail du dossier.'
      }
    }
  ]
}
