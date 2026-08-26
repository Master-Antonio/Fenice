/**
 * FR rollout dictionaries for the shared namespaces.
 * Key parity with the zh/en pair is enforced by the generator that emitted
 * this file; missing keys would fall back to English at lookup time.
 */
import type { CommonKey } from '../index.ts'
import type { SettingsLocaleKey } from '../settings.ts'

export const common: Record<CommonKey, string> = {
  'ok': 'OK',
  'cancel': 'Annuler',
  'close': 'Fermer',
  'copy': 'Copier',
  'copied': 'Copié',
  'retry': 'Réessayer',
  'loading': 'Chargement…',
  'load.failed': 'Échec du chargement',
  'submit': 'Envoyer',
  'submitting': 'Envoi en cours…',
  'next': 'Suivant',
  'previous': 'Précédent',
  'skip': 'Passer',
  'delete': 'Supprimer',
  'edit': 'Modifier',
  'save': 'Enregistrer',
  'search': 'Rechercher',
  'more': 'Plus',
  'collapse': 'Réduire',
  'expand': 'Développer',
  'back': 'Retour',
  'unknown': 'Inconnu',
  'none': 'Aucun',
  'truncated': 'Tronqué',
}

export const settingsLocale: Record<SettingsLocaleKey, string> = {
  'language.title': 'Langue',
}
