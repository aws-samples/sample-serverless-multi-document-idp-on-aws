# Troubleshooting

## CDK Bootstrap Error: "Specify an environment name"

Run CDK commands from the `infra/` directory and ensure environment variables are set:

```bash
cd infra
npx cdk bootstrap "aws://${CDK_DEFAULT_ACCOUNT}/us-east-1"
```

## CDK Synth Fails with "Cannot find module 'esbuild'"

```bash
cd infra && npm install
```

## BDA Project ARN Lookup Returns "None"

- Verify `$TARGET_REGION` matches the region where you created the BDA project.
- Verify `$BDA_PROJECT_NAME` matches the project name exactly (case-sensitive).
- Confirm the project exists: `aws bedrock-data-automation list-data-automation-projects --region "$TARGET_REGION"`.

## File Upload Fails with 403

- Verify you are signed in (check Cognito session).
- Confirm the S3 bucket exists and CORS is configured (CDK handles this).
- Check file size is under 2 MB (client-side limit).

## Document Status Stuck on "Processing"

- Check CloudWatch logs for the `process-s3-input` Lambda.
- Verify `$BDA_PROJECT_ARN` was set correctly before `cdk deploy`.
- Confirm the EventBridge rule is active.

## Document Shows "UNKNOWN" Type After Processing

BDA processed the document but did not match it to a blueprint.

1. Download `output-files/{job-id}/job_metadata.json` from S3. If `custom_output_status: NO_MATCH`, the classifier rejected the document.
2. Verify all three blueprints are listed under the project's **Custom output** tab.
3. Use the project's **Test** feature to upload the same document and confirm the blueprint matches.
4. If the console test matches but the app doesn't, check `semantic_modality` in `job_metadata.json` — if it says `IMAGE`, add JPEG → Document modality routing in the project's Advanced settings.

## Document Status Shows "Rejected"

The `ProcessS3Input` Lambda validates files before invoking BDA:
- **Content-type not allowed** — only PDF, PNG, JPEG, TIFF accepted (validated via S3 HEAD).
- **File size exceeds 5 MB** — backend hard limit.

Check CloudWatch logs for the rejection reason.

## Cognito User Did Not Receive Temporary Password Email

- Check spam/junk — default sender is `no-reply@verificationemail.com`.
- Default Cognito email sender has a 50 emails/day limit.

## Frontend Config Not Working

- Re-run `npm run generate-config` after any CDK redeployment.
- Re-run `npm run deploy-frontend` to rebuild and redeploy.
- Verify `frontend/src/config/aws-config.json` has non-placeholder values.

## deploy-frontend.sh Fails

- Ensure the CDK stack is deployed first (`npm run infra:deploy`).
- Verify `zip` is installed.
- Confirm AWS credentials have `amplify:CreateDeployment` and `amplify:StartDeployment` permissions.
- Verify `$BACKEND_STACK_NAME` and `$TARGET_REGION` are set.

## Amplify App Shows Blank Page or 404

- Verify the deploy script completed successfully.
- Clear browser cache or try incognito.
- Check the Amplify console for SPA rewrite rules (all non-file paths should redirect to `/index.html`).

## WAF Blocks Legitimate Requests

- Rate limits: 2,000 req/IP for AppSync, 1,000 req/IP for Amplify.
- Check the [WAF console](https://console.aws.amazon.com/wafv2/) for blocked request details and sampled requests.

## Stack Deletion Fails on S3 Bucket

Empty the bucket manually, then retry:

```bash
aws s3 rm s3://idp-workshop-storage-<account-id>-<region>/ --recursive
cd infra && npx cdk destroy --all --force
```
