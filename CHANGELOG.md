# Changelog

## [1.0.0] - 2026-05-08

Initial release.

- Full-stack serverless IDP application (Angular 19 frontend, AWS CDK v2 backend)
- Amazon Bedrock Data Automation integration with three custom blueprints: Invoice, Transcript, BusinessLicense
- Event-driven pipeline: S3 → Lambda → BDA → EventBridge → Lambda → DynamoDB
- Cognito authentication (admin-provisioned, email sign-in)
- AppSync GraphQL API with IAM auth
- Dual WAF protection (AppSync regional + Amplify CloudFront)
- Multi-region support (us-east-1, us-west-2)
- CDK Nag compliance (AwsSolutionsChecks)
- Synthetic sample documents for blueprint creation
