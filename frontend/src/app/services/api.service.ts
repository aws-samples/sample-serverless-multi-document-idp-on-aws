import { generateClient } from 'aws-amplify/api';

const client = generateClient();

// GraphQL operations matching the CDK AppSync schema
const listFilesQuery = /* GraphQL */ `
  query ListFiles($limit: Int, $nextToken: String) {
    listFiles(limit: $limit, nextToken: $nextToken) {
      items {
        fileId
        userId
        name
        contentType
        size
        status
        inputPathPrefix
        outputPathPrefix
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

const getFileQuery = /* GraphQL */ `
  query GetFile($fileId: ID!) {
    getFile(fileId: $fileId) {
      fileId
      userId
      name
      contentType
      size
      status
      inputPathPrefix
      outputPathPrefix
      createdAt
      updatedAt
    }
  }
`;

const getFileDataByFileIdQuery = /* GraphQL */ `
  query GetFileDataByFileId($fileId: ID!) {
    getFileDataByFileId(fileId: $fileId) {
      fileDataId
      documentType
      metadata
      createdAt
      updatedAt
      fileId
    }
  }
`;

const createFileMutation = /* GraphQL */ `
  mutation CreateFile($input: CreateFileInput!) {
    createFile(input: $input) {
      fileId
      userId
      name
      contentType
      size
      status
      inputPathPrefix
      outputPathPrefix
      createdAt
      updatedAt
    }
  }
`;

const updateFileMutation = /* GraphQL */ `
  mutation UpdateFile($input: UpdateFileInput!) {
    updateFile(input: $input) {
      fileId
      status
      updatedAt
    }
  }
`;

export interface FileRecord {
  fileId: string;
  userId?: string;
  name?: string;
  contentType?: string;
  size?: number;
  status?: string;
  inputPathPrefix?: string;
  outputPathPrefix?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FileDataRecord {
  fileDataId: string;
  documentType?: string;
  metadata?: string;
  createdAt?: string;
  updatedAt?: string;
  fileId?: string;
}

export const ApiService = {
  async listFiles(limit = 50, nextToken?: string): Promise<{ items: FileRecord[]; nextToken?: string }> {
    const result: any = await client.graphql({
      query: listFilesQuery,
      variables: { limit, nextToken },
    });
    return {
      items: result.data.listFiles?.items || [],
      nextToken: result.data.listFiles?.nextToken || undefined,
    };
  },

  async getFile(fileId: string): Promise<FileRecord | null> {
    const result: any = await client.graphql({
      query: getFileQuery,
      variables: { fileId },
    });
    return result.data.getFile || null;
  },

  async getFileDataByFileId(fileId: string): Promise<FileDataRecord | null> {
    const result: any = await client.graphql({
      query: getFileDataByFileIdQuery,
      variables: { fileId },
    });
    return result.data.getFileDataByFileId || null;
  },

  async createFile(input: Partial<FileRecord>): Promise<FileRecord> {
    const result: any = await client.graphql({
      query: createFileMutation,
      variables: { input },
    });
    return result.data.createFile;
  },

  async updateFile(input: { fileId: string; status: string }): Promise<FileRecord> {
    const result: any = await client.graphql({
      query: updateFileMutation,
      variables: { input },
    });
    return result.data.updateFile;
  },
};
