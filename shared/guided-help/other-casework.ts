import type { TargetLedger } from '@gcs-ssc/guided-help/contracts'

export const otherCaseworkHelpViews: TargetLedger['views'] = [
  {
    key: 'proponents.list',
    label: { en: 'Proponents — List', fr: 'Promoteurs — Liste' },
    targets: [
      { key: 'proponents.list.search', label: { en: 'Search proponents', fr: 'Rechercher des promoteurs' }, kind: 'text' },
      { key: 'proponents.list.add', label: { en: 'Create proponent', fr: 'Créer un promoteur' }, kind: 'button' },
      { key: 'proponents.list.records', label: { en: 'Proponent records', fr: 'Dossiers des promoteurs' }, kind: 'section' }
    ]
  },
  {
    key: 'proponent.detail',
    label: { en: 'Proponent — Detail', fr: 'Promoteur — Dossier' },
    targets: [
      { key: 'proponent.detail.section-navigation', label: { en: 'Section navigation', fr: 'Navigation entre les sections' }, kind: 'section' }
    ]
  },
  {
    key: 'proponent.profile',
    label: { en: 'Proponent — Profile', fr: 'Promoteur — Profil' },
    targets: [
      { key: 'proponent.profile.save', label: { en: 'Save profile', fr: 'Enregistrer le profil' }, kind: 'button' },
      { key: 'proponent.profile.cancel', label: { en: 'Cancel profile changes', fr: 'Annuler les modifications du profil' }, kind: 'button' }
    ]
  },
  {
    key: 'proponent.general',
    label: { en: 'Proponent — General', fr: 'Promoteur — Général' },
    targets: [
      { key: 'proponent.general.content', label: { en: 'General', fr: 'Général' }, kind: 'section' }
    ]
  },
  {
    key: 'proponent.other-names',
    label: { en: 'Proponent — Other names', fr: 'Promoteur — Autres noms' },
    targets: [
      { key: 'proponent.other-names.content', label: { en: 'Other names', fr: 'Autres noms' }, kind: 'section' },
      { key: 'proponent.other-names.add', label: { en: 'Add record', fr: 'Ajouter un élément' }, kind: 'button' },
      { key: 'proponent.other-names.save', label: { en: 'Save record', fr: 'Enregistrer l’élément' }, kind: 'button' },
      { key: 'proponent.other-names.search', label: { en: 'Search records', fr: 'Rechercher des éléments' }, kind: 'text' }
    ]
  },
  {
    key: 'proponent.contacts',
    label: { en: 'Proponent — Contacts', fr: 'Promoteur — Contacts' },
    targets: [
      { key: 'proponent.contacts.content', label: { en: 'Contacts', fr: 'Contacts' }, kind: 'section' },
      { key: 'proponent.contacts.add', label: { en: 'Add record', fr: 'Ajouter un élément' }, kind: 'button' },
      { key: 'proponent.contacts.save', label: { en: 'Save record', fr: 'Enregistrer l’élément' }, kind: 'button' },
      { key: 'proponent.contacts.search', label: { en: 'Search records', fr: 'Rechercher des éléments' }, kind: 'text' }
    ]
  },
  {
    key: 'proponent.addresses',
    label: { en: 'Proponent — Addresses', fr: 'Promoteur — Adresses' },
    targets: [
      { key: 'proponent.addresses.content', label: { en: 'Addresses', fr: 'Adresses' }, kind: 'section' },
      { key: 'proponent.addresses.add', label: { en: 'Add record', fr: 'Ajouter un élément' }, kind: 'button' },
      { key: 'proponent.addresses.save', label: { en: 'Save record', fr: 'Enregistrer l’élément' }, kind: 'button' },
      { key: 'proponent.addresses.search', label: { en: 'Search records', fr: 'Rechercher des éléments' }, kind: 'text' }
    ]
  },
  {
    key: 'proponent.registries',
    label: { en: 'Proponent — Registries', fr: 'Promoteur — Registres' },
    targets: [
      { key: 'proponent.registries.content', label: { en: 'Registries', fr: 'Registres' }, kind: 'section' },
      { key: 'proponent.registries.add', label: { en: 'Add record', fr: 'Ajouter un élément' }, kind: 'button' },
      { key: 'proponent.registries.save', label: { en: 'Save record', fr: 'Enregistrer l’élément' }, kind: 'button' },
      { key: 'proponent.registries.search', label: { en: 'Search records', fr: 'Rechercher des éléments' }, kind: 'text' }
    ]
  },
  {
    key: 'proponent.notes',
    label: { en: 'Proponent — Notes', fr: 'Promoteur — Notes' },
    targets: [
      { key: 'proponent.notes.content', label: { en: 'Notes', fr: 'Notes' }, kind: 'section' },
      { key: 'proponent.notes.add', label: { en: 'Add record', fr: 'Ajouter un élément' }, kind: 'button' },
      { key: 'proponent.notes.save', label: { en: 'Save record', fr: 'Enregistrer l’élément' }, kind: 'button' },
      { key: 'proponent.notes.search', label: { en: 'Search records', fr: 'Rechercher des éléments' }, kind: 'text' }
    ]
  },
  {
    key: 'proponent.agency-financial-ids',
    label: { en: 'Proponent — Agency financial identifiers', fr: 'Promoteur — Identifiants financiers des organismes' },
    targets: [
      { key: 'proponent.agency-financial-ids.content', label: { en: 'Agency financial identifiers', fr: 'Identifiants financiers des organismes' }, kind: 'section' },
      { key: 'proponent.agency-financial-ids.add', label: { en: 'Add record', fr: 'Ajouter un élément' }, kind: 'button' },
      { key: 'proponent.agency-financial-ids.save', label: { en: 'Save record', fr: 'Enregistrer l’élément' }, kind: 'button' },
      { key: 'proponent.agency-financial-ids.search', label: { en: 'Search records', fr: 'Rechercher des éléments' }, kind: 'text' }
    ]
  },
  {
    key: 'proponent.funding-history',
    label: { en: 'Proponent — Funding history', fr: 'Promoteur — Historique du financement' },
    targets: [
      { key: 'proponent.funding-history.content', label: { en: 'Funding history', fr: 'Historique du financement' }, kind: 'section' },
      { key: 'proponent.funding-history.search', label: { en: 'Search records', fr: 'Rechercher des éléments' }, kind: 'text' },
      { key: 'proponent.funding-history.add', label: { en: 'Add record', fr: 'Ajouter un élément' }, kind: 'button' }
    ]
  },
  {
    key: 'proponent.agreements',
    label: { en: 'Proponent — Agreements', fr: 'Promoteur — Ententes' },
    targets: [
      { key: 'proponent.agreements.content', label: { en: 'Agreements', fr: 'Ententes' }, kind: 'section' },
      { key: 'proponent.agreements.search', label: { en: 'Search records', fr: 'Rechercher des éléments' }, kind: 'text' },
      { key: 'proponent.agreements.add', label: { en: 'Add record', fr: 'Ajouter un élément' }, kind: 'button' }
    ]
  },
  {
    key: 'proponent.reviews',
    label: { en: 'Proponent — Reviews', fr: 'Promoteur — Examens' },
    targets: [
      { key: 'proponent.reviews.content', label: { en: 'Reviews', fr: 'Examens' }, kind: 'section' }
    ]
  },
  {
    key: 'proponent.credit-memos',
    label: { en: 'Proponent — Credit memos', fr: 'Promoteur — Notes de crédit' },
    targets: [
      { key: 'proponent.credit-memos.content', label: { en: 'Credit memos', fr: 'Notes de crédit' }, kind: 'section' },
      { key: 'proponent.credit-memos.search', label: { en: 'Search records', fr: 'Rechercher des éléments' }, kind: 'text' },
      { key: 'proponent.credit-memos.add', label: { en: 'Add record', fr: 'Ajouter un élément' }, kind: 'button' }
    ]
  },
  {
    key: 'proponent.account-receivables',
    label: { en: 'Proponent — Account receivables', fr: 'Promoteur — Comptes débiteurs' },
    targets: [
      { key: 'proponent.account-receivables.content', label: { en: 'Account receivables', fr: 'Comptes débiteurs' }, kind: 'section' },
      { key: 'proponent.account-receivables.search', label: { en: 'Search records', fr: 'Rechercher des éléments' }, kind: 'text' }
    ]
  },
  {
    key: 'proponent.funding-history-editor', discoverable: false,
    label: { en: 'Proponent — Funding history editor', fr: 'Promoteur — Éditeur de l’historique du financement' },
    targets: []
  },
  {
    key: 'proponent.funding-history-similarity', discoverable: false,
    label: { en: 'Proponent — Similar funding history', fr: 'Promoteur — Financement similaire' },
    targets: [
      { key: 'proponent.funding-history-similarity.back', label: { en: 'Return to funding history', fr: 'Retour à l’historique du financement' }, kind: 'button' },
      { key: 'proponent.funding-history-similarity.confirm', label: { en: 'Confirm funding history', fr: 'Confirmer l’historique du financement' }, kind: 'button' }
    ]
  },
  {
    key: 'intakes.list',
    label: { en: 'Intakes — List', fr: 'Dossiers de demande — Liste' },
    targets: [
      { key: 'intakes.list.records', label: { en: 'Intake records and actions', fr: 'Dossiers de demande et actions' }, kind: 'section' }
    ]
  },
  {
    key: 'intake.detail',
    label: { en: 'Intake — Detail', fr: 'Dossier de demande — Dossier' },
    targets: [
      { key: 'intake.detail.general', label: { en: 'General', fr: 'Général' }, kind: 'section' },
      { key: 'intake.detail.application', label: { en: 'Submitted application', fr: 'Demande soumise' }, kind: 'section' },
      { key: 'intake.detail.attachments', label: { en: 'Attachments', fr: 'Pièces jointes' }, kind: 'section' },
      { key: 'intake.detail.reviews', label: { en: 'Reviews', fr: 'Examens' }, kind: 'section' },
      { key: 'intake.detail.workflow', label: { en: 'Workflow', fr: 'Processus' }, kind: 'section' },
      { key: 'intake.detail.supplementary-information', label: { en: 'Supplementary information', fr: 'Renseignements supplémentaires' }, kind: 'section' },
      { key: 'intake.detail.assignments', label: { en: 'Assigned users', fr: 'Utilisateurs affectés' }, kind: 'section' },
      { key: 'intake.detail.approval', label: { en: 'Approval submission', fr: 'Soumission pour approbation' }, kind: 'section' },
      { key: 'intake.detail.section-navigation', label: { en: 'Section navigation', fr: 'Navigation entre les sections' }, kind: 'section' }
    ]
  },
  {
    key: 'intake.create', discoverable: false,
    label: { en: 'Intake — Create', fr: 'Dossier de demande — Création' },
    targets: [
      { key: 'intake.create.save', label: { en: 'Create intake', fr: 'Créer le dossier de demande' }, kind: 'button' },
      { key: 'intake.create.cancel', label: { en: 'Cancel intake creation', fr: 'Annuler la création du dossier de demande' }, kind: 'button' }
    ]
  },
  {
    key: 'casework.questionnaire',
    label: { en: 'Recommendation and Data Collection — Work and submission', fr: 'Recommandation et collecte de données — Travail et soumission' },
    targets: [
      { key: 'casework.questionnaire.claim', label: { en: 'Claim task', fr: 'Prendre en charge la tâche' }, kind: 'button' },
      { key: 'casework.questionnaire.save', label: { en: 'Save responses', fr: 'Enregistrer les réponses' }, kind: 'button' },
      { key: 'casework.questionnaire.submit', label: { en: 'Submit responses', fr: 'Soumettre les réponses' }, kind: 'button' },
      { key: 'casework.questionnaire.responses', label: { en: 'Questionnaire responses', fr: 'Réponses au questionnaire' }, kind: 'section' },
      { key: 'casework.questionnaire.approvals', label: { en: 'Approvals', fr: 'Approbations' }, kind: 'section' },
      { key: 'casework.questionnaire.assignments', label: { en: 'Assigned users', fr: 'Utilisateurs affectés' }, kind: 'section' }
    ]
  },
  {
    key: 'review.additional-reviewer-editor', discoverable: false,
    label: { en: 'Review — Additional reviewer editor', fr: 'Examen — Éditeur d’examinateur additionnel' },
    targets: [
      { key: 'review.additional-reviewer-editor.save', kind: 'button', label: { en: 'Save additional reviewer', fr: 'Enregistrer l’examinateur additionnel' } },
      { key: 'review.additional-reviewer-editor.cancel', kind: 'button', label: { en: 'Cancel reviewer changes', fr: 'Annuler les modifications de l’examinateur' } }
    ]
  },
  {
    key: 'proponent.credit-memo.detail',
    label: { en: 'Proponent — Credit memo', fr: 'Promoteur — Note de crédit' },
    targets: [
      { key: 'proponent.credit-memo.summary', label: { en: 'Credit memo summary', fr: 'Résumé de la note de crédit' }, kind: 'section' },
      { key: 'proponent.credit-memo.completion', label: { en: 'Credit memo completion', fr: 'Achèvement de la note de crédit' }, kind: 'section' },
      { key: 'proponent.credit-memo.detail.section-navigation', label: { en: 'Section navigation', fr: 'Navigation entre les sections' }, kind: 'section' }
    ]
  },
  {
    key: 'proponent.credit-memo.edit', discoverable: false,
    label: { en: 'Proponent — Edit credit memo', fr: 'Promoteur — Modifier la note de crédit' },
    targets: [
      { key: 'proponent.credit-memo.edit.save', label: { en: 'Save credit memo', fr: 'Enregistrer la note de crédit' }, kind: 'button' },
      { key: 'proponent.credit-memo.edit.cancel', label: { en: 'Cancel credit memo changes', fr: 'Annuler les modifications de la note de crédit' }, kind: 'button' }
    ]
  }
]
