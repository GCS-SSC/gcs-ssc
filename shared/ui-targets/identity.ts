/**
 * Repeated rows share their declaration identity rather than an occurrence's numeric index.
 * @param name The existing form field path.
 * @returns The field path without runtime row indexes.
 */
export const normalizeUiFieldName = (name: string): string => name
  .replace(/\[(\d+)\]/g, '.$1')
  .split('.')
  .filter(part => part.length > 0 && !/^\d+$/.test(part))
  .join('.')

/**
 *
 * @param root0 Source catalog inputs.
 * @param root0.scope The explicit permanent form scope.
 * @param root0.name The existing form field path.
 * @param root0.explicitTarget An explicitly declared permanent target key.
 * @returns The explicit or scoped field identity, or null when incomplete.
 */
export const resolveUiFieldTargetKey = ({ scope, name, explicitTarget }: {
  scope?: string
  name?: string | number
  explicitTarget?: string
}): string | null => explicitTarget?.trim()
  || (scope && name !== undefined && normalizeUiFieldName(String(name))
    ? `${scope}.${normalizeUiFieldName(String(name))}`
    : null)
