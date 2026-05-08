# Next Steps

Common next steps after completing the workshop: adding new document types, enabling bulk processing, and promoting the BDA project to CDK. For deployment considerations such as data classification, organizational review, and AWS Well-Architected alignment, see [README.md — Deployment Considerations](README.md#deployment-considerations).

## Adding a new document type

The three deployed types are custom blueprints you can edit — or you can add more. To add a fourth:

1. **Create the blueprint** in the BDA console (see [BDA_SETUP.md](BDA_SETUP.md) for the pattern), name it exactly what you want `matched_blueprint.name` to read.
2. **Add a typed model** under [`frontend/src/app/models/`](frontend/src/app/models/) following the `invoice.model.ts` pattern: `*Metadata` interface, `*Section` enum, `*Helper` class with `getFieldsBySection()`, co-located `*.spec.ts`.
3. **Register** the blueprint name in [`common.model.ts`](frontend/src/app/models/common.model.ts)'s `DocumentType` enum and wire the helper into the three switch statements in [`review-detail.component.ts`](frontend/src/app/review/review-detail/review-detail.component.ts).
4. **Update the Data Protection Policy** in [`infra/lib/backend-stack.ts`](infra/lib/backend-stack.ts) if the blueprint extracts sensitive identifiers you want masked in Lambda logs.
5. **Redeploy** (`npm run deploy`).

## Batch processing for bulk uploads

The shipped application uploads one file at a time through the frontend. For bulk ingestion (SFTP drops, nightly archives, cross-account replication), add a staging prefix and a lightweight Lambda that renames each file into the existing pipeline:

1. **New S3 prefix** `staged-files/` alongside `input-files/` and `output-files/`. External systems write here — filenames don't need to be unique.
2. **New staging Lambda** triggered by `s3:ObjectCreated:*` on `staged-files/`. Per object:
   - Generate a UUID `fileId`
   - Write a `FileRecord` to the File table with the original filename, batch-source `userId`, content type, and `inputPathPrefix`. This matches what the frontend's `createFile` mutation writes today so the Review screen renders batch rows the same way as user uploads — `ProcessS3Input` only *updates* the existing record, so this seed write is required.
   - Copy the object to `input-files/{fileId}` — the existing `ProcessS3Input` Lambda is triggered by that prefix and handles the rest (validation, status update, BDA invocation)
   - Delete the original `staged-files/` object (or tag it `Processed: true`)
3. **Cap concurrency** with `reservedConcurrentExecutions` (10 is a good start) to protect BDA quotas and DynamoDB from bursts.
4. **Add alarms** on DLQ message count and rejected-upload rate before running real batches.

No frontend or review-path changes needed — documents appear in the Review list the same way as user uploads. Before scaling, confirm your region's [BDA service quotas](https://docs.aws.amazon.com/bedrock/latest/userguide/bda-limits.html) accommodate the batch size you plan to push.

## Promote the BDA project to CDK

The workshop creates the BDA project and blueprints manually so attendees can see the authoring UI. For development, manage them as code:

- **Same stack** (simplest) — add `aws-cdk-lib/aws-bedrock` constructs (`CfnDataAutomationProject`, `CfnBlueprint`) to `infra/lib/backend-stack.ts` alongside the existing resources. Keeps deployment to one `cdk deploy` but couples BDA project changes to application deploys.
- **Separate stack** (recommended) — create `infra/lib/bda-stack.ts`, instantiate it in `bin/app.ts`, pass the project ARN to `backend-stack.ts` via a cross-stack prop. Lets you evolve blueprints (which teams iterate on frequently) independently of the application and avoids redeploying Lambdas every time a blueprint schema changes.
