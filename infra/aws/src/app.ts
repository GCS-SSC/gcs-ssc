import { App } from 'aws-cdk-lib'
import { createDemoStack } from './demo-stack.js'

const app = new App()
createDemoStack(app, 'GcsSscDemo', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ca-central-1'
  },
  description: 'GCS-SSC demo in Canada Central'
})
