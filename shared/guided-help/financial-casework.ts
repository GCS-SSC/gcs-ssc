import type { TargetLedger } from '@gcs-ssc/guided-help/contracts'

export const financialCaseworkLedger: TargetLedger = {
  formatVersion: 1,
  views: [
    {
      key: 'casework.account-receivables.detail',
      label: { en: 'Receivable — Details', fr: 'Créance — Détails' },
      targets: [
        { key: 'casework.account-receivables.detail.section-navigation', label: { en: 'Section navigation', fr: 'Navigation entre les sections' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.account-receivables.detail.is-edit-open',
      label: { en: 'Receivable — Edit', fr: 'Créance — Modifier' },
      discoverable: false,
      targets: [
        { key: 'casework.account-receivables.detail.is-edit-open.account-receivable-clear-recovery-method', label: { en: 'Clear recovery method', fr: 'Effacer le mode de recouvrement' }, kind: 'button' },
        { key: 'casework.account-receivables.detail.is-edit-open.account-receivable-clear-preference', label: { en: 'Clear recorded preference', fr: 'Effacer la préférence enregistrée' }, kind: 'button' },
        { key: 'casework.account-receivables.detail.is-edit-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.account-receivables.detail.is-edit-open.common-save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.amendments.detail',
      label: { en: 'Amendment — Details', fr: 'Modification — Détails' },
      targets: [
        { key: 'casework.amendments.detail.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' },
        { key: 'casework.amendments.detail.section-navigation', label: { en: 'Section navigation', fr: 'Navigation entre les sections' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.amendments.detail.is-cancel-modal-open',
      label: { en: 'Amendment — Cancel amendment', fr: 'Modification — Annuler la modification' },
      discoverable: false,
      targets: [
        { key: 'casework.amendments.detail.is-cancel-modal-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.amendments.detail.is-cancel-modal-open.amendments-cancel', label: { en: 'Cancel amendment', fr: 'Annuler la modification' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.claims.detail',
      label: { en: 'Claim — Details', fr: 'Demande de remboursement — Détails' },
      targets: [
        { key: 'casework.claims.detail.section-navigation', label: { en: 'Section navigation', fr: 'Navigation entre les sections' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.claims.detail.is-submission-modal-open',
      label: { en: 'Claim — Edit submitted amount', fr: 'Demande de remboursement — Modifier le montant soumis' },
      discoverable: false,
      targets: [
        { key: 'casework.claims.detail.is-submission-modal-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.claims.detail.is-submission-modal-open.common-save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.claims.detail.is-reconcile-line-modal-open',
      label: { en: 'Claim — Reconciliation line details', fr: 'Demande de remboursement — Détails de la ligne de rapprochement' },
      discoverable: false,
      targets: [
        { key: 'casework.claims.detail.is-reconcile-line-modal-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.claims.detail.is-reconcile-line-modal-open.common-save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.claims.detail.funding-editor-open',
      label: { en: 'Claim — Edit funding for this line', fr: 'Demande de remboursement — Modifier le financement de cette ligne' },
      discoverable: false,
      targets: [
        { key: 'casework.claims.detail.funding-editor-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.claims.detail.funding-editor-open.funding-sources-save', label: { en: 'Save funding', fr: 'Enregistrer le financement' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.closeouts.detail',
      label: { en: 'Closeout — Details', fr: 'Clôture — Détails' },
      targets: [
        { key: 'casework.closeouts.detail.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' },
        { key: 'casework.closeouts.detail.section-navigation', label: { en: 'Section navigation', fr: 'Navigation entre les sections' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.commitments.detail',
      label: { en: 'Commitment — Details', fr: 'Engagement — Détails' },
      targets: [
        { key: 'casework.commitments.detail.section-navigation', label: { en: 'Section navigation', fr: 'Navigation entre les sections' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.commitments.detail.is-line-modal-open',
      label: { en: 'Commitment — Update Commitment Line', fr: 'Engagement — Mettre à jour la ligne d\'engagement' },
      discoverable: false,
      targets: [
        { key: 'casework.commitments.detail.is-line-modal-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.commitments.detail.is-line-modal-open.common-update', label: { en: 'Update', fr: 'Mettre à jour' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.corrections.detail',
      label: { en: 'Correction — Details', fr: 'Correction — Détails' },
      targets: [
        { key: 'casework.corrections.detail.section-navigation', label: { en: 'Section navigation', fr: 'Navigation entre les sections' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.forecasts.detail',
      label: { en: 'Forecast — Details', fr: 'Prévision — Détails' },
      targets: [
        { key: 'casework.forecasts.detail.section-navigation', label: { en: 'Section navigation', fr: 'Navigation entre les sections' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.forecasts.detail.monthly-editor-open',
      label: { en: 'Forecast — Edit', fr: 'Prévision — Modifier' },
      discoverable: false,
      targets: [
        { key: 'casework.forecasts.detail.monthly-editor-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.forecasts.detail.monthly-editor-open.common-update', label: { en: 'Update', fr: 'Mettre à jour' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.monitors.detail',
      label: { en: 'Monitor — Details', fr: 'Surveillance — Détails' },
      targets: [
        { key: 'casework.monitors.detail.section-navigation', label: { en: 'Section navigation', fr: 'Navigation entre les sections' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.monitors.detail.is-metadata-modal-open',
      label: { en: 'Monitor — Update Monitor', fr: 'Surveillance — Mettre à jour la surveillance' },
      discoverable: false,
      targets: [
        { key: 'casework.monitors.detail.is-metadata-modal-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.monitors.detail.is-metadata-modal-open.common-save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.monitors.detail.is-planning-modal-open',
      label: { en: 'Monitor — Update Objective', fr: 'Surveillance — Mettre à jour l\'objectif' },
      discoverable: false,
      targets: [
        { key: 'casework.monitors.detail.is-planning-modal-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.monitors.detail.is-planning-modal-open.common-save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.monitors.detail.is-item-modal-open',
      label: { en: 'Monitor — Update Item', fr: 'Surveillance — Mettre à jour l\'élément' },
      discoverable: false,
      targets: [
        { key: 'casework.monitors.detail.is-item-modal-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.monitors.detail.is-item-modal-open.common-save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.monitors.detail.is-finding-modal-open',
      label: { en: 'Monitor — Update Finding', fr: 'Surveillance — Mettre à jour la constatation' },
      discoverable: false,
      targets: [
        { key: 'casework.monitors.detail.is-finding-modal-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.monitors.detail.is-finding-modal-open.common-save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.monitors.detail.is-followup-modal-open',
      label: { en: 'Monitor — Update Follow-up', fr: 'Surveillance — Mettre à jour le suivi' },
      discoverable: false,
      targets: [
        { key: 'casework.monitors.detail.is-followup-modal-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.monitors.detail.is-followup-modal-open.common-save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.monitors.detail.is-update-modal-open',
      label: { en: 'Monitor — Update Follow-up Update', fr: 'Surveillance — Mettre à jour la mise à jour de suivi' },
      discoverable: false,
      targets: [
        { key: 'casework.monitors.detail.is-update-modal-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.monitors.detail.is-update-modal-open.common-save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.monitors.detail.is-updates-view-modal-open',
      label: { en: 'Monitor — Updates for', fr: 'Surveillance — Mises à jour pour' },
      discoverable: false,
      targets: [
        { key: 'casework.monitors.detail.is-updates-view-modal-open.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.monitors.detail.is-practice-modal-open',
      label: { en: 'Monitor — Update Promising Practice', fr: 'Surveillance — Mettre à jour la pratique prometteuse' },
      discoverable: false,
      targets: [
        { key: 'casework.monitors.detail.is-practice-modal-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.monitors.detail.is-practice-modal-open.common-save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.payments.detail',
      label: { en: 'Payment — Details', fr: 'Paiement — Détails' },
      targets: [
        { key: 'casework.payments.detail.common-retry', label: { en: 'Retry', fr: 'Réessayer' }, kind: 'button' },
        { key: 'casework.payments.detail.section-navigation', label: { en: 'Section navigation', fr: 'Navigation entre les sections' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.payments.detail.is-line-modal-open',
      label: { en: 'Payment — Update Payment Line', fr: 'Paiement — Mettre à jour la ligne de paiement' },
      discoverable: false,
      targets: [
        { key: 'casework.payments.detail.is-line-modal-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.payments.detail.is-line-modal-open.common-update', label: { en: 'Update', fr: 'Mettre à jour' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.claim-reconciliations.detail',
      label: { en: 'Claim reconciliation — Details', fr: 'Rapprochement de demande — Détails' },
      targets: [
        { key: 'casework.claim-reconciliations.detail.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' },
        { key: 'casework.claim-reconciliations.detail.section-navigation', label: { en: 'Section navigation', fr: 'Navigation entre les sections' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.journal-vouchers.detail',
      label: { en: 'Journal voucher — Details', fr: 'Pièce de journal — Détails' },
      targets: [
        { key: 'casework.journal-vouchers.detail.section-navigation', label: { en: 'Section navigation', fr: 'Navigation entre les sections' }, kind: 'section' }
      ]
    },
    {
      key: 'journal-vouchers.list',
      label: { en: 'Journal vouchers', fr: 'Pièces de journal' },
      targets: [
        { key: 'journal-vouchers.list.records', label: { en: 'Record list', fr: 'Liste des dossiers' }, kind: 'section' },
        { key: 'journal-vouchers.list.search', label: { en: 'Search records', fr: 'Rechercher des dossiers' }, kind: 'text' },
        { key: 'journal-vouchers.list.add', label: { en: 'Add record', fr: 'Ajouter un dossier' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.correction.cancel-modal.open',
      label: { en: 'Cancel Correction', fr: 'Annuler la correction' },
      discoverable: false,
      targets: [
        { key: 'casework.correction.cancel-modal.open.correction-dismiss-cancellation', label: { en: 'Keep Correction open', fr: 'Garder la correction ouverte' }, kind: 'button' },
        { key: 'casework.correction.cancel-modal.open.correction-cancel', label: { en: 'Cancel Correction', fr: 'Annuler la correction' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.correction.collection',
      label: { en: 'Agreement — Corrections', fr: 'Entente — Corrections' },
      targets: [
        { key: 'casework.correction.collection.records', label: { en: 'Record list', fr: 'Liste des dossiers' }, kind: 'section' },
        { key: 'casework.correction.collection.correction-export-label', label: { en: 'Export Corrections', fr: 'Exporter les corrections' }, kind: 'button' },
        { key: 'casework.correction.collection.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' },
        { key: 'casework.correction.collection.search', label: { en: 'Search records', fr: 'Rechercher des dossiers' }, kind: 'text' },
        { key: 'casework.correction.collection.add', label: { en: 'Add record', fr: 'Ajouter un dossier' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.correction.create-modal.open',
      label: { en: 'Correction — Dialog', fr: 'Correction — Boîte de dialogue' },
      discoverable: false,
      targets: [
        { key: 'casework.correction.create-modal.open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.correction.create-modal.open.correction-create', label: { en: 'Create Correction', fr: 'Créer une correction' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.account-receivable.claim-reductions.is-modal-open',
      label: { en: 'Edit Claim reduction', fr: 'Modifier la réduction de la demande' },
      discoverable: false,
      targets: [
        { key: 'casework.account-receivable.claim-reductions.is-modal-open.common-retry', label: { en: 'Retry', fr: 'Réessayer' }, kind: 'button' },
        { key: 'casework.account-receivable.claim-reductions.is-modal-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.account-receivable.claim-reductions.is-modal-open.common-save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.account-receivable.collection',
      label: { en: 'Agreement — Receivables', fr: 'Entente — Créances' },
      targets: [
        { key: 'casework.account-receivable.collection.records', label: { en: 'Record list', fr: 'Liste des dossiers' }, kind: 'section' },
        { key: 'casework.account-receivable.collection.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' },
        { key: 'casework.account-receivable.collection.search', label: { en: 'Search records', fr: 'Rechercher des dossiers' }, kind: 'text' },
        { key: 'casework.account-receivable.collection.add', label: { en: 'Add record', fr: 'Ajouter un dossier' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.account-receivable.create-modal.open',
      label: { en: 'Receivable — Dialog', fr: 'Créance — Boîte de dialogue' },
      discoverable: false,
      targets: [
        { key: 'casework.account-receivable.create-modal.open.account-receivable-clear-recovery-method', label: { en: 'Clear recovery method', fr: 'Effacer le mode de recouvrement' }, kind: 'button' },
        { key: 'casework.account-receivable.create-modal.open.account-receivable-clear-preference', label: { en: 'Clear recorded preference', fr: 'Effacer la préférence enregistrée' }, kind: 'button' },
        { key: 'casework.account-receivable.create-modal.open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.account-receivable.create-modal.open.save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.account-receivable.credit-memo-create-modal.open',
      label: { en: 'Create credit memo', fr: 'Créer une note de crédit' },
      discoverable: false,
      targets: [
        { key: 'casework.account-receivable.credit-memo-create-modal.open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.account-receivable.credit-memo-create-modal.open.account-receivable-create-credit-memo', label: { en: 'Create credit memo', fr: 'Créer une note de crédit' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.account-receivable.credit-memo-lines.is-open',
      label: { en: 'Receivable — Dialog', fr: 'Créance — Boîte de dialogue' },
      discoverable: false,
      targets: [
        { key: 'casework.account-receivable.credit-memo-lines.is-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.account-receivable.credit-memo-lines.is-open.save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.account-receivable.detail-lines.is-open',
      label: { en: 'Receivable — Dialog', fr: 'Créance — Boîte de dialogue' },
      discoverable: false,
      targets: [
        { key: 'casework.account-receivable.detail-lines.is-open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.account-receivable.detail-lines.is-open.save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.journal-voucher.allocation-modal.open',
      label: { en: 'Journal voucher — Dialog', fr: 'Pièce de journal — Boîte de dialogue' },
      discoverable: false,
      targets: [
        { key: 'casework.journal-voucher.allocation-modal.open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.journal-voucher.allocation-modal.open.journal-voucher-apply-split', label: { en: 'Apply split', fr: 'Appliquer la répartition' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.journal-voucher.create-modal.open',
      label: { en: 'Create Journal Voucher', fr: 'Créer une pièce de journal' },
      discoverable: false,
      targets: [
        { key: 'casework.journal-voucher.create-modal.open.common-cancel', label: { en: 'Cancel', fr: 'Annuler' }, kind: 'button' },
        { key: 'casework.journal-voucher.create-modal.open.common-save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.forecasts.breakdown',
      label: { en: 'Forecast — Forecast Breakdown', fr: 'Prévision — Ventilation de la prévision' },
      targets: [
        { key: 'casework.forecasts.breakdown.records', label: { en: 'Record list', fr: 'Liste des dossiers' }, kind: 'section' },
        { key: 'casework.forecasts.detail.forecasts-save-breakdown', label: { en: 'Save forecast', fr: 'Enregistrer la prévision' }, kind: 'button' },
        { key: 'casework.forecasts.breakdown.search', label: { en: 'Search records', fr: 'Rechercher des dossiers' }, kind: 'text' }
      ]
    },
    {
      key: 'casework.forecasts.completion',
      label: { en: 'Forecast — Forecast completion', fr: 'Prévision — Achèvement de la prévision' },
      targets: [
        { key: 'casework.forecasts.detail.completion', label: { en: 'Completion', fr: 'Achèvement' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.forecasts.reviews',
      label: { en: 'Forecast — Reviews', fr: 'Prévision — Examens' },
      targets: []
    },
    {
      key: 'casework.forecasts.workflows',
      label: { en: 'Forecast — Workflows', fr: 'Prévision — Processus' },
      targets: []
    },
    {
      key: 'casework.forecasts.supplementary-information',
      label: { en: 'Forecast — Supplementary', fr: 'Prévision — Supplémentaire' },
      targets: [
        { key: 'casework.forecasts.supplementary-information.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }]
    },
    {
      key: 'casework.forecasts.attachments',
      label: { en: 'Forecast — Attachments', fr: 'Prévision — Pièces jointes' },
      targets: []
    },
    {
      key: 'casework.forecasts.assignments',
      label: { en: 'Forecast — Assigned users', fr: 'Prévision — Utilisateurs affectés' },
      targets: []
    },
    {
      key: 'casework.closeouts.workflow',
      label: { en: 'Closeout — Closeout workflow', fr: 'Clôture — Processus de clôture' },
      targets: [
        { key: 'casework.closeouts.detail.workflow', label: { en: 'Workflow', fr: 'Processus' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.closeouts.reviews',
      label: { en: 'Closeout — Reviews', fr: 'Clôture — Examens' },
      targets: []
    },
    {
      key: 'casework.closeouts.workflows',
      label: { en: 'Closeout — Workflows', fr: 'Clôture — Processus' },
      targets: []
    },
    {
      key: 'casework.closeouts.supplementary-information',
      label: { en: 'Closeout — Supplementary', fr: 'Clôture — Supplémentaire' },
      targets: [
        { key: 'casework.closeouts.supplementary-information.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }]
    },
    {
      key: 'casework.closeouts.documents',
      label: { en: 'Closeout — Documents', fr: 'Clôture — Documents' },
      targets: [
        { key: 'casework.closeouts.detail.documents', label: { en: 'Documents', fr: 'Documents' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.closeouts.snapshots',
      label: { en: 'Closeout — Readiness snapshots', fr: 'Clôture — Instantanés de préparation' },
      targets: [
        { key: 'casework.closeouts.detail.snapshots', label: { en: 'Snapshots', fr: 'Instantanés' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.closeouts.attachments',
      label: { en: 'Closeout — Attachments', fr: 'Clôture — Pièces jointes' },
      targets: []
    },
    {
      key: 'casework.closeouts.assignments',
      label: { en: 'Closeout — Assigned users', fr: 'Clôture — Utilisateurs affectés' },
      targets: []
    },
    {
      key: 'casework.claims.submission',
      label: { en: 'Claim — Submission', fr: 'Demande de remboursement — Soumission' },
      targets: [
        { key: 'casework.claims.submission.records', label: { en: 'Record list', fr: 'Liste des dossiers' }, kind: 'section' },
        { key: 'casework.claims.detail.withdraw-claim', label: { en: 'Withdraw claim', fr: 'Retirer la demande' }, kind: 'button' },
        { key: 'casework.claims.detail.cancel-claim', label: { en: 'Cancel claim', fr: 'Annuler la demande' }, kind: 'button' },
        { key: 'casework.claims.submission.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' },
        { key: 'casework.claims.submission.search', label: { en: 'Search records', fr: 'Rechercher des dossiers' }, kind: 'text' }
      ]
    },
    {
      key: 'casework.claims.reviews',
      label: { en: 'Claim — Reviews', fr: 'Demande de remboursement — Examens' },
      targets: []
    },
    {
      key: 'casework.claims.workflows',
      label: { en: 'Claim — Workflows', fr: 'Demande de remboursement — Processus' },
      targets: []
    },
    {
      key: 'casework.claims.supplementary-information',
      label: { en: 'Claim — Supplementary', fr: 'Demande de remboursement — Supplémentaire' },
      targets: [
        { key: 'casework.claims.supplementary-information.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }]
    },
    {
      key: 'casework.claims.reconciliation',
      label: { en: 'Claim — Reconciliation', fr: 'Demande de remboursement — Rapprochement' },
      targets: [
        { key: 'casework.claims.detail.reconciliation', label: { en: 'Reconciliation', fr: 'Rapprochement' }, kind: 'section' },
        { key: 'casework.claims.detail.claims-new-reconcile-with-context', label: { en: 'Create a new reconciliation for this claim', fr: 'Créer un nouveau rapprochement pour cette demande de remboursement' }, kind: 'button' },
        { key: 'casework.claims.detail.claims-cancel-reconcile', label: { en: 'Cancel reconciliation', fr: 'Annuler le rapprochement' }, kind: 'button' },
        { key: 'casework.claims.detail.claims-save-reconcile', label: { en: 'Save reconciliation', fr: 'Enregistrer le rapprochement' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.claims.assignments',
      label: { en: 'Claim — Assigned users', fr: 'Demande de remboursement — Utilisateurs affectés' },
      targets: []
    },
    {
      key: 'casework.claims.attachments',
      label: { en: 'Claim — Attachments', fr: 'Demande de remboursement — Pièces jointes' },
      targets: []
    },
    {
      key: 'casework.corrections.lines',
      label: { en: 'Correction — Financial Lines', fr: 'Correction — Lignes financières' },
      targets: [
        { key: 'casework.corrections.detail.common-save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.corrections.basis',
      label: { en: 'Correction — Captured financial basis', fr: 'Correction — Base financière conservée' },
      targets: [
        { key: 'casework.corrections.basis.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }]
    },
    {
      key: 'casework.corrections.completion',
      label: { en: 'Correction — Correction Completion', fr: 'Correction — Achèvement de la correction' },
      targets: [
        { key: 'casework.corrections.detail.completion', label: { en: 'Completion', fr: 'Achèvement' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.corrections.reviews',
      label: { en: 'Correction — Reviews', fr: 'Correction — Examens' },
      targets: []
    },
    {
      key: 'casework.corrections.workflows',
      label: { en: 'Correction — Workflows', fr: 'Correction — Processus' },
      targets: []
    },
    {
      key: 'casework.corrections.supplementary-information',
      label: { en: 'Correction — Supplementary', fr: 'Correction — Supplémentaire' },
      targets: [
        { key: 'casework.corrections.supplementary-information.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }]
    },
    {
      key: 'casework.corrections.attachments',
      label: { en: 'Correction — Attachments', fr: 'Correction — Pièces jointes' },
      targets: []
    },
    {
      key: 'casework.corrections.assignments',
      label: { en: 'Correction — Assigned users', fr: 'Correction — Utilisateurs affectés' },
      targets: []
    },
    {
      key: 'casework.monitors.planning',
      label: { en: 'Monitor — Planning', fr: 'Surveillance — Planification' },
      targets: [
        { key: 'casework.monitors.planning.records', label: { en: 'Record list', fr: 'Liste des dossiers' }, kind: 'section' },
        { key: 'casework.monitors.detail.planning', label: { en: 'Planning', fr: 'Planification' }, kind: 'section' },
        { key: 'casework.monitors.planning.search', label: { en: 'Search records', fr: 'Rechercher des dossiers' }, kind: 'text' },
        { key: 'casework.monitors.planning.add', label: { en: 'Add record', fr: 'Ajouter un dossier' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.monitors.items',
      label: { en: 'Monitor — Monitor items', fr: 'Surveillance — Éléments de surveillance' },
      targets: [
        { key: 'casework.monitors.items.records', label: { en: 'Record list', fr: 'Liste des dossiers' }, kind: 'section' },
        { key: 'casework.monitors.detail.items', label: { en: 'Items', fr: 'Éléments' }, kind: 'section' },
        { key: 'casework.monitors.detail.items-add', label: { en: 'Add Item', fr: 'Ajouter un élément' }, kind: 'button' },
        { key: 'casework.monitors.items.search', label: { en: 'Search records', fr: 'Rechercher des dossiers' }, kind: 'text' }
      ]
    },
    {
      key: 'casework.monitors.findings',
      label: { en: 'Monitor — Findings', fr: 'Surveillance — Constatations' },
      targets: [
        { key: 'casework.monitors.findings.records', label: { en: 'Record list', fr: 'Liste des dossiers' }, kind: 'section' },
        { key: 'casework.monitors.detail.findings', label: { en: 'Findings', fr: 'Constatations' }, kind: 'section' },
        { key: 'casework.monitors.detail.findings-add', label: { en: 'Add Finding', fr: 'Ajouter une constatation' }, kind: 'button' },
        { key: 'casework.monitors.findings.search', label: { en: 'Search records', fr: 'Rechercher des dossiers' }, kind: 'text' }
      ]
    },
    {
      key: 'casework.monitors.followups',
      label: { en: 'Monitor — Follow-ups', fr: 'Surveillance — Suivis' },
      targets: [
        { key: 'casework.monitors.followups.records', label: { en: 'Record list', fr: 'Liste des dossiers' }, kind: 'section' },
        { key: 'casework.monitors.detail.followups', label: { en: 'Follow-ups', fr: 'Suivis' }, kind: 'section' },
        { key: 'casework.monitors.detail.followups-add', label: { en: 'Add Follow-up', fr: 'Ajouter un suivi' }, kind: 'button' },
        { key: 'casework.monitors.followups.search', label: { en: 'Search records', fr: 'Rechercher des dossiers' }, kind: 'text' }
      ]
    },
    {
      key: 'casework.monitors.promising-practices',
      label: { en: 'Monitor — Promising practices', fr: 'Surveillance — Pratiques prometteuses' },
      targets: [
        { key: 'casework.monitors.promising-practices.records', label: { en: 'Record list', fr: 'Liste des dossiers' }, kind: 'section' },
        { key: 'casework.monitors.promising-practices.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' },
        { key: 'casework.monitors.promising-practices.search', label: { en: 'Search records', fr: 'Rechercher des dossiers' }, kind: 'text' },
        { key: 'casework.monitors.promising-practices.add', label: { en: 'Add record', fr: 'Ajouter un dossier' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.monitors.workflow',
      label: { en: 'Monitor — Completion & approvals', fr: 'Surveillance — Achèvement et approbations' },
      targets: [
        { key: 'casework.monitors.detail.workflow', label: { en: 'Workflow', fr: 'Processus' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.monitors.reviews',
      label: { en: 'Monitor — Reviews', fr: 'Surveillance — Examens' },
      targets: []
    },
    {
      key: 'casework.monitors.workflows',
      label: { en: 'Monitor — Workflows', fr: 'Surveillance — Processus' },
      targets: []
    },
    {
      key: 'casework.monitors.supplementary-information',
      label: { en: 'Monitor — Supplementary', fr: 'Surveillance — Supplémentaire' },
      targets: [
        { key: 'casework.monitors.supplementary-information.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }]
    },
    {
      key: 'casework.monitors.assignments',
      label: { en: 'Monitor — Assigned users', fr: 'Surveillance — Utilisateurs affectés' },
      targets: []
    },
    {
      key: 'casework.monitors.attachments',
      label: { en: 'Monitor — Attachments', fr: 'Surveillance — Pièces jointes' },
      targets: []
    },
    {
      key: 'casework.commitments.lines',
      label: { en: 'Commitment — Commitment lines', fr: 'Engagement — Lignes d\'engagement' },
      targets: [
        { key: 'casework.commitments.lines.records', label: { en: 'Record list', fr: 'Liste des dossiers' }, kind: 'section' },
        { key: 'casework.commitments.lines.search', label: { en: 'Search records', fr: 'Rechercher des dossiers' }, kind: 'text' },
        { key: 'casework.commitments.lines.add', label: { en: 'Add record', fr: 'Ajouter un dossier' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.commitments.completion',
      label: { en: 'Commitment — Commitment completion', fr: 'Engagement — Achèvement de l\'engagement' },
      targets: [
        { key: 'casework.commitments.detail.completion', label: { en: 'Completion', fr: 'Achèvement' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.commitments.reviews',
      label: { en: 'Commitment — Reviews', fr: 'Engagement — Examens' },
      targets: []
    },
    {
      key: 'casework.commitments.workflows',
      label: { en: 'Commitment — Workflows', fr: 'Engagement — Processus' },
      targets: []
    },
    {
      key: 'casework.commitments.supplementary-information',
      label: { en: 'Commitment — Supplementary', fr: 'Engagement — Supplémentaire' },
      targets: [
        { key: 'casework.commitments.supplementary-information.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }]
    },
    {
      key: 'casework.commitments.attachments',
      label: { en: 'Commitment — Attachments', fr: 'Engagement — Pièces jointes' },
      targets: []
    },
    {
      key: 'casework.commitments.assignments',
      label: { en: 'Commitment — Assigned users', fr: 'Engagement — Utilisateurs affectés' },
      targets: []
    },
    {
      key: 'casework.payments.lines',
      label: { en: 'Payment — Payment lines', fr: 'Paiement — Lignes de paiement' },
      targets: [
        { key: 'casework.payments.lines.records', label: { en: 'Record list', fr: 'Liste des dossiers' }, kind: 'section' },
        { key: 'casework.payments.detail.open-create-line', label: { en: 'Add payment line', fr: 'Ajouter une ligne de paiement' }, kind: 'button' },
        { key: 'casework.payments.lines.search', label: { en: 'Search records', fr: 'Rechercher des dossiers' }, kind: 'text' }
      ]
    },
    {
      key: 'casework.payments.payment-evidence',
      label: { en: 'Payment — Payment evidence', fr: 'Paiement — Pièces justificatives du paiement' },
      targets: [
        { key: 'casework.payments.payment-evidence.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }]
    },
    {
      key: 'casework.payments.completion',
      label: { en: 'Payment — Payment completion', fr: 'Paiement — Achèvement du paiement' },
      targets: [
        { key: 'casework.payments.detail.completion', label: { en: 'Completion', fr: 'Achèvement' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.payments.reviews',
      label: { en: 'Payment — Reviews', fr: 'Paiement — Examens' },
      targets: []
    },
    {
      key: 'casework.payments.workflows',
      label: { en: 'Payment — Workflows', fr: 'Paiement — Processus' },
      targets: []
    },
    {
      key: 'casework.payments.supplementary-information',
      label: { en: 'Payment — Supplementary', fr: 'Paiement — Supplémentaire' },
      targets: [
        { key: 'casework.payments.supplementary-information.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }]
    },
    {
      key: 'casework.payments.attachments',
      label: { en: 'Payment — Attachments', fr: 'Paiement — Pièces jointes' },
      targets: []
    },
    {
      key: 'casework.payments.assignments',
      label: { en: 'Payment — Assigned users', fr: 'Paiement — Utilisateurs affectés' },
      targets: []
    },
    {
      key: 'casework.amendments.general',
      label: { en: 'Amendment — General', fr: 'Modification — Général' },
      targets: [
        { key: 'casework.amendments.detail.common-retry', label: { en: 'Retry', fr: 'Réessayer' }, kind: 'button' },
        { key: 'casework.amendments.detail.common-clear', label: { en: 'Clear value', fr: 'Effacer la valeur' }, kind: 'button' },
        { key: 'casework.amendments.detail.amendments-save-risk', label: { en: 'Save risk proposal', fr: 'Enregistrer la proposition de risque' }, kind: 'button' },
        { key: 'casework.amendments.detail.amendments-cancel', label: { en: 'Cancel amendment', fr: 'Annuler la modification' }, kind: 'button' },
        { key: 'casework.amendments.detail.common-save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' },
        { key: 'casework.amendments.general.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.amendments.budget',
      label: { en: 'Amendment — Budget', fr: 'Modification — Budget' },
      targets: [
        { key: 'casework.amendments.detail.amendments-create-budget-snapshot', label: { en: 'Create from current budget', fr: 'Créer à partir du budget actuel' }, kind: 'button' },
        { key: 'casework.amendments.budget.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.amendments.activities',
      label: { en: 'Amendment — Activities', fr: 'Modification — Activités' },
      targets: [
        { key: 'casework.amendments.detail.amendments-create-activity-snapshot', label: { en: 'Create from current activities', fr: 'Créer à partir des activités actuelles' }, kind: 'button' },
        { key: 'casework.amendments.activities.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.amendments.recommendation',
      label: { en: 'Amendment — Recommendation', fr: 'Modification — Recommandation' },
      targets: [
        { key: 'casework.amendments.recommendation.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.amendments.risk-rating',
      label: { en: 'Amendment — Risk Rating', fr: 'Modification — Évaluation du risque' },
      targets: [
        { key: 'casework.amendments.risk-rating.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.amendments.reviews',
      label: { en: 'Amendment — Reviews', fr: 'Modification — Examens' },
      targets: []
    },
    {
      key: 'casework.amendments.workflows',
      label: { en: 'Amendment — Workflows', fr: 'Modification — Processus' },
      targets: []
    },
    {
      key: 'casework.amendments.supplementary-information',
      label: { en: 'Amendment — Supplementary', fr: 'Modification — Supplémentaire' },
      targets: [
        { key: 'casework.amendments.supplementary-information.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }]
    },
    {
      key: 'casework.amendments.assignments',
      label: { en: 'Amendment — Assigned users', fr: 'Modification — Utilisateurs affectés' },
      targets: []
    },
    {
      key: 'casework.amendments.documents',
      label: { en: 'Amendment — Documents', fr: 'Modification — Documents' },
      targets: [
        { key: 'casework.amendments.documents.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }]
    },
    {
      key: 'casework.amendments.attachments',
      label: { en: 'Amendment — Attachments', fr: 'Modification — Pièces jointes' },
      targets: []
    },
    {
      key: 'casework.account-receivables.lines',
      label: { en: 'Receivable — Receivable Lines', fr: 'Créance — Lignes du compte débiteur' },
      targets: []
    },
    {
      key: 'casework.account-receivables.summary',
      label: { en: 'Receivable — Receivable summary', fr: 'Créance — Sommaire du compte débiteur' },
      targets: [
        { key: 'casework.account-receivables.summary.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.account-receivables.adjustments',
      label: { en: 'Receivable — Receivable adjustments', fr: 'Créance — Ajustements de la créance' },
      targets: [
        { key: 'casework.account-receivables.detail.account-receivable-create-credit-memo', label: { en: 'Create credit memo', fr: 'Créer une note de crédit' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.account-receivables.completion',
      label: { en: 'Receivable — Receivable completion', fr: 'Créance — Achèvement du compte débiteur' },
      targets: [
        { key: 'casework.account-receivables.detail.completion', label: { en: 'Completion', fr: 'Achèvement' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.account-receivables.claim-reductions',
      label: { en: 'Receivable — Claim reconciliation', fr: 'Créance — Rapprochement de demande de remboursement' },
      targets: []
    },
    {
      key: 'casework.account-receivables.reviews',
      label: { en: 'Receivable — Reviews', fr: 'Créance — Examens' },
      targets: []
    },
    {
      key: 'casework.account-receivables.workflows',
      label: { en: 'Receivable — Workflows', fr: 'Créance — Processus' },
      targets: []
    },
    {
      key: 'casework.account-receivables.supplementary-information',
      label: { en: 'Receivable — Supplementary', fr: 'Créance — Supplémentaire' },
      targets: [
        { key: 'casework.account-receivables.supplementary-information.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }]
    },
    {
      key: 'casework.account-receivables.attachments',
      label: { en: 'Receivable — Attachments', fr: 'Créance — Pièces jointes' },
      targets: []
    },
    {
      key: 'casework.account-receivables.assignments',
      label: { en: 'Receivable — Assigned users', fr: 'Créance — Utilisateurs affectés' },
      targets: []
    },
    {
      key: 'casework.claim-reconciliations.reconciliation',
      label: { en: 'Claim reconciliation — Read-only access', fr: 'Rapprochement de demande — Accès en lecture seule' },
      targets: [
        { key: 'casework.claim-reconciliations.detail.claims-save-reconcile', label: { en: 'Save reconciliation', fr: 'Enregistrer le rapprochement' }, kind: 'button' },
        { key: 'casework.claim-reconciliations.detail.claims-cancel-reconcile', label: { en: 'Cancel reconciliation', fr: 'Annuler le rapprochement' }, kind: 'button' },

        { key: 'casework.claim-reconciliations.reconciliation.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }]
    },
    {
      key: 'casework.claim-reconciliations.completion',
      label: { en: 'Claim reconciliation — Reconciliation completion', fr: 'Rapprochement de demande — Achèvement du rapprochement' },
      targets: []
    },
    {
      key: 'casework.claim-reconciliations.reviews',
      label: { en: 'Claim reconciliation — Reviews', fr: 'Rapprochement de demande — Examens' },
      targets: []
    },
    {
      key: 'casework.claim-reconciliations.workflows',
      label: { en: 'Claim reconciliation — Workflows', fr: 'Rapprochement de demande — Processus' },
      targets: [
        { key: 'casework.claim-reconciliations.detail.workflows', label: { en: 'Workflows', fr: 'Processus' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.claim-reconciliations.supplementary-information',
      label: { en: 'Claim reconciliation — Supplementary', fr: 'Rapprochement de demande — Supplémentaire' },
      targets: [
        { key: 'casework.claim-reconciliations.supplementary-information.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }]
    },
    {
      key: 'casework.claim-reconciliations.attachments',
      label: { en: 'Claim reconciliation — Attachments', fr: 'Rapprochement de demande — Pièces jointes' },
      targets: []
    },
    {
      key: 'casework.claim-reconciliations.assignments',
      label: { en: 'Claim reconciliation — Assigned users', fr: 'Rapprochement de demande — Utilisateurs affectés' },
      targets: []
    },
    {
      key: 'casework.journal-vouchers.entry',
      label: { en: 'Journal voucher — Accounting Entry', fr: 'Pièce de journal — Écriture comptable' },
      targets: [
        { key: 'casework.journal-vouchers.detail.journal-voucher-reverse', label: { en: 'Prepare reversal', fr: 'Préparer une contrepassation' }, kind: 'button' },
        { key: 'casework.journal-vouchers.detail.journal-voucher-replace', label: { en: 'Prepare replacement correction', fr: 'Préparer une correction de remplacement' }, kind: 'button' },
        { key: 'casework.journal-vouchers.detail.journal-voucher-add-split', label: { en: 'Add allocation split', fr: 'Ajouter une répartition' }, kind: 'button' },
        { key: 'casework.journal-vouchers.detail.common-save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' }
      ]
    },
    {
      key: 'casework.journal-vouchers.completion',
      label: { en: 'Journal voucher — JV Completion', fr: 'Pièce de journal — Achèvement de la pièce de journal' },
      targets: [
        { key: 'casework.journal-vouchers.detail.completion', label: { en: 'Completion', fr: 'Achèvement' }, kind: 'section' }
      ]
    },
    {
      key: 'casework.journal-vouchers.reviews',
      label: { en: 'Journal voucher — Reviews', fr: 'Pièce de journal — Examens' },
      targets: []
    },
    {
      key: 'casework.journal-vouchers.workflows',
      label: { en: 'Journal voucher — Workflows', fr: 'Pièce de journal — Processus' },
      targets: []
    },
    {
      key: 'casework.journal-vouchers.supplementary-information',
      label: { en: 'Journal voucher — Supplementary', fr: 'Pièce de journal — Supplémentaire' },
      targets: [
        { key: 'casework.journal-vouchers.supplementary-information.content', label: { en: 'Screen content', fr: 'Contenu de l’écran' }, kind: 'section' }]
    },
    {
      key: 'casework.journal-vouchers.attachments',
      label: { en: 'Journal voucher — Attachments', fr: 'Pièce de journal — Pièces jointes' },
      targets: []
    },
    {
      key: 'casework.journal-vouchers.assignments',
      label: { en: 'Journal voucher — Assigned users', fr: 'Pièce de journal — Utilisateurs affectés' },
      targets: []
    },
    {
      key: 'casework.correction.approval',
      label: { en: 'Correction — Approval', fr: 'Correction — Approbation' },
      targets: []
    },
    {
      key: 'casework.account-receivable.approval',
      label: { en: 'Receivable — Approval', fr: 'Créance — Approbation' },
      targets: []
    },
    {
      key: 'casework.account-receivable.credit-memo-approval',
      label: { en: 'Credit memo — Approval', fr: 'Note de crédit — Approbation' },
      targets: []
    }
  ]
}
