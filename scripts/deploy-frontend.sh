#!/bin/bash
# Deploys the Angular frontend to Amplify Hosting (manual deployment, no git).
# Usage: ./scripts/deploy-frontend.sh [stack-name] [region]
#
# Stack name resolution order: positional arg > BACKEND_STACK_NAME env > idp-workshop-backend.
# Region resolution order:     positional arg > TARGET_REGION env > AWS_REGION env > us-east-1.

set -euo pipefail

STACK_NAME="${1:-${BACKEND_STACK_NAME:-idp-workshop-backend}}"
REGION="${2:-${TARGET_REGION:-${AWS_REGION:-us-east-1}}}"

echo "==> Using stack: $STACK_NAME in region: $REGION"

echo "==> Fetching Amplify App ID from stack: $STACK_NAME..."
APP_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='AmplifyAppId'].OutputValue" \
  --output text)

if [ -z "$APP_ID" ] || [ "$APP_ID" = "None" ]; then
  echo "Error: AmplifyAppId not found in stack outputs. Is the stack deployed to $REGION?"
  exit 1
fi

echo "==> Amplify App ID: $APP_ID"

echo "==> Generating frontend config..."
./scripts/generate-config.sh "$STACK_NAME" "$REGION"

echo "==> Building Angular app..."
cd frontend
npm run build
cd ..

echo "==> Creating deployment archive..."
DIST_DIR="frontend/dist/serverless-multi-document-idp-on-aws/browser"
if [ ! -d "$DIST_DIR" ]; then
  echo "Error: Build output not found at $DIST_DIR"
  exit 1
fi

ARCHIVE="/tmp/idp-frontend-deploy.zip"
rm -f "$ARCHIVE"
(cd "$DIST_DIR" && zip -r "$ARCHIVE" .)

echo "==> Creating Amplify deployment..."
DEPLOYMENT=$(aws amplify create-deployment \
  --app-id "$APP_ID" \
  --branch-name main \
  --region "$REGION" \
  --output json)

DEPLOY_URL=$(echo "$DEPLOYMENT" | python3 -c "import sys,json; print(json.load(sys.stdin)['zipUploadUrl'])")
JOB_ID=$(echo "$DEPLOYMENT" | python3 -c "import sys,json; print(json.load(sys.stdin)['jobId'])")

echo "==> Uploading build artifacts..."
curl -T "$ARCHIVE" "$DEPLOY_URL"

echo "==> Starting deployment (Job ID: $JOB_ID)..."
aws amplify start-deployment \
  --app-id "$APP_ID" \
  --branch-name main \
  --job-id "$JOB_ID" \
  --region "$REGION"

echo ""
echo "==> Deployment started successfully!"
echo "    App URL: https://main.$(aws amplify get-app --app-id "$APP_ID" --region "$REGION" --query 'app.defaultDomain' --output text)"
echo "    Monitor: https://${REGION}.console.aws.amazon.com/amplify/apps/${APP_ID}/overview"

rm -f "$ARCHIVE"
