import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { FrontendWafStack } from '../lib/frontend-waf-stack';

describe('FrontendWafStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new FrontendWafStack(app, 'TestFrontendWafStack', {
      amplifyAppArn: 'arn:aws:amplify:us-east-1:123456789012:apps/d1234abcd',
      env: { account: '123456789012', region: 'us-east-1' },
    });
    template = Template.fromStack(stack);
  });

  test('creates a CLOUDFRONT-scoped WebACL', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Scope: 'CLOUDFRONT',
      DefaultAction: { Allow: {} },
    });
  });

  test('WebACL includes CommonRuleSet managed rule', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Rules: Match.arrayWith([
        Match.objectLike({
          Name: 'AWSManagedRulesCommonRuleSet',
          Statement: {
            ManagedRuleGroupStatement: {
              VendorName: 'AWS',
              Name: 'AWSManagedRulesCommonRuleSet',
            },
          },
        }),
      ]),
    });
  });

  test('WebACL includes a rate-limit rule at 1000 requests', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Rules: Match.arrayWith([
        Match.objectLike({
          Name: 'RateLimitRule',
          Action: { Block: {} },
          Statement: {
            RateBasedStatement: {
              Limit: 1000,
              AggregateKeyType: 'IP',
            },
          },
        }),
      ]),
    });
  });

  test('associates WebACL with the Amplify app', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACLAssociation', {
      ResourceArn: 'arn:aws:amplify:us-east-1:123456789012:apps/d1234abcd',
    });
  });

  test('exports the WebACL ARN as a stack output', () => {
    template.hasOutput('AmplifyWebAclArn', {});
  });

  test('has CloudWatch metrics enabled on all rules', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      VisibilityConfig: {
        CloudWatchMetricsEnabled: true,
        SampledRequestsEnabled: true,
      },
    });
  });
});
