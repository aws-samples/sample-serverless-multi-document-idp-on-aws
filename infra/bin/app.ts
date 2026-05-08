#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { BackendStack } from '../lib/backend-stack';
import { FrontendWafStack } from '../lib/frontend-waf-stack';

const app = new cdk.App();

const bdaProjectArn = app.node.tryGetContext('bdaProjectArn') || process.env.BDA_PROJECT_ARN || '';

// Derive the BDA profile ARN from the project ARN's region + account.
// The profile follows a fixed pattern — no need for users to construct it manually.
const bdaProfileArn = (() => {
  const explicit = app.node.tryGetContext('bdaProfileArn') || process.env.BDA_PROFILE_ARN || '';
  if (explicit) return explicit;
  if (!bdaProjectArn) return '';
  const parts = bdaProjectArn.split(':');
  const arnRegion = parts[3];
  const arnAccount = parts[4];
  return `arn:aws:bedrock:${arnRegion}:${arnAccount}:data-automation-profile/us.data-automation-v1`;
})();

const account = process.env.CDK_DEFAULT_ACCOUNT;

// Target region for the backend stack. Supports us-east-1 and us-west-2 for the workshop.
// Override via `cdk deploy --context targetRegion=us-west-2` or TARGET_REGION env var.
const targetRegion =
  app.node.tryGetContext('targetRegion') ||
  process.env.TARGET_REGION ||
  process.env.CDK_DEFAULT_REGION ||
  'us-east-1';

// 1) Backend stack — deploys to targetRegion. Creates the Amplify app (among
//    everything else); exposes the Amplify app ARN for the WAF association.
const backend = new BackendStack(app, 'idp-workshop-backend', {
  bdaProjectArn,
  bdaProfileArn,
  env: { account, region: targetRegion },
  crossRegionReferences: true,
});

// 2) Frontend WAF stack — always us-east-1 (CLOUDFRONT scope requirement).
//    Creates the WebACL and the CfnWebACLAssociation, both of which must live
//    in us-east-1. Consumes the Amplify app ARN from the backend stack.
const frontendWaf = new FrontendWafStack(app, 'idp-workshop-frontend-waf', {
  env: { account, region: 'us-east-1' },
  crossRegionReferences: true,
  amplifyAppArn: backend.amplifyAppArn,
});

// Enforce deploy order: backend first (creates the Amplify app), then WAF
// (associates the CLOUDFRONT-scoped WebACL with that app).
frontendWaf.addDependency(backend);

// Apply CDK Nag — AWS Solutions checks on all stacks.
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
