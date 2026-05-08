import { S3, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { DynamoDB, AttributeValue } from '@aws-sdk/client-dynamodb';
import { EventBridgeEvent, Context } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: 'processBDAOutput' });
const dynamodb = new DynamoDB();
const s3 = new S3();

export const handler = async (event: EventBridgeEvent<string, any>, _context: Context) => {
    try {
        const jobStatus = event.detail?.job_status;
        logger.info('Received BDA event', { jobStatus });

        if (jobStatus !== 'SUCCESS') {
            logger.info('Job did not succeed, skipping');
            return { statusCode: 200, body: 'Skipped — job not successful' };
        }

        const inputFileName: string = event.detail.input_s3_object.name;
        const outputFileName: string = event.detail.output_s3_location.name;
        const fileId = inputFileName.split('/')[1];

        logger.info('Processing BDA result', { fileId });

        await updateFileData(inputFileName, outputFileName);
        await updateFileStatus(fileId, 'completed', outputFileName);

        logger.info('Document processing complete', { fileId });
        return { statusCode: 200, body: 'OK' };
    } catch (error) {
        logger.error('Failed to process BDA output', { error: (error as Error).message });
        throw error;
    }
};

async function updateFileStatus(fileId: string, status: string, outputFileName: string): Promise<void> {
    await dynamodb.updateItem({
        TableName: process.env.DYNAMODB_TABLE_FILE,
        Key: { fileId: { S: fileId } },
        UpdateExpression: 'set #status = :status, #outputPathPrefix = :outputPathPrefix, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
            '#status': 'status',
            '#outputPathPrefix': 'outputPathPrefix',
            '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
            ':status': { S: status },
            ':outputPathPrefix': { S: outputFileName },
            ':updatedAt': { S: new Date().toISOString() },
        },
    });
}

async function findResultFile(bucket: string, outputPrefix: string): Promise<{ key: string; kind: 'custom' | 'standard' | 'other' }> {
    const listResponse = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: outputPrefix,
    }));

    const allFiles = (listResponse.Contents || []).map(obj => obj.Key!);
    const resultFiles = allFiles.filter(key => key.endsWith('result.json'));

    // Prefer custom_output (blueprint-matched extraction)
    const customResult = resultFiles.find(key => key.includes('custom_output'));
    if (customResult) return { key: customResult, kind: 'custom' };

    // Fall back to standard_output. This happens when BDA processed the document
    // but no blueprint in the project matched — either classification routed
    // somewhere else, or the expected blueprint isn't attached to the project.
    // The document will land with documentType='UNKNOWN' and the
    // review screen will show "No structured data extracted for this document type".
    const standardResult = resultFiles.find(key => key.includes('standard_output'));
    if (standardResult) return { key: standardResult, kind: 'standard' };

    if (resultFiles.length > 0) return { key: resultFiles[0], kind: 'other' };

    throw new Error(`No result.json found under ${outputPrefix}`);
}

async function updateFileData(inputFileName: string, outputFileName: string): Promise<void> {
    const bucket = process.env.S3_BUCKET_NAME!;
    const resultFile = await findResultFile(bucket, outputFileName);

    logger.info('Reading result file', { key: resultFile.key, kind: resultFile.kind });

    const s3Response = await s3.getObject({
        Bucket: bucket,
        Key: resultFile.key,
    });

    const resultData = JSON.parse(await s3Response.Body!.transformToString());

    const fileId = inputFileName.split('/')[1];
    const fileDataId = outputFileName.split('/')[1];
    const documentType = resultData.matched_blueprint?.name
        || resultData.document_class?.type
        || 'UNKNOWN';

    logger.info('Extracted document info', { fileId, fileDataId, documentType, kind: resultFile.kind });

    await dynamodb.putItem({
        TableName: process.env.DYNAMODB_TABLE_FILEDATA,
        Item: {
            fileDataId: { S: fileDataId },
            createdAt: { S: new Date().toISOString() },
            updatedAt: { S: new Date().toISOString() },
            fileId: { S: fileId },
            documentType: { S: documentType },
            metadata: convertToDynamoDBFormat(resultData.inference_result || resultData),
        },
    });
}

const convertToDynamoDBFormat = (value: any): AttributeValue => {
    if (typeof value === 'string') return { S: value };
    if (typeof value === 'number') return { N: value.toString() };
    if (typeof value === 'boolean') return { BOOL: value };
    if (Array.isArray(value)) return { L: value.map(item => convertToDynamoDBFormat(item)) };
    if (typeof value === 'object' && value !== null) {
        const mappedObject: Record<string, AttributeValue> = {};
        Object.entries(value).forEach(([k, v]) => {
            mappedObject[k] = convertToDynamoDBFormat(v);
        });
        return { M: mappedObject };
    }
    return { NULL: true };
};
