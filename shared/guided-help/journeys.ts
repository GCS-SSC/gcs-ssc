import type { ContractDiagnostic, GuideDocument, TargetLedger } from '@gcs-ssc/guided-help/contracts'
import { checkGuideCompatibility } from '@gcs-ssc/guided-help/contracts'
import type { GuideJourneyDefinition } from '@gcs-ssc/guided-help/journey'

export type RegisteredHelpJourney = Omit<GuideJourneyDefinition, 'stages'> & {
  implementation: 'agreement.workflow'
  purpose: 'risk_rating'
  stages: (Omit<GuideJourneyDefinition['stages'][number], 'taskTemplates'> & {
    allowedViews: string[]
    taskTemplates?: { key: string, label: { en: string, fr: string }, allowedViews: string[] }[]
  })[]
}

/** Host-owned, server-safe registration: authored documents can select only these recipes. */
export const guidedHelpJourneys: RegisteredHelpJourney[] = [
  {
    adapter: 'agreement.risk-assessment',
    implementation: 'agreement.workflow',
    purpose: 'risk_rating',
    label: { en: 'Assess an agreement’s risk', fr: 'Évaluer le risque d’une entente' },
    stages: [
      { id: 'choose-agreement', kind: 'once', label: { en: 'Choose your agreement', fr: 'Choisir votre entente' }, allowedViews: ['agreements.list'] },
      { id: 'start-workflow', kind: 'once', label: { en: 'Start the risk workflow', fr: 'Démarrer le processus de risque' }, allowedViews: ['agreement.detail', 'agreement.risk-rating'] },
      {
        id: 'work-tasks', kind: 'tasks', label: { en: 'Complete the workflow tasks', fr: 'Terminer les tâches du processus' },
        allowedViews: ['agreement.risk-rating'],
        taskTemplates: [
          { key: 'assessment', label: { en: 'Assessment walkthrough', fr: 'Parcours de l’évaluation' }, allowedViews: ['agreement.risk-rating', 'assessment.detail'] },
          { key: 'checklist', label: { en: 'Checklist walkthrough', fr: 'Parcours de la liste de contrôle' }, allowedViews: ['agreement.risk-rating', 'checklist.detail'] }
        ]
      },
      { id: 'result', kind: 'once', label: { en: 'Confirm the final result', fr: 'Confirmer le résultat final' }, allowedViews: ['agreement.detail', 'agreement.risk-rating'] }
    ]
  }
]

/** Validate published recipes against registered stage order, kinds and supported screens.
 * @param document Published guide to validate.
 * @param ledger Supported application views and targets.
 * @returns Structural and registered-journey incompatibilities.
 */
export const checkHostGuideCompatibility = (document: GuideDocument, ledger: TargetLedger): ContractDiagnostic[] => {
  const diagnostics = checkGuideCompatibility(document, ledger)
  if (!document.journey) return diagnostics
  const registration = guidedHelpJourneys.find(item => item.adapter === document.journey?.adapter)
  if (!registration) return [...diagnostics, { code: 'unsupported-journey', message: 'The workflow journey is not registered.' }]
  if (document.journey.stages.length !== registration.stages.length) {
    diagnostics.push({ code: 'incompatible-journey-stages', message: 'The workflow journey must contain every registered stage.' })
  }
  document.journey.stages.forEach((stage, index) => {
    const registered = registration.stages[index]
    if (!registered || registered.id !== stage.id || registered.kind !== stage.kind) {
      diagnostics.push({ code: 'incompatible-journey-stage', message: `Unsupported journey stage: ${stage.id}.` })
      return
    }
    for (const stepId of stage.guideStepIds) {
      const step = document.steps.find(item => item.id === stepId)
      if (step && !registered.allowedViews.includes(step.view)) {
        diagnostics.push({ code: 'incompatible-journey-view', message: `The view is not supported by journey stage ${stage.id}.`, stepId, view: step.view })
      }
    }
    if (stage.kind === 'tasks') {
      for (const template of stage.taskTemplates ?? []) {
        const supported = registered.taskTemplates?.find(item => item.key === template.key)
        if (!supported) {
          diagnostics.push({ code: 'unsupported-task-template', message: `The task instructions are not registered: ${template.key}.` })
          continue
        }
        for (const stepId of template.guideStepIds) {
          const step = document.steps.find(item => item.id === stepId)
          if (step && !supported.allowedViews.includes(step.view)) {
            diagnostics.push({ code: 'incompatible-task-template-view', message: `The view is not supported by task instructions ${template.key}.`, stepId, view: step.view })
          }
        }
      }
    }
  })
  return diagnostics
}
