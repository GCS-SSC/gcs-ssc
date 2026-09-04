/* eslint-disable jsdoc/require-jsdoc */
export const authorizedRouteLocation = <T>(authorized: boolean | undefined, location: T): T | undefined => {
  if (authorized) return location
  return undefined
}

export const appRouteLocations = {
  home: () => ({ name: 'index' }),
  login: () => ({ name: 'login' }),
  adminGwcoa: () => ({ name: 'admin-gwcoa' }),
  agencies: () => ({ name: 'agencies' }),
  agencyDetail: (id: string) => ({ name: 'agencies-id', params: { id } }),
  proponents: () => ({ name: 'proponents' }),
  proponentCreate: () => ({ name: 'proponents-new' }),
  proponentEdit: (id: string) => ({ name: 'proponents-edit-id', params: { id } }),
  agreements: () => ({ name: 'agreements' }),
  assignmentManagement: () => ({ name: 'assignment-management' }),
  agreementCreate: () => ({ name: 'agreements-new' }),
  agreementDetail: (id: string) => ({ name: 'agreements-id', params: { id } }),
  agreementAmendmentDetail: (id: string, amendmentId: string) => ({
    name: 'agreements-id-amendments-amendmentId',
    params: { id, amendmentId }
  }),
  agreementCloseoutDetail: (id: string, closeoutId: string) => ({
    name: 'agreements-id-closeouts-closeoutId',
    params: { id, closeoutId }
  }),
  agreementCommitmentDetail: (id: string, commitmentId: string) => ({
    name: 'agreements-id-commitments-commitmentId',
    params: { id, commitmentId }
  }),
  agreementPaymentDetail: (id: string, paymentId: string) => ({
    name: 'agreements-id-payments-paymentId',
    params: { id, paymentId }
  }),
  agreementForecastDetail: (id: string, forecastId: string, query?: Record<string, string>) => ({
    name: 'agreements-id-forecasts-forecastId',
    params: { id, forecastId },
    ...(query ? { query } : {})
  }),
  agreementClaimDetail: (id: string, claimId: string) => ({
    name: 'agreements-id-claims-claimId',
    params: { id, claimId }
  }),
  agreementMonitorDetail: (id: string, monitorId: string) => ({
    name: 'agreements-id-monitors-monitorId',
    params: { id, monitorId }
  }),
  roles: () => ({ name: 'roles' }),
  roleDetail: (id: string) => ({ name: 'roles-id', params: { id } }),
  transferPayments: () => ({ name: 'transfer-payments' }),
  transferPaymentDetail: (id: string) => ({ name: 'transfer-payments-id', params: { id } }),
  transferPaymentStreamDetail: (id: string, streamId: string, query?: Record<string, string>) => ({
    name: 'transfer-payments-id-streams-streamId',
    params: { id, streamId },
    ...(query ? { query } : {})
  }),
  extensionStreamConfig: (id: string, query: { streamId: string; transferPaymentId?: string; agencyId?: string }) => ({
    name: 'extension-id-config',
    params: { id },
    query
  }),
  assessmentDetail: (reviewId: string, query?: Record<string, string>) => ({
    name: 'assessments-reviewId',
    params: { reviewId },
    ...(query ? { query } : {})
  }),
  checklistDetail: (reviewId: string, query?: Record<string, string>) => ({
    name: 'checklists-reviewId',
    params: { reviewId },
    ...(query ? { query } : {})
  }),
  recommendationDetail: (recommendationId: string) => ({
    name: 'recommendations-recommendationId',
    params: { recommendationId }
  }),
  claimReconciliationDetail: (reconcileId: string) => ({
    name: 'claim-reconciliations-reconcileId',
    params: { reconcileId }
  }),
  transferPaymentAssessmentSchemaDetail: (id: string, streamId: string, schemaId: string) => ({
    name: 'transfer-payments-id-streams-streamId-assessment-schemas-schemaId',
    params: { id, streamId, schemaId }
  }),
  transferPaymentChecklistSchemaDetail: (id: string, streamId: string, schemaId: string) => ({
    name: 'transfer-payments-id-streams-streamId-checklist-schemas-schemaId',
    params: { id, streamId, schemaId }
  }),
  transferPaymentRecommendationSchemaDetail: (id: string, streamId: string, schemaId: string) => ({
    name: 'transfer-payments-id-streams-streamId-recommendation-schemas-schemaId',
    params: { id, streamId, schemaId }
  }),
  transferPaymentRecommendationSetupDetail: (id: string, streamId: string, recommendationSetupId: string) => ({
    name: 'transfer-payments-id-streams-streamId-recommendation-setups-recommendationSetupId',
    params: { id, streamId, recommendationSetupId }
  }),
  transferPaymentApprovalTemplateDetail: (id: string, streamId: string, templateId: string) => ({
    name: 'transfer-payments-id-streams-streamId-approval-templates-templateId',
    params: { id, streamId, templateId }
  }),
  transferPaymentWorkflowSetupDetail: (id: string, streamId: string, workflowSetupId: string) => ({
    name: 'transfer-payments-id-streams-streamId-workflow-setups-workflowSetupId',
    params: { id, streamId, workflowSetupId }
  }),
  transferPaymentReviewSetupDetail: (id: string, streamId: string, reviewSetupId: string) => ({
    name: 'transfer-payments-id-streams-streamId-review-setups-reviewSetupId',
    params: { id, streamId, reviewSetupId }
  }),
  users: () => ({ name: 'users' }),
  userDetail: (id: string) => ({ name: 'users-id', params: { id } })
} as const
