import { agreementCaseworkLedger } from './agreement-casework.ts'
import { financialCaseworkLedger } from './financial-casework.ts'
import { otherCaseworkHelpViews } from './other-casework.ts'
import type { TargetLedger } from '@gcs-ssc/guided-help/contracts'

/** Approved application contract; edits require explicit guided-help contract task scope. */
export const guidedHelpLedger: TargetLedger = {
  formatVersion: 1,
  views: [
    {
      key: 'agreement.detail', discoverable: false,
      label: { en: 'Agreement — Detail guidance', fr: 'Entente — Instructions du dossier' },
      targets: [{ key: 'agreement.detail.risk-navigation', label: { en: 'Open Risk Rating', fr: 'Ouvrir Évaluation du risque' }, kind: 'button', completion: { kind: 'location', fact: 'agreement.risk-rating' } }]
    },
    {
      key: 'checklist.detail', discoverable: false,
      label: { en: 'Checklist — Task guidance', fr: 'Liste de contrôle — Instructions de la tâche' },
      targets: [
        { key: 'checklist.detail.question-heading', label: { en: 'Current checklist section', fr: 'Section actuelle de la liste de contrôle' }, kind: 'section' },
        { key: 'checklist.detail.navigation', label: { en: 'Checklist navigation and save', fr: 'Navigation et enregistrement de la liste de contrôle' }, kind: 'section' },
        { key: 'checklist.detail.completion', label: { en: 'Review and completion', fr: 'Révision et achèvement' }, kind: 'section' },
        { key: 'checklist.detail.save', label: { en: 'Save checklist', fr: 'Enregistrer la liste de contrôle' }, kind: 'button', completion: { kind: 'success', action: 'save-success' } },
        { key: 'checklist.detail.additional-review', label: { en: 'Additional Review', fr: 'Examen supplémentaire' }, kind: 'button', completion: { kind: 'location', fact: 'checklist.additional-review' } },
        { key: 'checklist.detail.complete', label: { en: 'Complete checklist', fr: 'Terminer la liste de contrôle' }, kind: 'button' },
        { key: 'checklist.detail.return', label: { en: 'Back to entity', fr: 'Retour à l’entité' }, kind: 'navigation' }
      ]
    },
    {
      key: 'agreements.list',
      label: { en: 'Agreements — Choose an agreement', fr: 'Ententes — Choisir une entente' },
      targets: [
        { key: 'agreements.list.search', label: { en: 'Search agreements', fr: 'Rechercher des ententes' }, kind: 'text' },
        { key: 'agreements.list.records', label: { en: 'Agreement list', fr: 'Liste des ententes' }, kind: 'section', completion: { kind: 'location', fact: 'agreement.selected' } }
      ]
    },
    {
      key: 'agreement.risk-rating',
      label: { en: 'Agreement — Risk Rating', fr: 'Entente — Évaluation du risque' },
      targets: [
        { key: 'agreement.risk-rating.start', label: { en: 'Start risk rating', fr: 'Commencer l’évaluation du risque' }, kind: 'button', completion: { kind: 'location', fact: 'agreement.workflow.started' } },
        { key: 'agreement.risk-rating.step-view', label: { en: 'View workflow stage', fr: 'Voir l’étape du processus' }, kind: 'button', scope: 'instance', completion: { kind: 'location', fact: 'task.arrived' } },
        { key: 'agreement.risk-rating.review-open', label: { en: 'Open workflow review', fr: 'Ouvrir l’examen du processus' }, kind: 'navigation', scope: 'instance', completion: { kind: 'location', fact: 'task.arrived' } },
        { key: 'agreement.risk-rating.workflow', label: { en: 'Risk workflow and tasks', fr: 'Processus de risque et tâches' }, kind: 'section' },
        { key: 'agreement.risk-rating.result', label: { en: 'Risk workflow result', fr: 'Résultat du processus de risque' }, kind: 'section' }
      ]
    },
    {
      key: 'assessment.detail',
      label: { en: 'Assessment — Work and completion', fr: 'Évaluation — Travail et achèvement' },
      targets: [
        { key: 'assessment.detail.question-heading', label: { en: 'Current assessment section', fr: 'Section actuelle de l’évaluation' }, kind: 'section' },
        { key: 'assessment.detail.save', label: { en: 'Save assessment', fr: 'Enregistrer l’évaluation' }, kind: 'button', completion: { kind: 'success', action: 'save-success' } },
        { key: 'assessment.detail.additional-review', label: { en: 'Additional Review', fr: 'Examen supplémentaire' }, kind: 'button', completion: { kind: 'location', fact: 'assessment.additional-review' } },
        { key: 'assessment.detail.complete', label: { en: 'Complete review', fr: 'Terminer l’examen' }, kind: 'button' },
        { key: 'assessment.detail.return', label: { en: 'Back to entity', fr: 'Retour à l’entité' }, kind: 'navigation' },
        { key: 'assessment.detail.navigation', label: { en: 'Assessment navigation and save', fr: 'Navigation et enregistrement de l’évaluation' }, kind: 'section' },
        { key: 'assessment.detail.completion', label: { en: 'Review and completion', fr: 'Révision et achèvement' }, kind: 'section' }
      ]
    },
    {
      key: 'agency.general',
      label: { en: 'Agency — General', fr: 'Organisme — Général' },
      targets: []
    },
    {
      key: 'agency.address-types',
      label: { en: 'Agency — Address types', fr: 'Organisme — Types d’adresse' },
      targets: [
        { key: 'agency.address-types.add', label: { en: 'Add address type', fr: 'Ajouter un type d’adresse' }, kind: 'button', completion: { kind: 'success', action: 'modal-open' } },
        { key: 'agency.address-types.name-en', label: { en: 'English name', fr: 'Nom anglais' }, kind: 'text' },
        { key: 'agency.address-types.name-fr', label: { en: 'French name', fr: 'Nom français' }, kind: 'text' },
        { key: 'agency.address-types.save', label: { en: 'Save address type', fr: 'Enregistrer le type d’adresse' }, kind: 'button', completion: { kind: 'success', action: 'save-success' } }
      ]
    },
    {
      key: 'agency.agreement-types',
      label: { en: 'Agency — Agreement types', fr: 'Organisme — Types d’ententes' },
      targets: [
        { key: 'agency.agreement-types.add', label: { en: 'Add agreement type', fr: 'Ajouter un type d’entente' }, kind: 'button', completion: { kind: 'success', action: 'modal-open' } },
        { key: 'agency.agreement-types.type', label: { en: 'Agreement type', fr: 'Type d’entente' }, kind: 'select', choices: [
          { value: 'grant', label: { en: 'Grant', fr: 'Subvention' } },
          { value: 'nonrepayable', label: { en: 'Non-Repayable', fr: 'Non remboursable' } },
          { value: 'repayable', label: { en: 'Repayable', fr: 'Remboursable' } },
          { value: 'partiallyrepayable', label: { en: 'Partially Repayable', fr: 'Partiellement remboursable' } },
          { value: 'other', label: { en: 'Other', fr: 'Autre' } }
        ] },
        { key: 'agency.agreement-types.name-en', label: { en: 'English name', fr: 'Nom anglais' }, kind: 'text' },
        { key: 'agency.agreement-types.name-fr', label: { en: 'French name', fr: 'Nom français' }, kind: 'text' },
        { key: 'agency.agreement-types.save', label: { en: 'Save agreement type', fr: 'Enregistrer le type d’entente' }, kind: 'button', completion: { kind: 'success', action: 'save-success' } }
      ]
    },
    {
      key: 'agency.edit',
      label: { en: 'Agency — Edit agency', fr: 'Organisme — Modifier l’organisme' },
      discoverable: false,
      targets: [
        { key: 'agency.edit.active', label: { en: 'Agency active status', fr: 'État actif de l’organisme' }, kind: 'checkbox', completion: { kind: 'success', action: 'field-change' } }
      ]
    }
  ]
}

// Casework screens are available to instruction authoring. New launch screens require
// their own resource-aware discovery authorization before publication can offer them.
for (const declaration of [...agreementCaseworkLedger.views, ...financialCaseworkLedger.views, ...otherCaseworkHelpViews]) {
  const existing = guidedHelpLedger.views.find(view => view.key === declaration.key)
  if (existing) existing.targets.push(...declaration.targets)
  else guidedHelpLedger.views.push({ ...declaration, discoverable: false })
}
