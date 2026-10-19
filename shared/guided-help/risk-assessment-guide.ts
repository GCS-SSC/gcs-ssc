import type { GuideDocument } from '@gcs-ssc/guided-help/contracts'
import { assessmentGuide } from './assessment-guide'
import { checklistGuide } from './checklist-guide'

/** Published NCIA goal guide; the host supplies the selected agreement and actual task inventory. */
export const riskAssessmentGuide: GuideDocument = {
  formatVersion: 1,
  title: { en: 'Conduct a risk assessment for your agreement', fr: 'Effectuer une évaluation du risque de votre entente' },
  description: {
    en: 'Choose your agreement, start its risk workflow, complete each assessment and confirm the final result. Includes an explicitly fictional NCIA training brief.',
    fr: 'Choisissez votre entente, démarrez son processus de risque, terminez chaque évaluation et confirmez le résultat final. Comprend un scénario de formation fictif de l’AICN.'
  },
  journey: {
    adapter: 'agreement.risk-assessment',
    stages: [
      { id: 'choose-agreement', kind: 'once', guideStepIds: ['find-agreement', 'choose-agreement'] },
      { id: 'start-workflow', kind: 'once', guideStepIds: ['open-risk', 'start-risk'] },
      {
        id: 'work-tasks', kind: 'tasks', guideStepIds: ['open-task', 'complete-task'],
        taskTemplates: [
          { key: 'assessment', guideStepIds: ['open-assessment', ...assessmentGuide.steps.map(step => step.id)] },
          { key: 'checklist', guideStepIds: ['open-checklist', ...checklistGuide.steps.map(step => step.id)] }
        ]
      },
      { id: 'result', kind: 'once', guideStepIds: ['return-risk', 'confirm-result'] }
    ]
  },
  steps: [
    {
      id: 'find-agreement', view: 'agreements.list', target: 'agreements.list.search', kind: 'text', advanceOn: 'manual',
      title: { en: 'Find your agreement', fr: 'Trouver votre entente' },
      instructions: { en: 'Search **NCIA-26-008** or **Aurora Recreation Centre Renewal**, then select **Next** when the agreement appears.', fr: 'Recherchez **NCIA-26-008** ou **Rénovation du centre de loisirs Aurora**, puis sélectionnez **Suivant** lorsque l’entente apparaît.' }
    },
    {
      id: 'choose-agreement', view: 'agreements.list', target: 'agreements.list.records', kind: 'section', advanceOn: 'completion',
      title: { en: 'Find and open your agreement', fr: 'Trouver et ouvrir votre entente' },
      instructions: {
        en: 'Select your agreement’s **project name** to open it. For this demonstration, choose your assigned agreement in **Northern Communities Innovation Agency**. The guide will continue on that agreement.',
        fr: 'Sélectionnez le **nom du projet** pour ouvrir votre entente. Pour cette démonstration, choisissez votre entente affectée de l’**Agence d’innovation des collectivités nordiques**. Le guide se poursuit dans cette entente.'
      }
    },
    {
      id: 'open-risk', view: 'agreement.detail', target: 'agreement.detail.risk-navigation', kind: 'button', advanceOn: 'completion',
      title: { en: 'Open Risk Rating', fr: 'Ouvrir Évaluation du risque' },
      instructions: { en: 'Confirm this is your agreement, then select **Risk Rating** in the section navigation. The guide continues when the section opens.', fr: 'Vérifiez qu’il s’agit de votre entente, puis sélectionnez **Évaluation du risque** dans la navigation des sections. Le guide se poursuit lorsque la section est ouverte.' }
    },
    {
      id: 'start-risk', view: 'agreement.risk-rating', target: 'agreement.risk-rating.start', kind: 'button', advanceOn: 'completion',
      title: { en: 'Start the agreement’s risk workflow', fr: 'Démarrer le processus de risque de l’entente' },
      instructions: {
        en: 'Check the agreement name before proceeding. Open **Risk Rating** in the agreement navigation, then select **Start risk rating** if no risk workflow is running. Follow any prerequisite message; starting requires the appropriate role and assignment. If a workflow is already running, continue its existing tasks. The task list comes from this agreement’s published workflow and may contain a different number of assessments.',
        fr: 'Vérifiez le nom de l’entente avant de continuer. Ouvrez **Évaluation du risque** dans la navigation de l’entente, puis sélectionnez **Commencer l’évaluation du risque** si aucun processus de risque n’est en cours. Suivez les messages de prérequis : le démarrage exige le rôle et l’affectation appropriés. Si un processus est déjà en cours, poursuivez ses tâches. La liste provient du processus publié de cette entente et peut contenir un nombre différent d’évaluations.'
      }
    },
    {
      id: 'open-task', view: 'agreement.risk-rating', target: 'agreement.risk-rating.step-view', kind: 'button', advanceOn: 'completion',
      title: { en: 'Open the available workflow task', fr: 'Ouvrir la tâche disponible du processus' },
      instructions: {
        en: 'Use the highlighted **View** action for this task. If the task has its own page, use its highlighted **Open review** action. The guide continues when the expected task is open.',
        fr: 'Utilisez l’action **Voir** en évidence pour cette tâche. Si la tâche possède sa propre page, utilisez son action **Ouvrir l’examen** en évidence. Le guide se poursuit lorsque la tâche attendue est ouverte.'
      }
    },
    {
      id: 'complete-task', view: 'agreement.risk-rating', target: 'agreement.risk-rating.workflow', kind: 'section', advanceOn: 'manual',
      title: { en: 'Complete the available workflow task', fr: 'Terminer la tâche disponible du processus' },
      instructions: {
        en: 'Read this task’s own instructions in the selected workflow stage. Complete its required questions, decisions or supporting information, then save and use its completion or submission action. Follow any validation or prerequisite messages. Saving alone may not complete the task. Return to the agreement’s **Risk Rating** section with **Back to entity** after success. The guide checks the actual workflow before following the next task. These general instructions stay available while you work.',
        fr: 'Lisez les instructions de cette tâche dans l’étape sélectionnée du processus. Remplissez les questions, décisions ou renseignements obligatoires, puis enregistrez et utilisez son action d’achèvement ou de soumission. Suivez les messages de validation ou de prérequis. L’enregistrement seul peut ne pas terminer la tâche. Après réussite, revenez à **Évaluation du risque** par **Retour à l’entité**. Le guide vérifie le processus réel avant de suivre la tâche suivante. Ces instructions générales restent disponibles pendant le travail.'
      }
    },
    {
      id: 'open-assessment', view: 'agreement.risk-rating', target: 'agreement.risk-rating.review-open', kind: 'navigation', advanceOn: 'completion',
      title: { en: 'Open the next available assessment', fr: 'Ouvrir la prochaine évaluation disponible' },
      instructions: {
        en: 'Use the highlighted workflow **View** action if needed, then select the highlighted **Open review** action for the expected assessment. Waiting tasks explain their prerequisite. After completing an assessment, use **Back to entity** to return here; the guide follows the next actual task. Saved answers alone do not complete a task. If you are still on the previous assessment, return to the agreement first.',
        fr: 'Utilisez au besoin l’action **Voir** en évidence dans le processus, puis sélectionnez l’action **Ouvrir l’examen** en évidence pour l’évaluation attendue. Les tâches en attente indiquent leur prérequis. Après avoir terminé une évaluation, utilisez **Retour à l’entité** pour revenir ici; le guide suit la prochaine tâche réelle. L’enregistrement des réponses ne termine pas une tâche. Si vous êtes encore dans l’évaluation précédente, retournez d’abord à l’entente.'
      }
    },
    ...assessmentGuide.steps,
    {
      id: 'open-checklist', view: 'agreement.risk-rating', target: 'agreement.risk-rating.review-open', kind: 'navigation', advanceOn: 'completion',
      title: { en: 'Open the available checklist', fr: 'Ouvrir la liste de contrôle disponible' },
      instructions: {
        en: 'Use the highlighted **View** action if needed, then select the highlighted **Open review** action for this checklist. The guide continues when the expected checklist opens.',
        fr: 'Utilisez au besoin l’action **Voir** en évidence, puis sélectionnez l’action **Ouvrir l’examen** en évidence pour cette liste de contrôle. Le guide se poursuit lorsque la liste attendue est ouverte.'
      }
    },
    ...checklistGuide.steps,
    {
      id: 'return-risk', view: 'agreement.detail', target: 'agreement.detail.risk-navigation', kind: 'button', advanceOn: 'completion',
      title: { en: 'Open the agreement’s risk result', fr: 'Ouvrir le résultat de risque de l’entente' },
      instructions: {
        en: 'Select **Risk Rating** in the agreement’s section navigation to check the completed workflow. The guide continues when that section opens.',
        fr: 'Sélectionnez **Évaluation du risque** dans la navigation des sections de l’entente pour vérifier le processus terminé. Le guide se poursuit lorsque cette section est ouverte.'
      }
    },
    {
      id: 'confirm-result', view: 'agreement.risk-rating', target: 'agreement.risk-rating.result', kind: 'section', advanceOn: 'manual',
      title: { en: 'Confirm the persisted risk result', fr: 'Confirmer le résultat de risque enregistré' },
      instructions: {
        en: 'Return to the agreement’s **Risk Rating** section using **Back to entity** if needed. Confirm every task is complete and the workflow result is **Succeeded**. Check the agreement’s risk score and its workflow source. The workflow’s published configuration determines which assessment supplies the final score. Reload the page if you want to verify the result persists. Exit the guide when you have checked the result.',
        fr: 'Revenez à la section **Évaluation du risque** de l’entente par **Retour à l’entité** au besoin. Confirmez que toutes les tâches sont terminées et que le processus est **Réussi**. Vérifiez la cote de risque et sa source. La configuration publiée du processus détermine quelle évaluation fournit la cote finale. Rechargez la page pour vérifier la conservation du résultat, puis quittez le guide.'
      }
    }
  ]
}
