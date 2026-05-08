import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { SqsDestination } from 'aws-cdk-lib/aws-lambda-destinations';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Rule } from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import * as path from 'path';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import { NagSuppressions } from 'cdk-nag';

export interface BackendStackProps extends cdk.StackProps {
  bdaProjectArn: string;
  bdaProfileArn: string;
}

export class BackendStack extends cdk.Stack {
  public readonly amplifyAppArn: string;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    // Use account ID for resource uniqueness in Workshop Studio
    const accountId = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;

    // BDA project, profile, and backend all deploy to the same target region.
    // Extract the region from the project ARN for IAM policy scoping (CRIS regions).
    // ARN format: arn:aws:bedrock:<region>:<account>:data-automation-project/<id>
    const bdaRegion = props.bdaProjectArn
      ? cdk.Arn.split(props.bdaProjectArn, cdk.ArnFormat.SLASH_RESOURCE_NAME).region!
      : region;

    // -------------------------------------------------------
    // 1. Authentication — Cognito User Pool + Identity Pool
    // -------------------------------------------------------
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `idp-workshop-${accountId}`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.NONE,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      // FeaturePlan.ESSENTIALS keeps costs low for the workshop.
      // Threat protection (standardThreatProtectionMode) requires FeaturePlan.PLUS.
      // For production, upgrade to PLUS and add standardThreatProtectionMode: AUDIT_ONLY or FULL_FUNCTION.
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
    });

    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      oAuth: {
        flows: { implicitCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(7),
      preventUserExistenceErrors: true,
    });

    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: `idp_workshop_${accountId}`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [{
        clientId: userPoolClient.userPoolClientId,
        providerName: userPool.userPoolProviderName,
      }],
    });

    const authenticatedRole = new iam.Role(this, 'CognitoAuthRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
          'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    });

    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoles', {
      identityPoolId: identityPool.ref,
      roles: { authenticated: authenticatedRole.roleArn },
    });

    // -------------------------------------------------------
    // 2. Storage — S3 Buckets
    // -------------------------------------------------------

    // Primary storage bucket
    // Note: CORS allowedOrigins is set after the Amplify app is created (see below)
    const storageBucket = new s3.Bucket(this, 'StorageBucket', {
      bucketName: `idp-workshop-storage-${accountId}-${region}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    storageBucket.grantReadWrite(authenticatedRole, 'input-files/*');
    storageBucket.grantRead(authenticatedRole, 'output-files/*');

    // -------------------------------------------------------
    // 3. Data — DynamoDB Tables (account-unique names)
    // -------------------------------------------------------
    const fileTable = new dynamodb.Table(this, 'FileTable', {
      tableName: `idp-workshop-file-${accountId}`,
      partitionKey: { name: 'fileId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    const fileDataTable = new dynamodb.Table(this, 'FileDataTable', {
      tableName: `idp-workshop-filedata-${accountId}`,
      partitionKey: { name: 'fileDataId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });
    fileDataTable.addGlobalSecondaryIndex({
      indexName: 'byFileId',
      partitionKey: { name: 'fileId', type: dynamodb.AttributeType.STRING },
    });

    // -------------------------------------------------------
    // 4. API — AppSync GraphQL
    // -------------------------------------------------------

    // WAF WebACL for AppSync
    const webAcl = new wafv2.CfnWebACL(this, 'AppSyncWebAcl', {
      name: `idp-workshop-waf-${accountId}`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `idp-workshop-waf-${accountId}`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'KnownBadInputsRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'RateLimitRule',
          priority: 3,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // CloudWatch Log Group for AppSync
    // NOTE: This log group is created but not directly wired to the GraphqlApi below —
    // AppSync auto-creates its own log group at `/aws/appsync/apis/<apiId>` when logConfig
    // is set. The CDK L2 GraphqlApi construct does not expose a KMS key property for that
    // auto-created log group (see CfnGraphQLApi.LogConfigProperty), so AppSync logs remain
    // on AWS-managed encryption. For CMK encryption across all log groups, consider using
    // CfnGraphQLApi directly or attaching a KMS key post-deployment via associate-kms-key.

    const api = new appsync.GraphqlApi(this, 'GraphqlApi', {
      name: `idp-workshop-api-${accountId}`,
      definition: appsync.Definition.fromSchema(
        appsync.SchemaFile.fromAsset(path.join(__dirname, 'schema.graphql')),
      ),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.IAM,
        },
      },
      xrayEnabled: true,
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ERROR,
        retention: logs.RetentionDays.ONE_MONTH,
      },
    });

    // Associate WAF WebACL with AppSync API
    new wafv2.CfnWebACLAssociation(this, 'AppSyncWafAssociation', {
      resourceArn: api.arn,
      webAclArn: webAcl.attrArn,
    });

    // File table data source + resolvers
    const fileDS = api.addDynamoDbDataSource('FileDS', fileTable);
    fileDS.createResolver('CreateFile', {
      typeName: 'Mutation',
      fieldName: 'createFile',
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbPutItem(
        appsync.PrimaryKey.partition('fileId').is('input.fileId'),
        appsync.Values.projecting('input'),
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });
    fileDS.createResolver('GetFile', {
      typeName: 'Query',
      fieldName: 'getFile',
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbGetItem('fileId', 'fileId'),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });
    fileDS.createResolver('ListFiles', {
      typeName: 'Query',
      fieldName: 'listFiles',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "Scan",
  "limit": $util.defaultIfNull($ctx.args.limit, 50),
  #if($ctx.args.nextToken)
    "nextToken": "$ctx.args.nextToken",
  #end
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "items": $util.toJson($ctx.result.items),
  "nextToken": $util.toJson($ctx.result.nextToken)
}
      `),
    });
    fileDS.createResolver('UpdateFile', {
      typeName: 'Mutation',
      fieldName: 'updateFile',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "UpdateItem",
  "key": {
    "fileId": $util.dynamodb.toDynamoDBJson($ctx.args.input.fileId)
  },
  "update": {
    "expression": "SET #status = :status, #updatedAt = :updatedAt",
    "expressionNames": {
      "#status": "status",
      "#updatedAt": "updatedAt"
    },
    "expressionValues": {
      ":status": $util.dynamodb.toDynamoDBJson($ctx.args.input.status),
      ":updatedAt": $util.dynamodb.toDynamoDBJson($util.time.nowISO8601())
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

    // FileData table data source + resolvers
    const fileDataDS = api.addDynamoDbDataSource('FileDataDS', fileDataTable);
    fileDataDS.createResolver('GetFileData', {
      typeName: 'Query',
      fieldName: 'getFileData',
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbGetItem('fileDataId', 'fileDataId'),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });
    fileDataDS.createResolver('GetFileDataByFileId', {
      typeName: 'Query',
      fieldName: 'getFileDataByFileId',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "Query",
  "index": "byFileId",
  "query": {
    "expression": "fileId = :fileId",
    "expressionValues": {
      ":fileId": $util.dynamodb.toDynamoDBJson($ctx.args.fileId)
    }
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
#if($ctx.result.items.size() > 0)
  $util.toJson($ctx.result.items[0])
#else
  null
#end
      `),
    });

    // Grant authenticated role access to AppSync
    api.grant(authenticatedRole, appsync.IamResource.all(), 'appsync:GraphQL');

    // -------------------------------------------------------
    // 5. BDA Processing Pipeline — Lambda + EventBridge
    // -------------------------------------------------------
    const lambdaDir = path.join(__dirname, '..', 'lambda');

    const dlq = new sqs.Queue(this, 'ProcessingDLQ', {
      queueName: `idp-workshop-dlq-${accountId}`,
      retentionPeriod: cdk.Duration.days(14),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      enforceSSL: true,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: cdk.Duration.minutes(5), // exceeds longest Lambda timeout (3 min)
    });

    // CloudWatch Log Groups for Lambda functions (explicit retention).
    //
    // Log data is encrypted at rest by CloudWatch Logs using AES-256 server-side encryption
    // by default. To use a customer-managed KMS key instead (for CloudTrail auditability,
    // rotation control, or compliance requirements), pass `encryptionKey` here and add a
    // key policy statement allowing the CloudWatch Logs service principal to use the key.
    // See: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html
    //
    // A data protection policy is attached to each Lambda log group to audit and mask
    // common personal-identifier patterns (address, credit card, email, name, phone) that
    // might appear in future log-level changes or error stack traces. Readers without the
    // logs:Unmask permission see masked values; the application's own logger avoids writing
    // personal data in the first place. Add the matching DataIdentifier entries below if
    // you extend the solution with blueprints that extract additional sensitive identifiers.
    // See: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/mask-sensitive-log-data.html
    const buildLambdaLogDataProtectionPolicy = (name: string) =>
      new logs.DataProtectionPolicy({
        name,
        description: 'Mask common personal-identifier patterns that may appear in Lambda logs',
        identifiers: [
          logs.DataIdentifier.ADDRESS,
          logs.DataIdentifier.CREDITCARDNUMBER,
          logs.DataIdentifier.EMAILADDRESS,
          logs.DataIdentifier.NAME,
          logs.DataIdentifier.PHONENUMBER_US,
        ],
      });

    const processS3InputLogGroup = new logs.LogGroup(this, 'ProcessS3InputLogGroup', {
      logGroupName: `/aws/lambda/idp-workshop-process-s3-input-${accountId}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      dataProtectionPolicy: buildLambdaLogDataProtectionPolicy('idp-workshop-process-s3-input-dpp'),
    });

    const processBDAOutputLogGroup = new logs.LogGroup(this, 'ProcessBDAOutputLogGroup', {
      logGroupName: `/aws/lambda/idp-workshop-process-bda-output-${accountId}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      dataProtectionPolicy: buildLambdaLogDataProtectionPolicy('idp-workshop-process-bda-output-dpp'),
    });

    const processS3Input = new lambda.NodejsFunction(this, 'ProcessS3Input', {
      functionName: `idp-workshop-process-s3-input-${accountId}`,
      entry: path.join(lambdaDir, 'process-s3-input', 'handler.ts'),
      onFailure: new SqsDestination(dlq),
      environment: {
        DYNAMODB_TABLE_FILE: fileTable.tableName,
        S3_BUCKET_NAME: storageBucket.bucketName,
        S3_BUCKET_INPUT_PATH: 'input-files',
        S3_BUCKET_OUTPUT_PATH: 'output-files',
        BEDROCK_DATA_AUTOMATION_PROJECT_ARN: props.bdaProjectArn,
        BEDROCK_DATA_AUTOMATION_PROFILE_ARN: props.bdaProfileArn,
        BEDROCK_DATA_AUTOMATION_BLUEPRINT_ARN: '',
      },
      runtime: Runtime.NODEJS_LATEST,
      bundling: { minify: true, sourceMap: true, target: 'node22', externalModules: [], forceDockerBundling: false },
      retryAttempts: 1,
      memorySize: 256,
      timeout: cdk.Duration.minutes(1),
      architecture: Architecture.ARM_64,
      reservedConcurrentExecutions: 10,
      tracing: cdk.aws_lambda.Tracing.ACTIVE,
      logGroup: processS3InputLogGroup,
    });

    storageBucket.grantReadWrite(processS3Input);
    fileTable.grantReadWriteData(processS3Input);

    // InvokeDataAutomationAsync requires: data-automation-project, data-automation-profile, blueprint
    // BDA uses Cross Region Inference Support (CRIS) — requests from a source region may be
    // routed to any region in the same geography. The IAM policy must include all CRIS regions.
    // See: https://docs.aws.amazon.com/bedrock/latest/userguide/bda-cris.html
    const usRegions = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2'];
    const euRegions = ['eu-central-1', 'eu-north-1', 'eu-south-1', 'eu-south-2', 'eu-west-1', 'eu-west-3'];
    const apacRegions = ['ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3', 'ap-south-1', 'ap-south-2', 'ap-southeast-1', 'ap-southeast-2', 'ap-southeast-4'];
    const crisRegionMap: Record<string, string[]> = {
      ...Object.fromEntries(usRegions.map(r => [r, usRegions])),
      ...Object.fromEntries(euRegions.map(r => [r, euRegions])),
      ...Object.fromEntries(apacRegions.map(r => [r, apacRegions])),
      'eu-west-2': ['eu-west-2'],
    };
    const crisRegions = crisRegionMap[bdaRegion] || [bdaRegion];

    processS3Input.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeDataAutomationAsync'],
      resources: [
        ...(props.bdaProjectArn ? [props.bdaProjectArn] : [`arn:aws:bedrock:${bdaRegion}:${accountId}:data-automation-project/*`]),
        ...crisRegions.map(r => `arn:aws:bedrock:${r}:${accountId}:data-automation-profile/*`),
        `arn:aws:bedrock:${bdaRegion}:${accountId}:blueprint/*`,
      ],
    }));

    // GetDataAutomationStatus requires: data-automation-invocation-job
    processS3Input.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:GetDataAutomationStatus'],
      resources: [
        ...crisRegions.map(r => `arn:aws:bedrock:${r}:${accountId}:data-automation-invocation/*`),
      ],
    }));

    processS3Input.addEventSource(new S3EventSource(storageBucket, {
      events: [s3.EventType.OBJECT_CREATED],
      filters: [{ prefix: 'input-files/' }],
    }));

    const processBDAOutput = new lambda.NodejsFunction(this, 'ProcessBDAOutput', {
      functionName: `idp-workshop-process-bda-output-${accountId}`,
      entry: path.join(lambdaDir, 'process-bda-output', 'handler.ts'),
      onFailure: new SqsDestination(dlq),
      environment: {
        S3_BUCKET_NAME: storageBucket.bucketName,
        S3_BUCKET_OUTPUT_PATH: 'output-files',
        DYNAMODB_TABLE_FILE: fileTable.tableName,
        DYNAMODB_TABLE_FILEDATA: fileDataTable.tableName,
      },
      runtime: Runtime.NODEJS_LATEST,
      bundling: { minify: true, sourceMap: true, target: 'node22', externalModules: [], forceDockerBundling: false },
      retryAttempts: 1,
      memorySize: 256,
      timeout: cdk.Duration.minutes(3),
      architecture: Architecture.ARM_64,
      reservedConcurrentExecutions: 10,
      tracing: cdk.aws_lambda.Tracing.ACTIVE,
      logGroup: processBDAOutputLogGroup,
    });

    storageBucket.grantRead(processBDAOutput);
    fileTable.grantReadWriteData(processBDAOutput);
    fileDataTable.grantReadWriteData(processBDAOutput);

    new Rule(this, 'BDAJobSucceededRule', {
      ruleName: `idp-workshop-bda-rule-${accountId}`,
      eventPattern: {
        source: ['aws.bedrock'],
        detailType: ['Bedrock Data Automation Job Succeeded'],
      },
      targets: [new targets.LambdaFunction(processBDAOutput, {
        maxEventAge: cdk.Duration.minutes(10),
        retryAttempts: 2,
        deadLetterQueue: dlq,
      })],
    });

    // -------------------------------------------------------
    // 6. Frontend Hosting — Amplify Hosting (manual deploy)
    // -------------------------------------------------------
    const amplifyApp = new amplify.CfnApp(this, 'FrontendApp', {
      name: `idp-workshop-frontend-${accountId}`,
      platform: 'WEB',
      customRules: [
        {
          source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>',
          target: '/index.html',
          status: '200',
        },
      ],
    });

    const amplifyBranch = new amplify.CfnBranch(this, 'MainBranch', {
      appId: amplifyApp.attrAppId,
      branchName: 'main',
      enableAutoBuild: false,
    });

    // WAF WebACL for Amplify Hosting is CLOUDFRONT-scoped and must live in us-east-1.
    // The WebACLAssociation also has to be created in us-east-1 (that's the only region
    // where WAFv2 manages CLOUDFRONT-scoped resources). Both live in FrontendWafStack;
    // we expose the Amplify app ARN for a cross-region reference back to that stack.
    this.amplifyAppArn = amplifyApp.attrArn;

    // Set S3 CORS to allow only the Amplify frontend origin (not wildcard)
    const cfnBucket = storageBucket.node.defaultChild as s3.CfnBucket;
    cfnBucket.corsConfiguration = {
      corsRules: [{
        allowedHeaders: ['*'],
        allowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
        allowedOrigins: [`https://main.${amplifyApp.attrDefaultDomain}`],
        exposedHeaders: ['x-amz-server-side-encryption', 'x-amz-request-id', 'x-amz-id-2', 'ETag'],
        maxAge: 3000,
      }],
    };

    // -------------------------------------------------------
    // 7. Stack Outputs — consumed by frontend config script
    // -------------------------------------------------------
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'IdentityPoolId', { value: identityPool.ref });
    new cdk.CfnOutput(this, 'StorageBucketName', { value: storageBucket.bucketName });
    new cdk.CfnOutput(this, 'GraphqlApiUrl', { value: api.graphqlUrl });
    new cdk.CfnOutput(this, 'GraphqlApiId', { value: api.apiId });
    new cdk.CfnOutput(this, 'Region', { value: this.region });
    new cdk.CfnOutput(this, 'FileTableName', { value: fileTable.tableName });
    new cdk.CfnOutput(this, 'FileDataTableName', { value: fileDataTable.tableName });
    new cdk.CfnOutput(this, 'DLQUrl', { value: dlq.queueUrl });
    new cdk.CfnOutput(this, 'AmplifyAppId', { value: amplifyApp.attrAppId });
    new cdk.CfnOutput(this, 'AmplifyAppUrl', {
      value: `https://main.${amplifyApp.attrDefaultDomain}`,
    });

    // -------------------------------------------------------
    // 8. CDK Nag Suppressions
    // -------------------------------------------------------

    // AwsSolutions-IAM4: AWS managed policies used by CDK-managed and service-linked roles.
    // These are internal constructs (log retention, S3 bucket notifications, AppSync logging)
    // where CDK auto-creates roles with AWS managed policies. Replacing them with custom
    // policies is not practical and would break CDK's internal plumbing.
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-L1',
        reason:
          'Lambda functions use Runtime.NODEJS_LATEST which resolves to the latest Node.js runtime available ' +
          'in all regions. cdk-nag does not recognize NODEJS_LATEST as satisfying the L1 rule because it ' +
          'compares against a static runtime string rather than checking the isVariable flag.',
      },
      {
        id: 'AwsSolutions-IAM4',
        reason:
          'AWSLambdaBasicExecutionRole is used by CDK-managed Lambda functions (log retention custom resource, ' +
          'S3 bucket notifications handler) and application Lambdas. This managed policy grants only CloudWatch Logs ' +
          'write permissions (logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents) which is the minimum ' +
          'required for Lambda execution logging.',
        appliesTo: [
          'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
        ],
      },
      {
        id: 'AwsSolutions-IAM4',
        reason:
          'AWSAppSyncPushToCloudWatchLogs is the AWS-recommended managed policy for AppSync API logging. ' +
          'It grants only CloudWatch Logs write permissions scoped to AppSync log groups. ' +
          'See: https://docs.aws.amazon.com/appsync/latest/devguide/monitoring.html',
        appliesTo: [
          'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSAppSyncPushToCloudWatchLogs',
        ],
      },
    ]);

    // AwsSolutions-IAM5: Wildcard permissions in IAM policies.
    // Wildcards on S3 object actions (s3:GetObject*, s3:List*, etc.) are scoped to specific
    // bucket prefixes (input-files/*, output-files/*) — not open-ended. DynamoDB index/*
    // wildcards are required because GSI names are dynamic. Bedrock resource wildcards use
    // CRIS (Cross Region Inference Support) patterns that require region-level wildcards.
    // X-Ray (PutTraceSegments, PutTelemetryRecords) does not support resource-level permissions
    // so Resource::* is unavoidable — each Lambda has its own isolated suppression entry.
    // The LogRetention custom resource is CDK-internal and requires Resource::* for
    // logs:PutRetentionPolicy / logs:DeleteRetentionPolicy.

    // Cognito authenticated role — scoped to specific bucket prefixes and AppSync API
    NagSuppressions.addResourceSuppressionsByPath(this,
      `/${this.stackName}/CognitoAuthRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'S3 wildcard actions (s3:GetObject*, s3:GetBucket*, s3:List*, s3:DeleteObject*, s3:Abort*) are scoped ' +
            'to specific bucket key prefixes (input-files/*, output-files/*). These are required for the Amplify ' +
            'Storage pattern where authenticated users upload/download documents.',
          appliesTo: [
            'Action::s3:GetObject*',
            'Action::s3:GetBucket*',
            'Action::s3:List*',
            'Action::s3:DeleteObject*',
            'Action::s3:Abort*',
            `Resource::<StorageBucket19DB2FF8.Arn>/input-files/*`,
            `Resource::<StorageBucket19DB2FF8.Arn>/output-files/*`,
          ],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'AppSync IAM authorization requires appsync:GraphQL on the API resource with /* suffix to cover ' +
            'all GraphQL fields. This is the standard pattern for IAM-authorized AppSync APIs.',
          appliesTo: [
            `Resource::arn:<AWS::Partition>:appsync:${this.region}:${this.account}:apis/<GraphqlApi1B6CF24C.ApiId>/*`,
          ],
        },
      ],
    );

    // ProcessS3Input Lambda role — S3 bucket access + Bedrock CRIS regions
    NagSuppressions.addResourceSuppressionsByPath(this,
      `/${this.stackName}/ProcessS3Input/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'S3 wildcard actions are scoped to the storage bucket ARN. The Lambda needs read/write access to ' +
            'process uploaded documents and write BDA output.',
          appliesTo: [
            'Action::s3:GetObject*',
            'Action::s3:GetBucket*',
            'Action::s3:List*',
            'Action::s3:DeleteObject*',
            'Action::s3:Abort*',
            `Resource::<StorageBucket19DB2FF8.Arn>/*`,
          ],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'xray:PutTraceSegments and xray:PutTelemetryRecords do not support resource-level permissions. ' +
            'Resource::* is required by the X-Ray API. ' +
            'See: https://docs.aws.amazon.com/xray/latest/devguide/security_iam_service-with-iam.html',
          appliesTo: ['Resource::*'],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Bedrock Data Automation (BDA) uses Cross Region Inference Support (CRIS). IAM policies must include ' +
            'all regions in the same geography for data-automation-profile/*, blueprint/*, and ' +
            'data-automation-invocation/* resources. When no specific project ARN is provided, ' +
            'data-automation-project/* is also required. ' +
            'See: https://docs.aws.amazon.com/bedrock/latest/userguide/bda-cris.html',
        },
      ],
      true, // applyToChildren
    );

    // ProcessBDAOutput Lambda role — S3 read + DynamoDB + X-Ray
    NagSuppressions.addResourceSuppressionsByPath(this,
      `/${this.stackName}/ProcessBDAOutput/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'S3 wildcard actions are scoped to the storage bucket ARN for reading BDA output files. ' +
            'DynamoDB index/* is required for GSI queries on the FileData table.',
          appliesTo: [
            'Action::s3:GetObject*',
            'Action::s3:GetBucket*',
            'Action::s3:List*',
            `Resource::<StorageBucket19DB2FF8.Arn>/*`,
            `Resource::<FileDataTable25480075.Arn>/index/*`,
          ],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'xray:PutTraceSegments and xray:PutTelemetryRecords do not support resource-level permissions. ' +
            'Resource::* is required by the X-Ray API. ' +
            'See: https://docs.aws.amazon.com/xray/latest/devguide/security_iam_service-with-iam.html',
          appliesTo: ['Resource::*'],
        },
      ],
    );

    // AppSync DynamoDB data source — GSI index wildcard
    NagSuppressions.addResourceSuppressionsByPath(this,
      `/${this.stackName}/GraphqlApi/FileDataDS/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'DynamoDB index/* wildcard is required because AppSync needs access to all GSIs on the FileData table ' +
            'for the byFileId index queries.',
          appliesTo: [
            `Resource::<FileDataTable25480075.Arn>/index/*`,
          ],
        },
      ],
    );

    // CDK-internal custom resource (LogRetention) — scoped to CloudWatch Logs
    NagSuppressions.addResourceSuppressionsByPath(this,
      `/${this.stackName}/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'LogRetention custom resource is created by CDK internally to set log group retention policies. ' +
            'logs:PutRetentionPolicy and logs:DeleteRetentionPolicy require Resource::* because the CDK ' +
            'framework does not scope the custom resource to specific log group ARNs. ' +
            'The actions are limited to CloudWatch Logs operations only.',
          appliesTo: ['Resource::*'],
        },
      ],
    );

    // AwsSolutions-COG2/COG8: MFA and Plus tier are not enabled for this workshop environment.
    // COG2: MFA requires device setup which changes the workshop user flow significantly.
    // COG8: Plus tier incurs additional Cognito costs not appropriate for a workshop.
    NagSuppressions.addResourceSuppressionsByPath(this,
      `/${this.stackName}/UserPool/Resource`,
      [
        {
          id: 'AwsSolutions-COG2',
          reason:
            'MFA is not enabled for this workshop/demo environment to simplify the user experience. ' +
            'For production deployments, MFA should be enabled via mfa: cognito.Mfa.REQUIRED.',
        },
        {
          id: 'AwsSolutions-COG8',
          reason:
            'Cognito Plus tier (advanced threat protection) is not enabled for this workshop to avoid ' +
            'additional costs. FeaturePlan.ESSENTIALS is configured. ' +
            'For production, upgrade to FeaturePlan.PLUS and enable standardThreatProtectionMode.',
        },
      ],
    );

    // AwsSolutions-S1: S3 server access logging is disabled on the storage bucket.
    // Enabling it requires a separate logs bucket, which caused stack deletion failures
    // previously — S3 log delivery creates objects owned by the logging service that
    // autoDeleteObjects cannot remove, blocking cdk destroy.
    NagSuppressions.addResourceSuppressionsByPath(this,
      `/${this.stackName}/StorageBucket/Resource`,
      [
        {
          id: 'AwsSolutions-S1',
          reason:
            'Server access logging is intentionally disabled. The access logs bucket caused stack deletion ' +
            'failures because S3 log-delivery-owned objects cannot be removed by the autoDeleteObjects custom ' +
            'resource. For production, enable with a dedicated logging bucket and a separate cleanup process.',
        },
      ],
    );

    // AwsSolutions-SQS3: DLQ does not itself have a DLQ
    NagSuppressions.addResourceSuppressionsByPath(this,
      `/${this.stackName}/ProcessingDLQ/Resource`,
      [
        {
          id: 'AwsSolutions-SQS3',
          reason:
            'This queue IS the dead-letter queue for the processing pipeline. A DLQ does not need its own DLQ — ' +
            'messages here are monitored via CloudWatch alarms and manually reviewed.',
        },
      ],
    );
  }
}
