import { App } from 'aws-cdk-lib'
import { createDemoStack } from './demo-stack.js'

// Bun loads infra/aws/.env before the CDK CLI and its child application.
// Explicit CDK -c options take precedence over these local defaults.
const app = new App({
  context: {
    ...(process.env.AWS_BUDGET_EMAIL ? { budgetEmail: process.env.AWS_BUDGET_EMAIL } : {}),
    ...(process.env.AWS_MONTHLY_BUDGET_USD ? { monthlyBudgetUsd: process.env.AWS_MONTHLY_BUDGET_USD } : {})
  }
})
createDemoStack(app, 'GcsSscDemo', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ca-central-1'
  },
  description: 'GCS-SSC demo in Canada Central'
})
