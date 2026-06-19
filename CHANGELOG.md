# Changelog

## [1.1.0] - 2026-06-17

### Changed

- Upgraded Angular frontend from v19 to v22 (incremental path: 19→20→21→22)
- Updated TypeScript from ~5.7.0 to ~6.0.0
- Migrated all templates from legacy `*ngIf`/`*ngFor`/`*ngSwitch` structural directives to Angular's built-in control-flow syntax (`@if`, `@for`, `@switch`)
- Removed `CommonModule` from all four affected component imports (replaced with standalone imports)
- Removed Karma and all related packages (`karma`, `karma-chrome-launcher`, `karma-coverage`, `karma-jasmine`, `karma-jasmine-html-reporter`, `jasmine-core`, `@types/jasmine`); Jest is now the sole test runner
- Updated `ts-jest` to v29.4.11 (TypeScript 6.x support)
- Bumped `esbuild` in `infra/` from `^0.25.0` to `^0.28.1`

## [1.0.0] - 2026-05-08

Initial release.

- Full-stack serverless IDP application (Angular 22 frontend, AWS CDK v2 backend)
- Amazon Bedrock Data Automation integration with three custom blueprints: Invoice, Transcript, BusinessLicense
- Event-driven pipeline: S3 → Lambda → BDA → EventBridge → Lambda → DynamoDB
- Cognito authentication (admin-provisioned, email sign-in)
- AppSync GraphQL API with IAM auth
- Dual WAF protection (AppSync regional + Amplify CloudFront)
- Multi-region support (us-east-1, us-west-2)
- CDK Nag compliance (AwsSolutionsChecks)
- Synthetic sample documents for blueprint creation
