import type { GuideDocument } from '@gcs-ssc/guided-help/contracts'

/** System-owned example; agency publications independently select discovery and roles. */
export const addressTypeGuide: GuideDocument = {
  formatVersion: 1,
  title: { en: 'Add an agency address type', fr: 'Ajouter un type d’adresse à un organisme' },
  description: {
    en: 'Create an address type in your agency configuration. This guide uses real agency data.',
    fr: 'Créez un type d’adresse dans la configuration de votre organisme. Ce guide utilise les données réelles de l’organisme.'
  },
  steps: [
    {
      id: 'open-add', view: 'agency.address-types', target: 'agency.address-types.add', kind: 'button',
      title: { en: 'Open address types', fr: 'Ouvrir les types d’adresse' },
      instructions: {
        en: 'In your agency, select **Address types**, then select **Add**. The guide continues when the form opens.',
        fr: 'Dans votre organisme, sélectionnez **Types d’adresse**, puis **Ajouter**. Le guide continue lorsque le formulaire est ouvert.'
      }
    },
    {
      id: 'english-name', view: 'agency.address-types', target: 'agency.address-types.name-en', kind: 'text',
      title: { en: 'Enter the English name', fr: 'Saisir le nom anglais' },
      instructions: {
        en: 'Enter the address type’s English name. Leave the field after entering a value to continue.',
        fr: 'Saisissez le nom anglais du type d’adresse. Quittez le champ après avoir saisi une valeur pour continuer.'
      }
    },
    {
      id: 'french-name', view: 'agency.address-types', target: 'agency.address-types.name-fr', kind: 'text',
      title: { en: 'Enter the French name', fr: 'Saisir le nom français' },
      instructions: { en: 'Enter the equivalent French name, then leave the field to continue.', fr: 'Saisissez le nom français correspondant, puis quittez le champ pour continuer.' }
    },
    {
      id: 'save', view: 'agency.address-types', target: 'agency.address-types.save', kind: 'button',
      title: { en: 'Save the address type', fr: 'Enregistrer le type d’adresse' },
      instructions: {
        en: 'Select **Add** in the form. Correct any validation errors and try again if necessary. The guide finishes after the address type is saved successfully.',
        fr: 'Sélectionnez **Ajouter** dans le formulaire. Corrigez les erreurs de validation et réessayez au besoin. Le guide se termine lorsque le type d’adresse est enregistré avec succès.'
      }
    }
  ]
}
