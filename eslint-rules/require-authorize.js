/**
 * ESLint rule to enforce authorization calls in API route handlers.
 *
 * Ensures files in server/api that define an event handler call authorize() or an approved
 * authorization wrapper.
 * Intentional public or delegated handlers must use a local suppression so the
 * exception remains explicit in the route source.
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require authorize() call in API route handlers for security',
      category: 'Security',
      recommended: true
    },
    messages: {
      missingAuthorize:
        'API route handler must call authorize() or an approved authorization wrapper to secure the endpoint. If this endpoint should be public, add a comment: // eslint-disable-next-line local/require-authorize'
    },
    schema: []
  },

  /**
   * Initializes the rule's visitor functions.
   *
   * @param context - The ESLint rule context.
   * @returns An object with node visitor functions.
   */
  create: (context) => {
    const approvedAuthorizationCalls = new Set([
      'authorize',
      'requireAuthContext',
      'authorizeActiveAgencySubentity',
      'authorizeActiveAgencyCostCategory',
      'authorizeActiveAgencyLineItem',
      'authorizeAgreementResource',
      'authorizeEntityTeamResource',
      'authorizeAttachmentTarget',
      'authorizeTransferPaymentProfileResource',
      'authorizeTransferPaymentOutcomeResource',
      'authorizeReviewRuntimeAction',
      'prepareAgreementCommitmentRoute',
      'prepareAgreementForecastRoute',
      'prepareAgreementClaimRoute',
      'prepareAgreementMonitorRoute',
      'prepareAgreementPaymentRoute',
      'executeFreshAuthorizedTransferPaymentOutcomeIndicatorWrite',
      'executeFreshAuthorizedAttachmentWrite'
    ])
    const unauthorizedCalls = new Set(['unauthorized'])
    const filename = (context.filename || context.getFilename()).replaceAll('\\', '/')

    if (!filename.includes('/server/api/')) {
      return {}
    }

    const skipPatterns = [
      '/server/wrappers/',
      '/server/api/[...].ts'
    ]

    if (skipPatterns.some(pattern => filename.includes(pattern))) {
      return {}
    }

    const isAuthApiRoute = filename.includes('/server/api/auth/')
    let hasApprovedAuthorizationCall = false
    let hasAuthSessionCall = false
    let hasUnauthorizedCall = false
    let handlerNode = null

    /**
     * Checks whether a call expression targets one of the named identifiers.
     *
     * @param node - The CallExpression node.
     * @param names - Allowed identifier names.
     * @returns Whether the call targets an allowed identifier.
     */
    const isIdentifierCall = (node, names) =>
      node.callee.type === 'Identifier' && names.has(node.callee.name)

    /**
     * Checks for the Better Auth session lookup used by auth bootstrap routes.
     *
     * @param node - The CallExpression node.
     * @returns Whether the call reads the current Better Auth session.
     */
    const isAuthApiGetSessionCall = node =>
      node.callee.type === 'MemberExpression'
      && node.callee.property.type === 'Identifier'
      && node.callee.property.name === 'getSession'
      && node.callee.object.type === 'MemberExpression'
      && node.callee.object.property.type === 'Identifier'
      && node.callee.object.property.name === 'api'
      && node.callee.object.object.type === 'Identifier'
      && node.callee.object.object.name === 'auth'

    return {
      /**
       * Visitor for CallExpression nodes to detect event handlers and authorize calls.
       *
       * @param node - The CallExpression node.
       */
      'CallExpression': (node) => {
        const isEventHandler =
          node.callee.type === 'Identifier'
          && ['defineEventHandler', 'defineEventHandlerWithDB', 'defineEventHandlerWithId', 'NuxtAuthHandler']
            .includes(node.callee.name)

        if (isEventHandler && !handlerNode) {
          handlerNode = node
        }

        if (isIdentifierCall(node, approvedAuthorizationCalls)) {
          hasApprovedAuthorizationCall = true
        }

        if (isAuthApiRoute && isAuthApiGetSessionCall(node)) {
          hasAuthSessionCall = true
        }

        if (isAuthApiRoute && isIdentifierCall(node, unauthorizedCalls)) {
          hasUnauthorizedCall = true
        }
      },

      /**
       * Visitor for AwaitExpression nodes to detect awaited authorize calls.
       *
       * @param node - The AwaitExpression node.
       */
      'AwaitExpression': (node) => {
        if (
          node.argument.type === 'CallExpression'
          && isIdentifierCall(node.argument, approvedAuthorizationCalls)
        ) {
          hasApprovedAuthorizationCall = true
        }
      },

      /**
       * Final check on program exit to report missing authorize calls in handlers.
       */
      'Program:exit': () => {
        const hasAuthRouteSessionGuard = isAuthApiRoute && hasAuthSessionCall && hasUnauthorizedCall

        if (handlerNode && !hasApprovedAuthorizationCall && !hasAuthRouteSessionGuard) {
          context.report({
            node: handlerNode,
            messageId: 'missingAuthorize'
          })
        }
      }
    }
  }
}
