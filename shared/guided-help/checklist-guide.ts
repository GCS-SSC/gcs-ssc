import type { GuideDocument } from '@gcs-ssc/guided-help/contracts'

/** Checklist instructions follow the selected business task without assuming its question count. */
export const checklistGuide: GuideDocument = {
  formatVersion: 1,
  title: { en: 'Complete a workflow checklist', fr: 'Terminer une liste de contrôle du processus' },
  description: {
    en: 'Answer, save and complete the checklist, then return to the agreement for its next task.',
    fr: 'Remplissez, enregistrez et terminez la liste de contrôle, puis revenez à l’entente pour la tâche suivante.'
  },
  steps: [
    {
      id: 'checklist-answer', view: 'checklist.detail', target: 'checklist.detail.question-heading', kind: 'section', advanceOn: 'manual', appearance: 'anchor-only',
      title: { en: 'Work through the checklist', fr: 'Remplir la liste de contrôle' },
      instructions: {
        en: 'Read each question and its help. Enter the required answers and comments. Use the section navigation to review the remaining questions, then select **Next** when you are ready to save.',
        fr: 'Lisez chaque question et son aide. Saisissez les réponses et commentaires obligatoires. Parcourez les autres questions avec la navigation des sections, puis sélectionnez **Suivant** lorsque vous êtes prêt à enregistrer.'
      }
    },
    {
      id: 'checklist-save', view: 'checklist.detail', target: 'checklist.detail.save', kind: 'button', advanceOn: 'completion',
      title: { en: 'Save the checklist', fr: 'Enregistrer la liste de contrôle' },
      instructions: {
        en: 'Select **Save**. Correct any validation messages and wait for success. The guide continues after your current answers are saved. Saving alone does not complete the checklist.',
        fr: 'Sélectionnez **Enregistrer**. Corrigez les erreurs de validation et attendez la confirmation. Le guide se poursuit après l’enregistrement de vos réponses actuelles. L’enregistrement seul ne termine pas la liste de contrôle.'
      }
    },
    {
      id: 'checklist-review', view: 'checklist.detail', target: 'checklist.detail.additional-review', kind: 'button', advanceOn: 'completion',
      title: { en: 'Open Additional Review', fr: 'Ouvrir Examen supplémentaire' },
      instructions: {
        en: 'Select **Additional Review** to check reviewer requirements, assignments and Completion. The guide continues when that section opens.',
        fr: 'Sélectionnez **Examen supplémentaire** pour vérifier les exigences de révision, les affectations et l’achèvement. Le guide se poursuit lorsque cette section est ouverte.'
      }
    },
    {
      id: 'checklist-complete', view: 'checklist.detail', target: 'checklist.detail.complete', kind: 'button', advanceOn: 'manual',
      title: { en: 'Complete this checklist', fr: 'Terminer cette liste de contrôle' },
      instructions: {
        en: 'Add an optional completion note, then select **Complete Review**. Resolve the task’s requirements and wait for success. Use **Back to entity** to return to the workflow. The guide follows the actual task result and preserves the next task’s instructions.',
        fr: 'Ajoutez une note d’achèvement facultative, puis sélectionnez **Terminer l’examen**. Répondez aux exigences de la tâche et attendez la confirmation. Utilisez **Retour à l’entité** pour revenir au processus. Le guide suit le résultat réel et conserve les instructions de la tâche suivante.'
      }
    }
  ]
}
