import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

export interface FrontendWafStackProps extends cdk.StackProps {
  /**
   * ARN of the Amplify Hosting app (created in the backend stack's region).
   * Passed in via cross-region reference so the CLOUDFRONT-scoped WebACL
   * association can be created here in us-east-1.
   */
  amplifyAppArn: string;
}

/**
 * CLOUDFRONT-scoped WAF WebACL for Amplify Hosting.
 *
 * CLOUDFRONT-scoped Web ACLs — and their CfnWebACLAssociation — must be
 * created in us-east-1. This stack is therefore pinned to us-east-1 regardless
 * of where the backend is deployed. The Amplify app itself lives in the backend
 * stack's region; its ARN is consumed here via a cross-region reference.
 */
export class FrontendWafStack extends cdk.Stack {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: FrontendWafStackProps) {
    super(scope, id, props);

    const accountId = cdk.Stack.of(this).account;

    const amplifyWebAcl = new wafv2.CfnWebACL(this, 'AmplifyWebAcl', {
      name: `idp-workshop-amplify-waf-${accountId}`,
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `idp-workshop-amplify-waf-${accountId}`,
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
            metricName: 'AmplifyCommonRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'RateLimitRule',
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 1000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AmplifyRateLimitRule',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    this.webAclArn = amplifyWebAcl.attrArn;

    // Associate the CLOUDFRONT-scoped WebACL with the Amplify app. This call
    // must happen in us-east-1 (hence lives in this stack, not the backend stack).
    new wafv2.CfnWebACLAssociation(this, 'AmplifyWafAssociation', {
      resourceArn: props.amplifyAppArn,
      webAclArn: this.webAclArn,
    });

    new cdk.CfnOutput(this, 'AmplifyWebAclArn', {
      value: this.webAclArn,
      description: 'CLOUDFRONT-scoped WebACL ARN for Amplify Hosting (us-east-1)',
    });
  }
}
