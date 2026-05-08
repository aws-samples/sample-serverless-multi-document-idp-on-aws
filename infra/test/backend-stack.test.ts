import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { BackendStack } from '../lib/backend-stack';

describe('BackendStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new BackendStack(app, 'TestBackendStack', {
      bdaProjectArn: 'arn:aws:bedrock:us-east-1:123456789012:data-automation-project/test-project',
      bdaProfileArn: 'arn:aws:bedrock:us-east-1:123456789012:data-automation-profile/us.data-automation-v1',
      env: { account: '123456789012', region: 'us-east-1' },
    });
    template = Template.fromStack(stack);
  });

  // ---------------------------------------------------
  // Cognito
  // ---------------------------------------------------
  describe('Cognito', () => {
    test('creates a User Pool with self-signup disabled', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      });
    });

    test('User Pool has strong password policy', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        Policies: {
          PasswordPolicy: {
            MinimumLength: 8,
            RequireUppercase: true,
            RequireLowercase: true,
            RequireNumbers: true,
            RequireSymbols: true,
          },
        },
      });
    });

    test('creates a User Pool Client with SRP and password auth', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ExplicitAuthFlows: Match.arrayWith([
          'ALLOW_USER_SRP_AUTH',
        ]),
      });
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ExplicitAuthFlows: Match.arrayWith([
          'ALLOW_USER_PASSWORD_AUTH',
        ]),
      });
    });

    test('creates an Identity Pool with unauthenticated access disabled', () => {
      template.hasResourceProperties('AWS::Cognito::IdentityPool', {
        AllowUnauthenticatedIdentities: false,
      });
    });
  });

  // ---------------------------------------------------
  // S3
  // ---------------------------------------------------
  describe('S3', () => {
    test('creates a storage bucket with encryption and public access blocked', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
          ],
        },
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        VersioningConfiguration: { Status: 'Enabled' },
      });
    });

    test('storage bucket enforces SSL', () => {
      template.hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Deny',
              Condition: { Bool: { 'aws:SecureTransport': 'false' } },
            }),
          ]),
        },
      });
    });
  });

  // ---------------------------------------------------
  // DynamoDB
  // ---------------------------------------------------
  describe('DynamoDB', () => {
    test('creates File table with PAY_PER_REQUEST billing', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: Match.stringLikeRegexp('idp-workshop-file-'),
        KeySchema: [{ AttributeName: 'fileId', KeyType: 'HASH' }],
        BillingMode: 'PAY_PER_REQUEST',
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      });
    });

    test('creates FileData table with GSI on fileId', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: Match.stringLikeRegexp('idp-workshop-filedata-'),
        KeySchema: [{ AttributeName: 'fileDataId', KeyType: 'HASH' }],
        GlobalSecondaryIndexes: [
          Match.objectLike({
            IndexName: 'byFileId',
            KeySchema: [{ AttributeName: 'fileId', KeyType: 'HASH' }],
          }),
        ],
      });
    });
  });

  // ---------------------------------------------------
  // AppSync
  // ---------------------------------------------------
  describe('AppSync', () => {
    test('creates a GraphQL API with IAM auth', () => {
      template.hasResourceProperties('AWS::AppSync::GraphQLApi', {
        AuthenticationType: 'AWS_IAM',
        XrayEnabled: true,
      });
    });

    test('creates DynamoDB data sources', () => {
      const dataSources = template.findResources('AWS::AppSync::DataSource', {
        Properties: { Type: 'AMAZON_DYNAMODB' },
      });
      expect(Object.keys(dataSources).length).toBeGreaterThanOrEqual(2);
    });

    test('creates resolvers for all GraphQL operations', () => {
      const resolvers = template.findResources('AWS::AppSync::Resolver');
      const fieldNames = Object.values(resolvers).map(
        (r: any) => r.Properties.FieldName,
      );
      expect(fieldNames).toEqual(
        expect.arrayContaining([
          'createFile',
          'getFile',
          'listFiles',
          'updateFile',
          'getFileData',
          'getFileDataByFileId',
        ]),
      );
    });
  });

  // ---------------------------------------------------
  // WAF (Regional — AppSync)
  // ---------------------------------------------------
  describe('WAF', () => {
    test('creates a REGIONAL WebACL for AppSync', () => {
      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Scope: 'REGIONAL',
        DefaultAction: { Allow: {} },
      });
    });

    test('WebACL includes CommonRuleSet and KnownBadInputs managed rules', () => {
      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Rules: Match.arrayWith([
          Match.objectLike({
            Statement: {
              ManagedRuleGroupStatement: {
                VendorName: 'AWS',
                Name: 'AWSManagedRulesCommonRuleSet',
              },
            },
          }),
          Match.objectLike({
            Statement: {
              ManagedRuleGroupStatement: {
                VendorName: 'AWS',
                Name: 'AWSManagedRulesKnownBadInputsRuleSet',
              },
            },
          }),
        ]),
      });
    });

    test('WebACL includes a rate-limit rule', () => {
      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Rules: Match.arrayWith([
          Match.objectLike({
            Statement: {
              RateBasedStatement: {
                Limit: 2000,
                AggregateKeyType: 'IP',
              },
            },
            Action: { Block: {} },
          }),
        ]),
      });
    });

    test('associates WebACL with AppSync API', () => {
      template.resourceCountIs('AWS::WAFv2::WebACLAssociation', 1);
    });
  });

  // ---------------------------------------------------
  // Lambda
  // ---------------------------------------------------
  describe('Lambda', () => {
    test('creates ProcessS3Input function with correct config', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: Match.stringLikeRegexp('idp-workshop-process-s3-input-'),
        MemorySize: 256,
        Timeout: 60,
        Architectures: ['arm64'],
        TracingConfig: { Mode: 'Active' },
      });
    });

    test('creates ProcessBDAOutput function with correct config', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: Match.stringLikeRegexp('idp-workshop-process-bda-output-'),
        MemorySize: 256,
        Timeout: 180,
        Architectures: ['arm64'],
        TracingConfig: { Mode: 'Active' },
      });
    });

    test('both Lambda functions have reserved concurrency', () => {
      const functions = template.findResources('AWS::Lambda::Function', {
        Properties: {
          FunctionName: Match.stringLikeRegexp('idp-workshop-process-'),
        },
      });
      for (const fn of Object.values(functions)) {
        expect((fn as any).Properties.ReservedConcurrentExecutions).toBe(10);
      }
    });

    test('ProcessS3Input has BDA environment variables', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: Match.stringLikeRegexp('idp-workshop-process-s3-input-'),
        Environment: {
          Variables: Match.objectLike({
            BEDROCK_DATA_AUTOMATION_PROJECT_ARN: Match.anyValue(),
            BEDROCK_DATA_AUTOMATION_PROFILE_ARN: Match.anyValue(),
            S3_BUCKET_OUTPUT_PATH: 'output-files',
          }),
        },
      });
    });

    test('ProcessS3Input is triggered by S3 input-files/ prefix', () => {
      template.hasResourceProperties('Custom::S3BucketNotifications', {
        NotificationConfiguration: {
          LambdaFunctionConfigurations: Match.arrayWith([
            Match.objectLike({
              Events: ['s3:ObjectCreated:*'],
              Filter: {
                Key: {
                  FilterRules: [{ Name: 'prefix', Value: 'input-files/' }],
                },
              },
            }),
          ]),
        },
      });
    });
  });

  // ---------------------------------------------------
  // SQS (DLQ)
  // ---------------------------------------------------
  describe('SQS', () => {
    test('creates a DLQ with SSL enforcement and encryption', () => {
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: Match.stringLikeRegexp('idp-workshop-dlq-'),
        MessageRetentionPeriod: 1209600, // 14 days in seconds
        SqsManagedSseEnabled: true,
      });
    });
  });

  // ---------------------------------------------------
  // EventBridge
  // ---------------------------------------------------
  describe('EventBridge', () => {
    test('creates a rule for BDA job completion events', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        EventPattern: {
          source: ['aws.bedrock'],
          'detail-type': ['Bedrock Data Automation Job Succeeded'],
        },
      });
    });
  });

  // ---------------------------------------------------
  // Amplify Hosting
  // ---------------------------------------------------
  describe('Amplify', () => {
    test('creates an Amplify app with WEB platform', () => {
      template.hasResourceProperties('AWS::Amplify::App', {
        Name: Match.stringLikeRegexp('idp-workshop-frontend-'),
        Platform: 'WEB',
      });
    });

    test('creates a main branch with auto-build disabled', () => {
      template.hasResourceProperties('AWS::Amplify::Branch', {
        BranchName: 'main',
        EnableAutoBuild: false,
      });
    });
  });

  // ---------------------------------------------------
  // CloudWatch Log Groups
  // ---------------------------------------------------
  describe('CloudWatch Logs', () => {
    test('creates log groups with ONE_MONTH retention', () => {
      const logGroups = template.findResources('AWS::Logs::LogGroup', {
        Properties: {
          LogGroupName: Match.stringLikeRegexp('idp-workshop'),
        },
      });
      for (const lg of Object.values(logGroups)) {
        expect((lg as any).Properties.RetentionInDays).toBe(30);
      }
    });

    test('Lambda log groups have a data protection policy attached', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: Match.stringLikeRegexp('process-s3-input'),
        DataProtectionPolicy: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({ DataIdentifier: Match.anyValue() }),
          ]),
        }),
      });
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: Match.stringLikeRegexp('process-bda-output'),
        DataProtectionPolicy: Match.anyValue(),
      });
    });
  });

  // ---------------------------------------------------
  // Stack Outputs
  // ---------------------------------------------------
  describe('Stack Outputs', () => {
    test('exports all required outputs', () => {
      const outputs = template.toJSON().Outputs;
      const outputKeys = Object.keys(outputs);
      const requiredOutputs = [
        'UserPoolId',
        'UserPoolClientId',
        'IdentityPoolId',
        'StorageBucketName',
        'GraphqlApiUrl',
        'GraphqlApiId',
        'Region',
        'FileTableName',
        'FileDataTableName',
        'DLQUrl',
        'AmplifyAppId',
        'AmplifyAppUrl',
      ];
      for (const key of requiredOutputs) {
        expect(outputKeys).toContain(key);
      }
    });
  });
});
