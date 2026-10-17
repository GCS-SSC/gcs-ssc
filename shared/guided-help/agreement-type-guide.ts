import type { GuideDocument } from '@gcs-ssc/guided-help/contracts'

/** System example showing one route per named option and an Otherwise route for Other. */
export const agreementTypeGuide: GuideDocument = {
  formatVersion: 1,
  title: { en: 'Add an agency agreement type', fr: 'Ajouter un type d’entente à un organisme' },
  description: {
    en: 'Create an agency agreement type and see how guidance branches for each type. This guide uses real agency data.',
    fr: 'Créez un type d’entente et découvrez le parcours propre à chaque type. Ce guide utilise les données réelles de l’organisme.'
  },
  steps: [
    {
      id: 'open-add', view: 'agency.agreement-types', target: 'agency.agreement-types.add', kind: 'button',
      title: { en: 'Open agreement types', fr: 'Ouvrir les types d’ententes' },
      instructions: {
        en: 'In your agency, select **Agreement Types**, then **Add**. The guide continues when the form opens.',
        fr: 'Dans votre organisme, sélectionnez **Types d’ententes**, puis **Ajouter**. Le guide continue lorsque le formulaire est ouvert.'
      }
    },
    {
      id: 'choose-type', view: 'agency.agreement-types', target: 'agency.agreement-types.type', kind: 'select', advanceOn: 'manual',
      title: { en: 'Choose the agreement type', fr: 'Choisir le type d’entente' },
      instructions: {
        en: 'Choose a type, then select **Next**. Grant, Non-Repayable, Repayable and Partially Repayable each have their own branch. **Other** follows the **Otherwise** route.',
        fr: 'Choisissez un type, puis sélectionnez **Suivant**. Subvention, Non remboursable, Remboursable et Partiellement remboursable ont chacun leur parcours. **Autre** suit le parcours **Sinon**.'
      },
      flow: {
        branches: [
          { target: 'agency.agreement-types.type', equals: 'grant', next: 'grant-name' },
          { target: 'agency.agreement-types.type', equals: 'nonrepayable', next: 'nonrepayable-name' },
          { target: 'agency.agreement-types.type', equals: 'repayable', next: 'repayable-name' },
          { target: 'agency.agreement-types.type', equals: 'partiallyrepayable', next: 'partiallyrepayable-name' }
        ],
        next: 'other-name'
      }
    },
    ...[
      { id: 'grant-name', en: 'Name the grant type', fr: 'Nommer le type de subvention', detailEn: 'You chose **Grant**.', detailFr: 'Vous avez choisi **Subvention**.' },
      { id: 'nonrepayable-name', en: 'Name the non-repayable type', fr: 'Nommer le type non remboursable', detailEn: 'You chose **Non-Repayable**.', detailFr: 'Vous avez choisi **Non remboursable**.' },
      { id: 'repayable-name', en: 'Name the repayable type', fr: 'Nommer le type remboursable', detailEn: 'You chose **Repayable**.', detailFr: 'Vous avez choisi **Remboursable**.' },
      { id: 'partiallyrepayable-name', en: 'Name the partially repayable type', fr: 'Nommer le type partiellement remboursable', detailEn: 'You chose **Partially Repayable**.', detailFr: 'Vous avez choisi **Partiellement remboursable**.' },
      { id: 'other-name', en: 'Name the other agreement type', fr: 'Nommer l’autre type d’entente', detailEn: 'You followed **Otherwise** by choosing **Other**. Use a descriptive name for this type.', detailFr: 'Vous avez suivi **Sinon** en choisissant **Autre**. Utilisez un nom descriptif pour ce type.' }
    ].map(option => ({
      id: option.id, view: 'agency.agreement-types', target: 'agency.agreement-types.name-en', kind: 'text' as const,
      title: { en: option.en, fr: option.fr },
      instructions: {
        en: `${option.detailEn} Enter the English name, then leave the field to continue. All branches rejoin at the French name.`,
        fr: `${option.detailFr} Saisissez le nom anglais, puis quittez le champ pour continuer. Tous les parcours rejoignent le nom français.`
      },
      flow: { branches: [], next: 'french-name' }
    })),
    {
      id: 'french-name', view: 'agency.agreement-types', target: 'agency.agreement-types.name-fr', kind: 'text',
      title: { en: 'Enter the French name', fr: 'Saisir le nom français' },
      instructions: { en: 'Enter the equivalent French name, then leave the field to continue.', fr: 'Saisissez le nom français correspondant, puis quittez le champ pour continuer.' }
    },
    {
      id: 'save', view: 'agency.agreement-types', target: 'agency.agreement-types.save', kind: 'button',
      title: { en: 'Save the agreement type', fr: 'Enregistrer le type d’entente' },
      instructions: {
        en: 'Select **Add** in the form. Correct any validation errors and try again if necessary. The guide finishes after the agreement type is saved successfully.',
        fr: 'Sélectionnez **Ajouter** dans le formulaire. Corrigez les erreurs de validation et réessayez au besoin. Le guide se termine lorsque le type d’entente est enregistré avec succès.'
      }
    }
  ]
}
