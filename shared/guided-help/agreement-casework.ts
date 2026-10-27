import type { TargetLedger } from '@gcs-ssc/guided-help/contracts'

export const agreementCaseworkLedger: TargetLedger = {
  formatVersion: 1,
  views: [
    {
      key: 'agreement.general',
      label: {
        en: 'Agreements — General',
        fr: 'Ententes — Général'
      },
      targets: [
        {
          key: 'agreement.general.content',
          label: {
            en: 'General',
            fr: 'Général'
          },
          kind: 'section'
        },
        {
          key: 'agreement.general.sections-classification',
          label: {
            en: 'Classification',
            fr: 'Classification'
          },
          kind: 'section'
        },
        {
          key: 'agreement.general.open',
          label: {
            en: 'Open record',
            fr: 'Ouvrir le dossier'
          },
          kind: 'navigation'
        },
        {
          key: 'agreement.general.sections-profile',
          label: {
            en: 'Profile',
            fr: 'Profil'
          },
          kind: 'section'
        },
        {
          key: 'agreement.general.sections-risk-management',
          label: {
            en: 'Risk Management',
            fr: 'Gestion des risques'
          },
          kind: 'section'
        }
      ]
    },
    {
      key: 'agreement.addresses',
      label: {
        en: 'Agreements — Addresses',
        fr: 'Ententes — Adresses'
      },
      targets: [
        {
          key: 'agreement.addresses.content',
          label: {
            en: 'Addresses',
            fr: 'Adresses'
          },
          kind: 'section'
        },
        {
          key: 'agreement.addresses.search',
          label: {
            en: 'Search',
            fr: 'Rechercher'
          },
          kind: 'text'
        },
        {
          key: 'agreement.addresses.add',
          label: {
            en: 'Add',
            fr: 'Ajouter'
          },
          kind: 'button',
          completion: {
            kind: 'success',
            action: 'modal-open'
          }
        },
        {
          key: 'agreement.addresses.save',
          label: {
            en: 'Save',
            fr: 'Enregistrer'
          },
          kind: 'button',
          completion: {
            kind: 'success',
            action: 'save-success'
          }
        }
      ]
    },
    {
      key: 'agreement.notes',
      label: {
        en: 'Agreements — Notes to file',
        fr: 'Ententes — Notes au dossier'
      },
      targets: [
        {
          key: 'agreement.notes.content',
          label: {
            en: 'Notes to file',
            fr: 'Notes au dossier'
          },
          kind: 'section'
        },
        {
          key: 'agreement.notes.search',
          label: {
            en: 'Search',
            fr: 'Rechercher'
          },
          kind: 'text'
        },
        {
          key: 'agreement.notes.add',
          label: {
            en: 'Add',
            fr: 'Ajouter'
          },
          kind: 'button',
          completion: {
            kind: 'success',
            action: 'modal-open'
          }
        },
        {
          key: 'agreement.notes.save',
          label: {
            en: 'Save',
            fr: 'Enregistrer'
          },
          kind: 'button',
          completion: {
            kind: 'success',
            action: 'save-success'
          }
        }
      ]
    },
    {
      key: 'agreement.applicant-recipients',
      label: {
        en: 'Agreements — Proponents',
        fr: 'Ententes — Promoteurs'
      },
      targets: [
        {
          key: 'agreement.applicant-recipients.content',
          label: {
            en: 'Proponents',
            fr: 'Promoteurs'
          },
          kind: 'section'
        },
        {
          key: 'agreement.applicant-recipients.search',
          label: {
            en: 'Search',
            fr: 'Rechercher'
          },
          kind: 'text'
        },
        {
          key: 'agreement.applicant-recipients.add',
          label: {
            en: 'Add',
            fr: 'Ajouter'
          },
          kind: 'button',
          completion: {
            kind: 'success',
            action: 'modal-open'
          }
        },
        {
          key: 'agreement.applicant-recipients.save',
          label: {
            en: 'Save',
            fr: 'Enregistrer'
          },
          kind: 'button',
          completion: {
            kind: 'success',
            action: 'save-success'
          }
        }
      ]
    },
    {
      key: 'agreement.budget',
      label: {
        en: 'Agreements — Budget',
        fr: 'Ententes — Budget'
      },
      targets: [
        {
          key: 'agreement.budget.content',
          label: {
            en: 'Budget',
            fr: 'Budget'
          },
          kind: 'section'
        },
        {
          key: 'agreement.budget.search',
          label: {
            en: 'Search',
            fr: 'Rechercher'
          },
          kind: 'text'
        },
        {
          key: 'agreement.budget.add',
          label: {
            en: 'Add',
            fr: 'Ajouter'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.budget.fiscal-year-dialog',
      label: {
        en: 'Agreements — Fiscal year editor',
        fr: 'Ententes — Éditeur d’exercice financier'
      },
      discoverable: false,
      targets: [
        {
          key: 'agreement.budget.fiscal-year-dialog.cancel',
          label: {
            en: 'Cancel',
            fr: 'Annuler'
          },
          kind: 'button'
        },
        {
          key: 'agreement.budget.fiscal-year-dialog.save',
          label: {
            en: 'Save',
            fr: 'Enregistrer'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.budget.line-item-dialog',
      label: {
        en: 'Agreements — Line item editor',
        fr: 'Ententes — Éditeur de ligne budgétaire'
      },
      discoverable: false,
      targets: [
        {
          key: 'agreement.budget.line-item-dialog.cancel',
          label: {
            en: 'Cancel',
            fr: 'Annuler'
          },
          kind: 'button'
        },
        {
          key: 'agreement.budget.line-item-dialog.save',
          label: {
            en: 'Save',
            fr: 'Enregistrer'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.budget.funding-source-dialog',
      label: {
        en: 'Agreements — Funding source editor',
        fr: 'Ententes — Éditeur de source de financement'
      },
      discoverable: false,
      targets: [
        {
          key: 'agreement.budget.funding-source-dialog.cancel',
          label: {
            en: 'Cancel',
            fr: 'Annuler'
          },
          kind: 'button'
        },
        {
          key: 'agreement.budget.funding-source-dialog.save',
          label: {
            en: 'Save',
            fr: 'Enregistrer'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.financial-summary',
      label: {
        en: 'Agreements — Financial summary',
        fr: 'Ententes — Sommaire financier'
      },
      targets: [
        {
          key: 'agreement.financial-summary.content',
          label: {
            en: 'Financial summary',
            fr: 'Sommaire financier'
          },
          kind: 'section'
        },
        {
          key: 'agreement.financial-summary.retry',
          label: {
            en: 'Retry',
            fr: 'Réessayer'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.commitments',
      label: {
        en: 'Agreements — Commitments',
        fr: 'Ententes — Engagements'
      },
      targets: [
        {
          key: 'agreement.commitments.content',
          label: {
            en: 'Commitments',
            fr: 'Engagements'
          },
          kind: 'section'
        },
        {
          key: 'agreement.commitments.search',
          label: {
            en: 'Search',
            fr: 'Rechercher'
          },
          kind: 'text'
        },
        {
          key: 'agreement.commitments.add',
          label: {
            en: 'Add',
            fr: 'Ajouter'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.commitments.commitment-dialog',
      label: {
        en: 'Agreements — Commitment editor',
        fr: 'Ententes — Éditeur d’engagement'
      },
      discoverable: false,
      targets: [
        {
          key: 'agreement.commitments.commitment-dialog.cancel',
          label: {
            en: 'Cancel',
            fr: 'Annuler'
          },
          kind: 'button'
        },
        {
          key: 'agreement.commitments.commitment-dialog.save',
          label: {
            en: 'Save',
            fr: 'Enregistrer'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.payments',
      label: {
        en: 'Agreements — Payments',
        fr: 'Ententes — Paiements'
      },
      targets: [
        {
          key: 'agreement.payments.content',
          label: {
            en: 'Payments',
            fr: 'Paiements'
          },
          kind: 'section'
        },
        {
          key: 'agreement.payments.search',
          label: {
            en: 'Search',
            fr: 'Rechercher'
          },
          kind: 'text'
        },
        {
          key: 'agreement.payments.add',
          label: {
            en: 'Add',
            fr: 'Ajouter'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.payments.payment-dialog',
      label: {
        en: 'Agreements — Payment editor',
        fr: 'Ententes — Éditeur de paiement'
      },
      discoverable: false,
      targets: [
        {
          key: 'agreement.payments.payment-dialog.payments-wizard-recheck',
          label: {
            en: 'Recheck offset credit memos',
            fr: 'Revérifier les notes de crédit par compensation'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.forecasts',
      label: {
        en: 'Agreements — Forecasts',
        fr: 'Ententes — Prévisions'
      },
      targets: [
        {
          key: 'agreement.forecasts.content',
          label: {
            en: 'Forecasts',
            fr: 'Prévisions'
          },
          kind: 'section'
        },
        {
          key: 'agreement.forecasts.search',
          label: {
            en: 'Search',
            fr: 'Rechercher'
          },
          kind: 'text'
        },
        {
          key: 'agreement.forecasts.add',
          label: {
            en: 'Add',
            fr: 'Ajouter'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.forecasts.forecast-dialog',
      label: {
        en: 'Agreements — Forecast editor',
        fr: 'Ententes — Éditeur de prévision'
      },
      discoverable: false,
      targets: [
        {
          key: 'agreement.forecasts.forecast-dialog.cancel',
          label: {
            en: 'Cancel',
            fr: 'Annuler'
          },
          kind: 'button'
        },
        {
          key: 'agreement.forecasts.forecast-dialog.save',
          label: {
            en: 'Save',
            fr: 'Enregistrer'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.claims',
      label: {
        en: 'Agreements — Claims',
        fr: 'Ententes — Demandes de remboursement'
      },
      targets: [
        {
          key: 'agreement.claims.content',
          label: {
            en: 'Claims',
            fr: 'Demandes de remboursement'
          },
          kind: 'section'
        },
        {
          key: 'agreement.claims.search',
          label: {
            en: 'Search',
            fr: 'Rechercher'
          },
          kind: 'text'
        },
        {
          key: 'agreement.claims.add',
          label: {
            en: 'Add',
            fr: 'Ajouter'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.claims.claim-dialog',
      label: {
        en: 'Agreements — Claim editor',
        fr: 'Ententes — Éditeur de demande de remboursement'
      },
      discoverable: false,
      targets: [
        {
          key: 'agreement.claims.claim-dialog.cancel',
          label: {
            en: 'Cancel',
            fr: 'Annuler'
          },
          kind: 'button'
        },
        {
          key: 'agreement.claims.claim-dialog.save',
          label: {
            en: 'Save',
            fr: 'Enregistrer'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.monitors',
      label: {
        en: 'Agreements — Monitors',
        fr: 'Ententes — Surveillances'
      },
      targets: [
        {
          key: 'agreement.monitors.content',
          label: {
            en: 'Monitors',
            fr: 'Surveillances'
          },
          kind: 'section'
        },
        {
          key: 'agreement.monitors.search',
          label: {
            en: 'Search',
            fr: 'Rechercher'
          },
          kind: 'text'
        },
        {
          key: 'agreement.monitors.add',
          label: {
            en: 'Add',
            fr: 'Ajouter'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.monitors.monitor-dialog',
      label: {
        en: 'Agreements — Monitor editor',
        fr: 'Ententes — Éditeur de surveillance'
      },
      discoverable: false,
      targets: [
        {
          key: 'agreement.monitors.monitor-dialog.cancel',
          label: {
            en: 'Cancel',
            fr: 'Annuler'
          },
          kind: 'button'
        },
        {
          key: 'agreement.monitors.monitor-dialog.save',
          label: {
            en: 'Save',
            fr: 'Enregistrer'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.activities',
      label: {
        en: 'Agreements — Activities',
        fr: 'Ententes — Activités'
      },
      targets: [
        {
          key: 'agreement.activities.content',
          label: {
            en: 'Activities',
            fr: 'Activités'
          },
          kind: 'section'
        },
        {
          key: 'agreement.activities.search',
          label: {
            en: 'Search',
            fr: 'Rechercher'
          },
          kind: 'text'
        },
        {
          key: 'agreement.activities.add',
          label: {
            en: 'Add',
            fr: 'Ajouter'
          },
          kind: 'button',
          completion: {
            kind: 'success',
            action: 'modal-open'
          }
        },
        {
          key: 'agreement.activities.save',
          label: {
            en: 'Save',
            fr: 'Enregistrer'
          },
          kind: 'button',
          completion: {
            kind: 'success',
            action: 'save-success'
          }
        }
      ]
    },
    {
      key: 'agreement.amendments',
      label: {
        en: 'Agreements — Amendments',
        fr: 'Ententes — Modifications'
      },
      targets: [
        {
          key: 'agreement.amendments.content',
          label: {
            en: 'Amendments',
            fr: 'Modifications'
          },
          kind: 'section'
        },
        {
          key: 'agreement.amendments.search',
          label: {
            en: 'Search',
            fr: 'Rechercher'
          },
          kind: 'text'
        },
        {
          key: 'agreement.amendments.add',
          label: {
            en: 'Add',
            fr: 'Ajouter'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.amendments.create-dialog',
      label: {
        en: 'Agreements — Create amendment',
        fr: 'Ententes — Créer une modification'
      },
      discoverable: false,
      targets: [
        {
          key: 'agreement.amendments.create-dialog.retry',
          label: {
            en: 'Retry',
            fr: 'Réessayer'
          },
          kind: 'button'
        },
        {
          key: 'agreement.amendments.create-dialog.cancel',
          label: {
            en: 'Cancel',
            fr: 'Annuler'
          },
          kind: 'button'
        },
        {
          key: 'agreement.amendments.create-dialog.save',
          label: {
            en: 'Save',
            fr: 'Enregistrer'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.documents',
      label: {
        en: 'Agreements — Documents',
        fr: 'Ententes — Documents'
      },
      targets: [
        {
          key: 'agreement.documents.content',
          label: {
            en: 'Documents',
            fr: 'Documents'
          },
          kind: 'section'
        },
        {
          key: 'agreement.documents.retry',
          label: {
            en: 'Retry',
            fr: 'Réessayer'
          },
          kind: 'button'
        },
        {
          key: 'agreement.documents.search',
          label: {
            en: 'Search',
            fr: 'Rechercher'
          },
          kind: 'text'
        },
        {
          key: 'agreement.documents.add',
          label: {
            en: 'Add',
            fr: 'Ajouter'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.documents.generate-dialog',
      label: {
        en: 'Agreements — Generate document',
        fr: 'Ententes — Générer un document'
      },
      discoverable: false,
      targets: [
        {
          key: 'agreement.documents.generate-dialog.cancel',
          label: {
            en: 'Cancel',
            fr: 'Annuler'
          },
          kind: 'button'
        },
        {
          key: 'agreement.documents.generate-dialog.save',
          label: {
            en: 'Save',
            fr: 'Enregistrer'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.closeouts',
      label: {
        en: 'Agreements — Closeout',
        fr: 'Ententes — Clôture'
      },
      targets: [
        {
          key: 'agreement.closeouts.content',
          label: {
            en: 'Closeout',
            fr: 'Clôture'
          },
          kind: 'section'
        },
        {
          key: 'agreement.closeouts.closeout-create',
          label: {
            en: 'Create Closeout',
            fr: 'Créer une clôture'
          },
          kind: 'button'
        },
        {
          key: 'agreement.closeouts.retry',
          label: {
            en: 'Retry',
            fr: 'Réessayer'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.create',
      label: {
        en: 'Agreements — Create agreement',
        fr: 'Ententes — Créer une entente'
      },
      discoverable: false,
      targets: [
        {
          key: 'agreement.create.content',
          label: {
            en: 'Create agreement',
            fr: 'Créer une entente'
          },
          kind: 'section'
        }
      ]
    },
    {
      key: 'agreements.list',
      label: {
        en: 'Agreements — Choose an agreement',
        fr: 'Ententes — Choisir une entente'
      },
      targets: [
        {
          key: 'agreements.list.add',
          label: {
            en: 'Add',
            fr: 'Ajouter'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.profile-edit',
      label: {
        en: 'Agreements — Profile editor',
        fr: 'Ententes — Éditeur du profil'
      },
      discoverable: false,
      targets: [
        {
          key: 'agreement.profile-edit.cancel',
          label: {
            en: 'Cancel',
            fr: 'Annuler'
          },
          kind: 'button'
        },
        {
          key: 'agreement.profile-edit.save',
          label: {
            en: 'Save',
            fr: 'Enregistrer'
          },
          kind: 'button'
        }
      ]
    },
    {
      key: 'agreement.recommendation',
      label: {
        en: 'Agreements — Recommendation',
        fr: 'Ententes — Recommandation'
      },
      targets: [
        {
          key: 'agreement.recommendation.content',
          label: {
            en: 'Recommendation',
            fr: 'Recommandation'
          },
          kind: 'section'
        }
      ]
    },
    {
      key: 'agreement.reviews',
      label: {
        en: 'Agreements — Reviews',
        fr: 'Ententes — Examens'
      },
      targets: [
        {
          key: 'agreement.reviews.content',
          label: {
            en: 'Reviews',
            fr: 'Examens'
          },
          kind: 'section'
        }
      ]
    },
    {
      key: 'agreement.workflows',
      label: {
        en: 'Agreements — Workflows',
        fr: 'Ententes — Processus'
      },
      targets: [
        {
          key: 'agreement.workflows.content',
          label: {
            en: 'Workflows',
            fr: 'Processus'
          },
          kind: 'section'
        }
      ]
    },
    {
      key: 'agreement.supplementary-information',
      label: {
        en: 'Agreements — Supplementary information',
        fr: 'Ententes — Renseignements supplémentaires'
      },
      targets: [
        {
          key: 'agreement.supplementary-information.content',
          label: {
            en: 'Supplementary information',
            fr: 'Renseignements supplémentaires'
          },
          kind: 'section'
        }
      ]
    },
    {
      key: 'agreement.attachments',
      label: {
        en: 'Agreements — Attachments',
        fr: 'Ententes — Pièces jointes'
      },
      targets: [
        {
          key: 'agreement.attachments.content',
          label: {
            en: 'Attachments',
            fr: 'Pièces jointes'
          },
          kind: 'section'
        }
      ]
    },
    {
      key: 'agreement.assignments',
      label: {
        en: 'Agreements — Assignments',
        fr: 'Ententes — Affectations'
      },
      targets: [
        {
          key: 'agreement.assignments.content',
          label: {
            en: 'Assignments',
            fr: 'Affectations'
          },
          kind: 'section'
        }
      ]
    },
    {
      key: 'agreement.detail',
      label: {
        en: 'Agreement — Detail guidance',
        fr: 'Entente — Instructions du dossier'
      },
      discoverable: false,
      targets: [
        {
          key: 'agreement.detail.edit-profile',
          label: {
            en: 'Edit profile',
            fr: 'Modifier le profil'
          },
          kind: 'button'
        },
        { key: 'agreement.detail.section-navigation', label: { en: 'Section navigation', fr: 'Navigation entre les sections' }, kind: 'section' }
      ]
    }
  ]
}
