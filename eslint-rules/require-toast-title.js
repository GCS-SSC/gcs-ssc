/* eslint-disable jsdoc/require-jsdoc -- Local AST helpers implement the rule below. */

const toastFactories = new Set(['useToast', 'useLocalizedToast', 'useExtensionToast'])

const propertyName = (node, computed) => {
  if (node.type === 'Literal') return node.value
  if (!computed && node.type === 'Identifier') return node.name
}

const isToastFactoryCall = node => node?.type === 'CallExpression'
  && node.callee.type === 'Identifier'
  && toastFactories.has(node.callee.name)

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      missingTitle: 'Provide a non-empty, localized title for this toast.',
      missingDescription: 'Provide a non-empty, localized description for this toast.'
    }
  },

  create: context => {
    const { sourceCode } = context
    const findDefinition = node => {
      for (let scope = sourceCode.getScope(node); scope; scope = scope.upper) {
        const variable = scope.set.get(node.name)
        if (variable) return variable.defs.length === 1 ? variable.defs[0].node : undefined
      }
    }

    const isToastAdd = callee => {
      if (callee.type === 'MemberExpression') {
        if (propertyName(callee.property, callee.computed) !== 'add') return false
        const target = callee.object.type === 'Identifier' ? findDefinition(callee.object)?.init : callee.object
        return isToastFactoryCall(target)
      }
      if (callee.type !== 'Identifier') return false
      const definition = findDefinition(callee)
      return definition?.id?.type === 'ObjectPattern' && isToastFactoryCall(definition.init)
        && definition.id.properties.some(property => property.type === 'Property'
          && propertyName(property.key, property.computed) === 'add'
          && property.value.type === 'Identifier' && property.value.name === callee.name)
    }

    const textState = node => {
      if (node.type === 'Literal') {
        return typeof node.value === 'string' && node.value.trim() ? 'present' : 'missing'
      }
      if (node.type === 'Identifier' && node.name === 'undefined') return 'missing'
      if (node.type === 'UnaryExpression' && node.operator === 'void') return 'missing'
      if (node.type === 'TemplateLiteral' && !node.expressions.length) {
        return node.quasis[0].value.cooked?.trim() ? 'present' : 'missing'
      }
      return 'unknown'
    }

    const objectTextState = (object, field) => {
      let state = 'absent'
      for (const property of object.properties) {
        if (property.type === 'SpreadElement') {
          const spread = property.argument
          if (spread.type === 'ObjectExpression') {
            const spreadState = objectTextState(spread, field)
            if (spreadState !== 'absent') state = spreadState
          } else {
            state = 'unknown'
          }
        } else if (propertyName(property.key, property.computed) === field) {
          state = property.kind === 'init' ? textState(property.value) : 'unknown'
        } else if (property.computed && property.key.type !== 'Literal') {
          state = 'unknown'
        }
      }
      return state
    }

    return {
      CallExpression: node => {
        if (!isToastAdd(node.callee)) return
        const argument = node.arguments[0]
        const definition = argument?.type === 'Identifier' ? findDefinition(argument) : undefined
        const payload = definition?.parent?.kind === 'const' ? definition.init : argument
        for (const [field, messageId] of [['title', 'missingTitle'], ['description', 'missingDescription']]) {
          if (!payload || (payload.type === 'ObjectExpression' && ['absent', 'missing'].includes(objectTextState(payload, field)))) {
            context.report({ node: argument ?? node, messageId })
          }
        }
      }
    }
  }
}
