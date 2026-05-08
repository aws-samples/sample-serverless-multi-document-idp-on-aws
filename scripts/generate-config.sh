#!/bin/bash
# Generates the frontend config file from CDK stack outputs.
# Usage: ./scripts/generate-config.sh [stack-name] [region]
#
# Stack name resolution order: positional arg > BACKEND_STACK_NAME env > idp-workshop-backend.
# Region resolution order:     positional arg > TARGET_REGION env > AWS_REGION env > us-east-1.

STACK_NAME="${1:-${BACKEND_STACK_NAME:-idp-workshop-backend}}"
REGION="${2:-${TARGET_REGION:-${AWS_REGION:-us-east-1}}}"
OUTPUT_FILE="frontend/src/config/aws-config.json"

echo "Fetching outputs from stack: $STACK_NAME in $REGION..."

OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs" \
  --output json 2>/dev/null)

if [ $? -ne 0 ] || [ "$OUTPUTS" = "null" ]; then
  echo "Error: Could not fetch stack outputs. Is the stack deployed?"
  exit 1
fi

get_output() {
  echo "$OUTPUTS" | python3 -c "
import sys, json
outputs = {o['OutputKey']: o['OutputValue'] for o in json.load(sys.stdin)}
print(outputs.get('$1', ''))
"
}

USER_POOL_ID=$(get_output UserPoolId)
USER_POOL_CLIENT_ID=$(get_output UserPoolClientId)
IDENTITY_POOL_ID=$(get_output IdentityPoolId)
BUCKET_NAME=$(get_output StorageBucketName)
GRAPHQL_URL=$(get_output GraphqlApiUrl)

mkdir -p "$(dirname "$OUTPUT_FILE")"

cat > "$OUTPUT_FILE" << EOF
{
  "Auth": {
    "Cognito": {
      "userPoolId": "$USER_POOL_ID",
      "userPoolClientId": "$USER_POOL_CLIENT_ID",
      "identityPoolId": "$IDENTITY_POOL_ID",
      "loginWith": {
        "email": true
      }
    }
  },
  "Storage": {
    "S3": {
      "bucket": "$BUCKET_NAME",
      "region": "$REGION"
    }
  },
  "API": {
    "GraphQL": {
      "endpoint": "$GRAPHQL_URL",
      "region": "$REGION",
      "defaultAuthMode": "iam"
    }
  }
}
EOF

echo "Config written to $OUTPUT_FILE"
echo "  UserPoolId:       $USER_POOL_ID"
echo "  UserPoolClientId: $USER_POOL_CLIENT_ID"
echo "  IdentityPoolId:   $IDENTITY_POOL_ID"
echo "  BucketName:       $BUCKET_NAME"
echo "  GraphQL URL:      $GRAPHQL_URL"
