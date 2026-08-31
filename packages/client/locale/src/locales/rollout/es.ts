/**
 * ES rollout dictionaries for the shared namespaces.
 * Key parity with the zh/en pair is enforced by the generator that emitted
 * this file; missing keys would fall back to English at lookup time.
 */
import type { CommonKey } from '../index.ts'
import { en } from '../en.ts'
import type { SettingsLocaleKey } from '../settings.ts'

export const common: Record<CommonKey, string> = {
  ...en,
  'ok': 'Aceptar',
  'cancel': 'Cancelar',
  'close': 'Cerrar',
  'copy': 'Copiar',
  'copied': 'Copiado',
  'retry': 'Reintentar',
  'loading': 'Cargando…',
  'load.failed': 'Error al cargar',
  'submit': 'Enviar',
  'submitting': 'Enviando…',
  'next': 'Siguiente',
  'previous': 'Anterior',
  'skip': 'Omitir',
  'delete': 'Eliminar',
  'edit': 'Editar',
  'save': 'Guardar',
  'search': 'Buscar',
  'more': 'Más',
  'collapse': 'Contraer',
  'expand': 'Expandir',
  'back': 'Atrás',
  'unknown': 'Desconocido',
  'none': 'Ninguno',
  'truncated': 'Truncado',
}

export const settingsLocale: Record<SettingsLocaleKey, string> = {
  'language.title': 'Idioma',
}
