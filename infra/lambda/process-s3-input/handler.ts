import { S3Event, Context } from 'aws-lambda';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { S3, HeadObjectCommand } from '@aws-sdk/client-s3';
import { BedrockDataAutomationRuntimeClient, InvokeDataAutomationAsyncCommand } from "@aws-sdk/client-bedrock-data-automation-runtime";
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: 'processS3Input' });
const dynamodb = new DynamoDB();
const s3 = new S3();

// Derive the BDA runtime API region from the project ARN.
// The project, profile, and backend all deploy to the same target region.
// AWS_REGION is always set by the Lambda runtime, so the final fallback is defensive.
const bdaProjectArn = process.env.BEDROCK_DATA_AUTOMATION_PROJECT_ARN || '';
const bdaRegion = bdaProjectArn.split(':')[3] || process.env.AWS_REGION;
if (!bdaRegion) {
  throw new Error('Unable to determine BDA region: BEDROCK_DATA_AUTOMATION_PROJECT_ARN and AWS_REGION are both unset');
}
const client = new BedrockDataAutomationRuntimeClient({ region: bdaRegion });

// Allowed file types for document processing
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif'];
const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
];
// Server-side upload limit. The Angular frontend enforces a smaller 2 MB ceiling
// (frontend/src/app/upload/upload.component.ts) for responsive UX; this value is
// the authoritative hard limit the backend enforces before invoking BDA. If this
// changes, also update the frontend's MAX_UPLOAD_SIZE_MB and every reference in
// README.md, TROUBLESHOOTING.md, CHANGELOG.md, and .kiro/steering/product.md.
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const handler = async (event: S3Event, _context: Context) => {
  try {
    if (!event.Records?.length) {
      logger.warn('No records in S3 event');
      return { statusCode: 400, body: 'No records in event' };
    }

    const s3Event = event.Records[0];
    const bucket = s3Event.s3.bucket.name;
    const key = decodeURIComponent(s3Event.s3.object.key.replace(/\+/g, ' '));
    const fileId = key.split('/')[1];
    const fileSize = s3Event.s3.object.size;

    logger.info('Processing document', { fileId, key, fileSize });

    // Validate file size from S3 event metadata
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      logger.warn('Rejected file: exceeds size limit', { fileId, fileSize, maxSize: MAX_FILE_SIZE_BYTES });
      await updateFileStatus(fileId, 'rejected');
      return { statusCode: 400, body: `File too large: ${fileSize} bytes (max ${MAX_FILE_SIZE_BYTES})` };
    }

    // Validate content type via S3 HEAD request (primary check — S3 key may not have an extension)
    const headResult = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const contentType = headResult.ContentType || '';
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      // Fall back to extension check if content-type is generic (e.g., application/octet-stream)
      const ext = key.substring(key.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        logger.warn('Rejected file: unsupported content type and extension', { fileId, contentType, ext });
        await updateFileStatus(fileId, 'rejected');
        return { statusCode: 400, body: `Unsupported file: content-type=${contentType}, extension=${ext}` };
      }
    }

    await updateFileStatus(fileId, 'processing');
    await invokeBedrockAutomation(bucket, key);
    logger.info('Document submitted for processing', { fileId });

    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    logger.error('Failed to process S3 event', { error: (error as Error).message });
    throw error;
  }
};

async function updateFileStatus(fileId: string, status: string): Promise<void> {
  await dynamodb.updateItem({
    TableName: process.env.DYNAMODB_TABLE_FILE,
    Key: { fileId: { S: fileId } },
    UpdateExpression: 'set #status = :status',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': { S: status } },
  });
}

async function invokeBedrockAutomation(bucket: string, key: string): Promise<void> {
  const command = new InvokeDataAutomationAsyncCommand({
    inputConfiguration: {
      s3Uri: `s3://${bucket}/${key}`,
    },
    outputConfiguration: {
      s3Uri: `s3://${bucket}/${process.env.S3_BUCKET_OUTPUT_PATH}`,
    },
    dataAutomationProfileArn: process.env.BEDROCK_DATA_AUTOMATION_PROFILE_ARN,
    dataAutomationConfiguration: {
      dataAutomationProjectArn: process.env.BEDROCK_DATA_AUTOMATION_PROJECT_ARN,
      stage: 'LIVE',
    },
    notificationConfiguration: {
      eventBridgeConfiguration: { eventBridgeEnabled: true },
    },
  });

  // Modality routing for JPEG/PNG uploads is configured on the BDA project
  // itself (Advanced settings → modalityRouting), not per-invocation. The
  // InvokeDataAutomationAsync API does not expose an overrideConfiguration
  // parameter. See BDA_SETUP.md for the project-level setup steps.

  await client.send(command);
}
