import type { TargetLedger } from '@gcs-ssc/guided-help/contracts'

/** Approved application contract; edits require explicit guided-help contract task scope. */
export const guidedHelpLedger: TargetLedger = {
  formatVersion: 1,
  views: [
    {
      key: 'agency.general',
      label: { en: 'Agency — General', fr: 'Organisme — Général' },
      targets: []
    },
    {
      key: 'agency.address-types',
      label: { en: 'Agency — Address types', fr: 'Organisme — Types d’adresse' },
      targets: [
        { key: 'agency.address-types.add', label: { en: 'Add address type', fr: 'Ajouter un type d’adresse' }, kind: 'button' },
        { key: 'agency.address-types.name-en', label: { en: 'English name', fr: 'Nom anglais' }, kind: 'text' },
        { key: 'agency.address-types.name-fr', label: { en: 'French name', fr: 'Nom français' }, kind: 'text' },
        { key: 'agency.address-types.save', label: { en: 'Save address type', fr: 'Enregistrer le type d’adresse' }, kind: 'button' }
      ]
    },
    {
      key: 'agency.agreement-types',
      label: { en: 'Agency — Agreement types', fr: 'Organisme — Types d’ententes' },
      targets: [
        { key: 'agency.agreement-types.add', label: { en: 'Add agreement type', fr: 'Ajouter un type d’entente' }, kind: 'button' },
        { key: 'agency.agreement-types.type', label: { en: 'Agreement type', fr: 'Type d’entente' }, kind: 'select', choices: [
          { value: 'grant', label: { en: 'Grant', fr: 'Subvention' } },
          { value: 'nonrepayable', label: { en: 'Non-Repayable', fr: 'Non remboursable' } },
          { value: 'repayable', label: { en: 'Repayable', fr: 'Remboursable' } },
          { value: 'partiallyrepayable', label: { en: 'Partially Repayable', fr: 'Partiellement remboursable' } },
          { value: 'other', label: { en: 'Other', fr: 'Autre' } }
        ] },
        { key: 'agency.agreement-types.name-en', label: { en: 'English name', fr: 'Nom anglais' }, kind: 'text' },
        { key: 'agency.agreement-types.name-fr', label: { en: 'French name', fr: 'Nom français' }, kind: 'text' },
        { key: 'agency.agreement-types.save', label: { en: 'Save agreement type', fr: 'Enregistrer le type d’entente' }, kind: 'button' }
      ]
    },
    {
      key: 'agency.edit',
      label: { en: 'Agency — Edit agency', fr: 'Organisme — Modifier l’organisme' },
      discoverable: false,
      targets: [
        { key: 'agency.edit.active', label: { en: 'Agency active status', fr: 'État actif de l’organisme' }, kind: 'checkbox' }
      ]
    }
  ]
}
