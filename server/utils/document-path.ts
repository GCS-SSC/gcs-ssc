/**
 * Resolves template data, treating unpopulated clause codes and related-proponent roles as empty lists.
 * @param scope - The current template scope.
 * @param path - The template's dot-separated path.
 * @param propertyAccess - The existing property lookup mode for this syntax.
 * @returns The resolved value, or undefined when the path is missing.
 */
export const resolveDocumentPath = (
  scope: unknown, path: string, propertyAccess: 'own' | 'inherited'
): unknown => path.split('.').reduce<unknown>((current, segment, index, segments) => {
  if (current === null || typeof current !== 'object') return undefined
  if (index === 2 && segments[0] === 'agreement' && segments[1] === 'clauses') {
    return Object.hasOwn(current, segment) ? Reflect.get(current, segment) : []
  }
  const hasProperty = propertyAccess === 'own' ? Object.hasOwn(current, segment) : segment in current
  if (hasProperty) return Reflect.get(current, segment)

  if (index === 2 && segments[0] === 'recipient' && segments[1] === 'related' && !Array.isArray(current)
    && segment.length <= 255 && /^[a-z][a-z0-9_]*$/.test(segment)
    && segment !== 'constructor' && segment !== 'prototype') return []

  return undefined
}, scope)
