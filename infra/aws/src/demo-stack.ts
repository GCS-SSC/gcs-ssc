import {
  CfnOutput, CfnParameter, Duration, RemovalPolicy, Stack, Tags,
  aws_budgets as budgets, aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins, aws_ec2 as ec2,
  aws_ecs as ecs, aws_efs as efs,
  aws_elasticloadbalancingv2 as elbv2, aws_logs as logs, aws_iam as iam,
  aws_rds as rds, aws_secretsmanager as secretsmanager, aws_s3 as s3,
  custom_resources as customResources
} from 'aws-cdk-lib'
import type { StackProps } from 'aws-cdk-lib'
import type { Construct } from 'constructs'
import { DEMO_IMAGE_PATTERN, readDemoImage } from '../../../deployment/demo-image.js'
import { readPortalDemoImage } from '../../../deployment/portal-demo-image.js'
import { readFileSync } from 'node:fs'

/**
 * Creates the fixed-size demo deployment without AWS lookups at synthesis time.
 * @param scope - CDK application.
 * @param id - Stack identifier.
 * @param props - AWS account and Canada Central region.
 * @returns Deployable demo stack.
 */
export const createDemoStack = (scope: Construct, id: string, props: StackProps): Stack => {
  const stack = new Stack(scope, id, props)
  if (stack.region !== 'ca-central-1') throw new Error('The demo stack requires ca-central-1')
  Tags.of(stack).add('Application', 'gcs-ssc')
  Tags.of(stack).add('Environment', 'demo')
  const imageReference = readDemoImage() ?? new CfnParameter(stack, 'DemoImage', {
    type: 'String',
    description: 'Digest-pinned GHCR demo image published by GitHub Actions',
    allowedPattern: DEMO_IMAGE_PATTERN.source
  }).valueAsString

  const futureStorage = new s3.Bucket(stack, 'FutureStorage', {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    encryption: s3.BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    versioned: true,
    objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    removalPolicy: RemovalPolicy.RETAIN,
    lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(7) }]
  })

  const vpc = new ec2.Vpc(stack, 'Vpc', {
    maxAzs: 2,
    natGateways: 0,
    subnetConfiguration: [
      { name: 'App', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
      { name: 'Data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 }
    ]
  })
  // CloudFront VPC origins exclude cac1-az3. Physical AZ IDs avoid the
  // account-specific mapping of names such as ca-central-1a.
  for (const subnets of [vpc.publicSubnets, vpc.isolatedSubnets]) {
    subnets.forEach((subnet, index) => {
      const resource = subnet.node.defaultChild as ec2.CfnSubnet
      resource.availabilityZone = undefined
      resource.availabilityZoneId = `cac1-az${index + 1}`
    })
  }

  const appSecurityGroup = new ec2.SecurityGroup(stack, 'AppSecurityGroup', { vpc })
  const alb = new elbv2.ApplicationLoadBalancer(stack, 'LoadBalancer', {
    vpc,
    internetFacing: false,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    idleTimeout: Duration.seconds(120)
  })
  // Resolve the regional AWS-managed prefix list at deployment, keeping synth
  // independent of account credentials and avoiding hard-coded prefix list IDs.
  const cloudfrontPrefixList = new customResources.AwsCustomResource(stack, 'CloudFrontPrefixList', {
    onUpdate: {
      service: 'EC2', action: 'describeManagedPrefixLists',
      parameters: { Filters: [{ Name: 'prefix-list-name', Values: ['com.amazonaws.global.cloudfront.origin-facing'] }] },
      physicalResourceId: customResources.PhysicalResourceId.of('cloudfront-origin-facing-ca-central-1'),
      outputPaths: ['PrefixLists.0.PrefixListId']
    },
    installLatestAwsSdk: false,
    policy: customResources.AwsCustomResourcePolicy.fromStatements([new iam.PolicyStatement({
      actions: ['ec2:DescribeManagedPrefixLists'], resources: ['*']
    })])
  })
  alb.connections.allowFrom(ec2.Peer.prefixList(cloudfrontPrefixList.getResponseField('PrefixLists.0.PrefixListId')), ec2.Port.tcp(80))
  const targets = new elbv2.ApplicationTargetGroup(stack, 'Targets', {
    vpc,
    port: 3000,
    protocol: elbv2.ApplicationProtocol.HTTP,
    targetType: elbv2.TargetType.IP,
    deregistrationDelay: Duration.seconds(30),
    healthCheck: {
      path: '/api/health', healthyHttpCodes: '200',
      interval: Duration.seconds(30), timeout: Duration.seconds(5),
      healthyThresholdCount: 2, unhealthyThresholdCount: 3
    }
  })
  const listener = alb.addListener('Http', {
    port: 80, open: false, defaultTargetGroups: [targets]
  })
  const vpcOrigin = new cloudfront.VpcOrigin(stack, 'PrivateOrigin', {
    endpoint: cloudfront.VpcOriginEndpoint.applicationLoadBalancer(alb),
    protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY
  })
  vpcOrigin.node.addDependency(listener, vpc.internetConnectivityEstablished)
  for (const resource of vpc.node.findAll()) {
    if (resource instanceof ec2.CfnVPCGatewayAttachment) vpcOrigin.node.addDependency(resource)
  }
  const distribution = new cloudfront.Distribution(stack, 'Distribution', {
    comment: 'GCS-SSC demo',
    priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    defaultBehavior: {
      origin: origins.VpcOrigin.withVpcOrigin(vpcOrigin, { readTimeout: Duration.seconds(60) }),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      compress: true
    },
    errorResponses: [500, 502, 503, 504].map(httpStatus => ({ httpStatus, ttl: Duration.seconds(0) }))
  })
  const publicUrl = `https://${distribution.distributionDomainName}`

  const databaseSecret = new secretsmanager.Secret(stack, 'DatabaseSecret', {
    generateSecretString: {
      secretStringTemplate: JSON.stringify({ username: 'gcs_ssc' }),
      generateStringKey: 'password', passwordLength: 64, excludePunctuation: true
    },
    removalPolicy: RemovalPolicy.RETAIN
  })
  const database = new rds.DatabaseInstance(stack, 'Database', {
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_17_9 }),
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
    credentials: rds.Credentials.fromSecret(databaseSecret),
    databaseName: 'gcs_ssc',
    allocatedStorage: 20,
    maxAllocatedStorage: 50,
    storageType: rds.StorageType.GP3,
    storageEncrypted: true,
    multiAz: false,
    publiclyAccessible: false,
    backupRetention: Duration.days(7),
    deletionProtection: true,
    removalPolicy: RemovalPolicy.SNAPSHOT,
    parameters: { 'rds.force_ssl': '1' },
    autoMinorVersionUpgrade: true
  })
  database.connections.allowDefaultPortFrom(appSecurityGroup)
  const authSecret = new secretsmanager.Secret(stack, 'AuthSecret', {
    generateSecretString: { passwordLength: 64, excludePunctuation: true },
    removalPolicy: RemovalPolicy.RETAIN
  })
  const extensionSeed = new secretsmanager.Secret(stack, 'ExtensionSecretSeed', {
    generateSecretString: { passwordLength: 64, excludePunctuation: true },
    removalPolicy: RemovalPolicy.RETAIN
  })
  const files = new efs.FileSystem(stack, 'Files', {
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    encrypted: true,
    allowAnonymousAccess: false,
    fileSystemPolicy: new iam.PolicyDocument({ statements: [new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['elasticfilesystem:Client*'],
      resources: ['*'],
      conditions: { Bool: { 'aws:SecureTransport': 'false' } }
    })] }),
    enableAutomaticBackups: true,
    throughputMode: efs.ThroughputMode.BURSTING,
    removalPolicy: RemovalPolicy.RETAIN
  })
  const accessPoint = files.addAccessPoint('ApplicationFiles', {
    path: '/files',
    posixUser: { uid: '1000', gid: '1000' },
    createAcl: { ownerUid: '1000', ownerGid: '1000', permissions: '700' }
  })
  files.connections.allowDefaultPortFrom(appSecurityGroup)

  const cluster = new ecs.Cluster(stack, 'Cluster', { vpc })
  const task = new ecs.FargateTaskDefinition(stack, 'Task', {
    cpu: 1024, memoryLimitMiB: 4096,
    runtimePlatform: {
      cpuArchitecture: ecs.CpuArchitecture.X86_64,
      operatingSystemFamily: ecs.OperatingSystemFamily.LINUX
    },
    volumes: [{
      name: 'files',
      efsVolumeConfiguration: {
        fileSystemId: files.fileSystemId,
        transitEncryption: 'ENABLED',
        authorizationConfig: { accessPointId: accessPoint.accessPointId, iam: 'ENABLED' }
      }
    }]
  })
  task.addToTaskRolePolicy(new iam.PolicyStatement({
    actions: ['elasticfilesystem:ClientMount', 'elasticfilesystem:ClientWrite'],
    resources: [files.fileSystemArn],
    conditions: { StringEquals: { 'elasticfilesystem:AccessPointArn': accessPoint.accessPointArn } }
  }))
  const logGroup = new logs.LogGroup(stack, 'ApplicationLogs', {
    retention: logs.RetentionDays.TWO_WEEKS,
    removalPolicy: RemovalPolicy.DESTROY
  })
  const container = task.addContainer('Application', {
    image: ecs.ContainerImage.fromRegistry(imageReference),
    command: ['node', '.output/server/aws-start.mjs'],
    logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'app', logGroup }),
    stopTimeout: Duration.seconds(120),
    environment: {
      ENVIRONMENT_TYPE: 'demo',
      AWS_REGION: 'ca-central-1',
      AWS_DB_HOST: database.dbInstanceEndpointAddress,
      AWS_DB_USER: 'gcs_ssc',
      BETTER_AUTH_URL: publicUrl,
      BETTER_AUTH_TRUSTED_ORIGINS: publicUrl,
      GCS_LOCAL_FILE_STORAGE_DIR: '/app/.data/files'
    },
    secrets: {
      AWS_DB_PASSWORD: ecs.Secret.fromSecretsManager(databaseSecret, 'password'),
      BETTER_AUTH_SECRET: ecs.Secret.fromSecretsManager(authSecret),
      AWS_EXTENSION_SECRET_SEED: ecs.Secret.fromSecretsManager(extensionSeed)
    },
    portMappings: [{ containerPort: 3000 }]
  })
  container.addMountPoints({ sourceVolume: 'files', containerPath: '/app/.data/files', readOnly: false })
  const service = new ecs.FargateService(stack, 'Service', {
    cluster, taskDefinition: task,
    desiredCount: 1,
    assignPublicIp: true,
    vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    securityGroups: [appSecurityGroup],
    // Stop the old revision before startup migrations; demo updates incur downtime.
    minHealthyPercent: 0, maxHealthyPercent: 100,
    circuitBreaker: { rollback: true },
    healthCheckGracePeriod: Duration.seconds(300),
    platformVersion: ecs.FargatePlatformVersion.VERSION1_4
  })
  service.connections.allowFrom(alb, ec2.Port.tcp(3000))
  service.attachToApplicationTargetGroup(targets)
  service.node.addDependency(files.mountTargetsAvailable, database, listener)

  const portalSecurityGroup = new ec2.SecurityGroup(stack, 'PortalAppSecurityGroup', { vpc })
  const portalAlb = new elbv2.ApplicationLoadBalancer(stack, 'PortalLoadBalancer', {
    vpc,
    internetFacing: false,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    idleTimeout: Duration.seconds(120)
  })
  portalAlb.connections.allowFrom(
    ec2.Peer.prefixList(cloudfrontPrefixList.getResponseField('PrefixLists.0.PrefixListId')),
    ec2.Port.tcp(80)
  )
  const portalTargets = new elbv2.ApplicationTargetGroup(stack, 'PortalTargets', {
    vpc,
    port: 3000,
    protocol: elbv2.ApplicationProtocol.HTTP,
    targetType: elbv2.TargetType.IP,
    deregistrationDelay: Duration.seconds(30),
    healthCheck: {
      path: '/api/session', healthyHttpCodes: '200',
      interval: Duration.seconds(30), timeout: Duration.seconds(5),
      healthyThresholdCount: 2, unhealthyThresholdCount: 3
    }
  })
  const portalListener = portalAlb.addListener('Http', {
    port: 80, open: false, defaultTargetGroups: [portalTargets]
  })
  const portalVpcOrigin = new cloudfront.VpcOrigin(stack, 'PortalPrivateOrigin', {
    endpoint: cloudfront.VpcOriginEndpoint.applicationLoadBalancer(portalAlb),
    protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY
  })
  portalVpcOrigin.node.addDependency(portalListener, vpc.internetConnectivityEstablished)
  for (const resource of vpc.node.findAll()) {
    if (resource instanceof ec2.CfnVPCGatewayAttachment) portalVpcOrigin.node.addDependency(resource)
  }
  const portalDistribution = new cloudfront.Distribution(stack, 'PortalDistribution', {
    comment: 'GCS-SSC Portal demo',
    priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    defaultBehavior: {
      origin: origins.VpcOrigin.withVpcOrigin(portalVpcOrigin, { readTimeout: Duration.seconds(60) }),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      compress: true
    },
    errorResponses: [500, 502, 503, 504].map(httpStatus => ({ httpStatus, ttl: Duration.seconds(0) }))
  })
  const portalUrl = `https://${portalDistribution.distributionDomainName}`
  const portalDatabaseSecret = new secretsmanager.Secret(stack, 'PortalDatabaseSecret', {
    generateSecretString: {
      secretStringTemplate: JSON.stringify({ username: 'portal' }),
      generateStringKey: 'password', passwordLength: 64, excludePunctuation: true
    },
    removalPolicy: RemovalPolicy.RETAIN
  })
  const portalDatabase = new rds.DatabaseInstance(stack, 'PortalDatabase', {
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_17_9 }),
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
    credentials: rds.Credentials.fromSecret(portalDatabaseSecret),
    databaseName: 'portal',
    allocatedStorage: 20,
    maxAllocatedStorage: 50,
    storageType: rds.StorageType.GP3,
    storageEncrypted: true,
    multiAz: false,
    publiclyAccessible: false,
    backupRetention: Duration.days(7),
    deletionProtection: true,
    removalPolicy: RemovalPolicy.SNAPSHOT,
    parameters: { 'rds.force_ssl': '1' },
    autoMinorVersionUpgrade: true
  })
  portalDatabase.connections.allowDefaultPortFrom(portalSecurityGroup)
  const portalAuthSecret = new secretsmanager.Secret(stack, 'PortalAuthSecret', {
    generateSecretString: { passwordLength: 64, excludePunctuation: true },
    removalPolicy: RemovalPolicy.RETAIN
  })
  const portalAttachments = new s3.Bucket(stack, 'PortalAttachments', {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    encryption: s3.BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    versioned: true,
    objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    removalPolicy: RemovalPolicy.RETAIN,
    lifecycleRules: [{
      abortIncompleteMultipartUploadAfter: Duration.days(7),
      noncurrentVersionExpiration: Duration.days(30)
    }]
  })
  const portalTask = new ecs.FargateTaskDefinition(stack, 'PortalTask', {
    cpu: 512, memoryLimitMiB: 1024,
    runtimePlatform: {
      cpuArchitecture: ecs.CpuArchitecture.X86_64,
      operatingSystemFamily: ecs.OperatingSystemFamily.LINUX
    }
  })
  portalTask.addToTaskRolePolicy(new iam.PolicyStatement({
    actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
    resources: [portalAttachments.arnForObjects('portal-attachments/*')]
  }))
  const portalLogGroup = new logs.LogGroup(stack, 'PortalApplicationLogs', {
    retention: logs.RetentionDays.TWO_WEEKS,
    removalPolicy: RemovalPolicy.DESTROY
  })
  portalTask.addContainer('Application', {
    image: ecs.ContainerImage.fromRegistry(readPortalDemoImage()),
    command: ['node', '.output/aws-start.mjs'],
    logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'portal', logGroup: portalLogGroup }),
    stopTimeout: Duration.seconds(120),
    environment: {
      AWS_DB_HOST: portalDatabase.dbInstanceEndpointAddress,
      AWS_DB_USER: 'portal',
      APP_URL: portalUrl,
      S3_BUCKET: portalAttachments.bucketName,
      S3_REGION: 'ca-central-1'
    },
    secrets: {
      AWS_DB_PASSWORD: ecs.Secret.fromSecretsManager(portalDatabaseSecret, 'password'),
      BETTER_AUTH_SECRET: ecs.Secret.fromSecretsManager(portalAuthSecret)
    },
    portMappings: [{ containerPort: 3000 }]
  })
  const portalService = new ecs.FargateService(stack, 'PortalService', {
    cluster, taskDefinition: portalTask,
    desiredCount: 1,
    assignPublicIp: true,
    vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    securityGroups: [portalSecurityGroup],
    minHealthyPercent: 0, maxHealthyPercent: 100,
    circuitBreaker: { rollback: true },
    healthCheckGracePeriod: Duration.seconds(300),
    platformVersion: ecs.FargatePlatformVersion.VERSION1_4
  })
  portalService.connections.allowFrom(portalAlb, ec2.Port.tcp(3000))
  portalService.attachToApplicationTargetGroup(portalTargets)
  portalService.node.addDependency(portalDatabase, portalListener)

  const metabaseSecurityGroup = new ec2.SecurityGroup(stack, 'MetabaseAppSecurityGroup', { vpc })
  const metabaseAlb = new elbv2.ApplicationLoadBalancer(stack, 'MetabaseLoadBalancer', {
    vpc,
    internetFacing: false,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    idleTimeout: Duration.seconds(120)
  })
  metabaseAlb.connections.allowFrom(
    ec2.Peer.prefixList(cloudfrontPrefixList.getResponseField('PrefixLists.0.PrefixListId')),
    ec2.Port.tcp(80)
  )
  const metabaseTargets = new elbv2.ApplicationTargetGroup(stack, 'MetabaseTargets', {
    vpc,
    port: 3000,
    protocol: elbv2.ApplicationProtocol.HTTP,
    targetType: elbv2.TargetType.IP,
    deregistrationDelay: Duration.seconds(30),
    healthCheck: {
      path: '/api/health', healthyHttpCodes: '200',
      interval: Duration.seconds(30), timeout: Duration.seconds(5),
      healthyThresholdCount: 2, unhealthyThresholdCount: 3
    }
  })
  const metabaseListener = metabaseAlb.addListener('Http', {
    port: 80, open: false, defaultTargetGroups: [metabaseTargets]
  })
  const metabaseVpcOrigin = new cloudfront.VpcOrigin(stack, 'MetabasePrivateOrigin', {
    endpoint: cloudfront.VpcOriginEndpoint.applicationLoadBalancer(metabaseAlb),
    protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY
  })
  metabaseVpcOrigin.node.addDependency(metabaseListener, vpc.internetConnectivityEstablished)
  for (const resource of vpc.node.findAll()) {
    if (resource instanceof ec2.CfnVPCGatewayAttachment) metabaseVpcOrigin.node.addDependency(resource)
  }
  const metabaseDistribution = new cloudfront.Distribution(stack, 'MetabaseDistribution', {
    comment: 'GCS-SSC Metabase demo',
    enabled: true,
    priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    defaultBehavior: {
      origin: origins.VpcOrigin.withVpcOrigin(metabaseVpcOrigin, { readTimeout: Duration.seconds(60) }),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      compress: true
    },
    errorResponses: [500, 502, 503, 504].map(httpStatus => ({ httpStatus, ttl: Duration.seconds(0) }))
  })
  const metabaseUrl = `https://${metabaseDistribution.distributionDomainName}`
  const metabaseDatabaseSecret = new secretsmanager.Secret(stack, 'MetabaseDatabaseSecret', {
    generateSecretString: {
      secretStringTemplate: JSON.stringify({ username: 'metabase' }),
      generateStringKey: 'password', passwordLength: 64, excludePunctuation: true
    },
    removalPolicy: RemovalPolicy.RETAIN
  })
  const metabaseDatabase = new rds.DatabaseInstance(stack, 'MetabaseDatabase', {
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_17_9 }),
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
    credentials: rds.Credentials.fromSecret(metabaseDatabaseSecret),
    databaseName: 'metabase',
    allocatedStorage: 20,
    maxAllocatedStorage: 50,
    storageType: rds.StorageType.GP3,
    storageEncrypted: true,
    multiAz: false,
    publiclyAccessible: false,
    backupRetention: Duration.days(7),
    deletionProtection: true,
    removalPolicy: RemovalPolicy.SNAPSHOT,
    parameters: { 'rds.force_ssl': '1' },
    autoMinorVersionUpgrade: true
  })
  metabaseDatabase.connections.allowDefaultPortFrom(metabaseSecurityGroup)
  // Metabase's data-source connection to GCS also stays inside this VPC.
  database.connections.allowDefaultPortFrom(metabaseSecurityGroup)
  const metabaseAdminSecret = new secretsmanager.Secret(stack, 'MetabaseAdminSecret', {
    generateSecretString: {
      secretStringTemplate: JSON.stringify({ email: 'admin@gcs-ssc.example' }),
      generateStringKey: 'password', passwordLength: 32, excludePunctuation: true
    },
    removalPolicy: RemovalPolicy.RETAIN
  })
  const metabaseSessionSecret = new secretsmanager.Secret(stack, 'MetabaseSessionSecret', {
    generateSecretString: { passwordLength: 64, excludePunctuation: true },
    removalPolicy: RemovalPolicy.RETAIN
  })
  const metabaseEncryptionSecret = new secretsmanager.Secret(stack, 'MetabaseEncryptionSecret', {
    generateSecretString: { passwordLength: 64, excludePunctuation: true },
    removalPolicy: RemovalPolicy.RETAIN
  })
  const metabaseTask = new ecs.FargateTaskDefinition(stack, 'MetabaseTask', {
    cpu: 1024, memoryLimitMiB: 2048,
    runtimePlatform: {
      cpuArchitecture: ecs.CpuArchitecture.X86_64,
      operatingSystemFamily: ecs.OperatingSystemFamily.LINUX
    },
    volumes: [{ name: 'rds-ca' }]
  })
  const metabaseCa = metabaseTask.addContainer('RdsCa', {
    image: ecs.ContainerImage.fromRegistry('alpine@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8'),
    command: [
      'sh', '-ec',
      'wget -qO /rds-ca/ca.pem https://truststore.pki.rds.amazonaws.com/ca-central-1/ca-central-1-bundle.pem && grep -q "BEGIN CERTIFICATE" /rds-ca/ca.pem'
    ],
    essential: false,
    logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'metabase-ca' })
  })
  metabaseCa.addMountPoints({ sourceVolume: 'rds-ca', containerPath: '/rds-ca', readOnly: false })
  const metabaseLogGroup = new logs.LogGroup(stack, 'MetabaseApplicationLogs', {
    retention: logs.RetentionDays.TWO_WEEKS,
    removalPolicy: RemovalPolicy.DESTROY
  })
  const metabaseContainer = metabaseTask.addContainer('Application', {
    image: ecs.ContainerImage.fromRegistry('metabase/metabase@sha256:ca6d63cbedfd0a66a3c0239ac79a9df5f7ef3f2455027ab97e3bb26cbf281999'),
    logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'metabase', logGroup: metabaseLogGroup }),
    stopTimeout: Duration.seconds(120),
    environment: {
      MB_DB_TYPE: 'postgres',
      MB_DB_CONNECTION_URI: `jdbc:postgresql://${metabaseDatabase.dbInstanceEndpointAddress}:5432/metabase?sslmode=verify-full&sslrootcert=/rds-ca/ca.pem`,
      MB_DB_USER: 'metabase',
      MB_SITE_URL: metabaseUrl
    },
    secrets: {
      MB_DB_PASS: ecs.Secret.fromSecretsManager(metabaseDatabaseSecret, 'password'),
      MB_SESSION_SECRET_KEY: ecs.Secret.fromSecretsManager(metabaseSessionSecret),
      MB_ENCRYPTION_SECRET_KEY: ecs.Secret.fromSecretsManager(metabaseEncryptionSecret)
    },
    portMappings: [{ containerPort: 3000 }]
  })
  metabaseContainer.addMountPoints({ sourceVolume: 'rds-ca', containerPath: '/rds-ca', readOnly: true })
  metabaseContainer.addContainerDependencies({
    container: metabaseCa, condition: ecs.ContainerDependencyCondition.SUCCESS
  })
  const metabaseSetup = metabaseTask.addContainer('Setup', {
    image: ecs.ContainerImage.fromRegistry('python@sha256:9e9fde4d32eedce0b661d9ab91e826b62dddf28e928c230ec55f1866cac66b01'),
    command: ['python', '-c', readFileSync(new URL('./metabase-setup.py', import.meta.url), 'utf8')],
    essential: false,
    logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'metabase-setup', logGroup: metabaseLogGroup }),
    environment: { METABASE_ADMIN_EMAIL: 'admin@gcs-ssc.example' },
    secrets: { METABASE_ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(metabaseAdminSecret, 'password') }
  })
  metabaseSetup.addContainerDependencies({
    container: metabaseContainer, condition: ecs.ContainerDependencyCondition.START
  })
  const metabaseService = new ecs.FargateService(stack, 'MetabaseService', {
    cluster, taskDefinition: metabaseTask,
    desiredCount: 1,
    assignPublicIp: true,
    vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    securityGroups: [metabaseSecurityGroup],
    minHealthyPercent: 0, maxHealthyPercent: 100,
    circuitBreaker: { rollback: true },
    healthCheckGracePeriod: Duration.seconds(300),
    platformVersion: ecs.FargatePlatformVersion.VERSION1_4
  })
  metabaseService.connections.allowFrom(metabaseAlb, ec2.Port.tcp(3000))
  metabaseService.attachToApplicationTargetGroup(metabaseTargets)
  metabaseService.node.addDependency(metabaseDatabase, metabaseListener)

  const budgetEmail = stack.node.tryGetContext('budgetEmail') as string | undefined
  const monthlyBudgetUsd = Number(stack.node.tryGetContext('monthlyBudgetUsd') ?? 200)
  if (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd <= 0) {
    throw new Error('monthlyBudgetUsd must be a positive number')
  }
  if (budgetEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(budgetEmail)) {
    throw new Error('budgetEmail must be an email address')
  }
  const monthlyBudget = new budgets.CfnBudget(stack, 'MonthlyBudget', {
    budget: {
      // Notification changes replace this resource; let AWS allocate a unique name.
      budgetType: 'COST', timeUnit: 'MONTHLY',
      budgetLimit: { amount: monthlyBudgetUsd, unit: 'USD' }
    },
    notificationsWithSubscribers: budgetEmail
      ? [80, 100].map(threshold => ({
          notification: { comparisonOperator: 'GREATER_THAN', notificationType: 'ACTUAL', threshold, thresholdType: 'PERCENTAGE' },
          subscribers: [{ address: budgetEmail, subscriptionType: 'EMAIL' }]
        }))
      : undefined
  })

  new CfnOutput(stack, 'Url', { value: publicUrl })
  new CfnOutput(stack, 'HealthUrl', { value: `${publicUrl}/api/health` })
  new CfnOutput(stack, 'ClusterName', { value: cluster.clusterName })
  new CfnOutput(stack, 'ServiceName', { value: service.serviceName })
  new CfnOutput(stack, 'LogGroupName', { value: logGroup.logGroupName })
  new CfnOutput(stack, 'DatabaseSecretArn', { value: databaseSecret.secretArn })
  new CfnOutput(stack, 'FileSystemId', { value: files.fileSystemId })
  new CfnOutput(stack, 'S3BucketName', { value: futureStorage.bucketName })
  new CfnOutput(stack, 'S3BucketArn', { value: futureStorage.bucketArn })
  new CfnOutput(stack, 'BudgetName', { value: monthlyBudget.ref })
  new CfnOutput(stack, 'PortalUrl', { value: portalUrl })
  new CfnOutput(stack, 'PortalHealthUrl', { value: `${portalUrl}/api/session` })
  new CfnOutput(stack, 'PortalServiceName', { value: portalService.serviceName })
  new CfnOutput(stack, 'PortalLogGroupName', { value: portalLogGroup.logGroupName })
  new CfnOutput(stack, 'PortalDatabaseSecretArn', { value: portalDatabaseSecret.secretArn })
  new CfnOutput(stack, 'PortalAttachmentBucketName', { value: portalAttachments.bucketName })
  new CfnOutput(stack, 'MetabaseUrl', { value: metabaseUrl })
  new CfnOutput(stack, 'MetabaseHealthUrl', { value: `${metabaseUrl}/api/health` })
  new CfnOutput(stack, 'MetabaseServiceName', { value: metabaseService.serviceName })
  new CfnOutput(stack, 'MetabaseLogGroupName', { value: metabaseLogGroup.logGroupName })
  new CfnOutput(stack, 'MetabaseDatabaseSecretArn', { value: metabaseDatabaseSecret.secretArn })
  new CfnOutput(stack, 'MetabaseAdminSecretArn', { value: metabaseAdminSecret.secretArn })
  return stack
}
