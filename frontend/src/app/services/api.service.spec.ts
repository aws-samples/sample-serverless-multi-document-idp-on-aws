/**
 * API Service unit tests.
 *
 * The ApiService module imports from 'aws-amplify/api' which uses ESM internally.
 * We mock the entire module chain to avoid ESM/CJS transform issues in Jest.
 */

// Mock aws-amplify/api before any imports
const mockGraphql = jest.fn();
jest.mock('aws-amplify/api', () => ({
  generateClient: () => ({ graphql: mockGraphql }),
}));

import { ApiService, FileRecord } from './api.service';

describe('ApiService', () => {
  beforeEach(() => {
    mockGraphql.mockReset();
  });

  describe('listFiles', () => {
    it('should return items and nextToken from GraphQL response', async () => {
      const mockItems: FileRecord[] = [
        { fileId: '1', name: 'test.pdf', status: 'completed' },
        { fileId: '2', name: 'doc.png', status: 'processing' },
      ];
      mockGraphql.mockResolvedValue({
        data: { listFiles: { items: mockItems, nextToken: 'abc123' } },
      });

      const result = await ApiService.listFiles(50);
      expect(result.items).toEqual(mockItems);
      expect(result.nextToken).toBe('abc123');
      expect(mockGraphql).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { limit: 50, nextToken: undefined } }),
      );
    });

    it('should default limit to 50', async () => {
      mockGraphql.mockResolvedValue({
        data: { listFiles: { items: [], nextToken: null } },
      });

      await ApiService.listFiles();
      expect(mockGraphql).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { limit: 50, nextToken: undefined } }),
      );
    });

    it('should handle null items gracefully', async () => {
      mockGraphql.mockResolvedValue({
        data: { listFiles: { items: null, nextToken: null } },
      });

      const result = await ApiService.listFiles();
      expect(result.items).toEqual([]);
      expect(result.nextToken).toBeUndefined();
    });
  });

  describe('getFile', () => {
    it('should return a file record', async () => {
      const mockFile: FileRecord = { fileId: 'abc', name: 'test.pdf', status: 'completed' };
      mockGraphql.mockResolvedValue({ data: { getFile: mockFile } });

      const result = await ApiService.getFile('abc');
      expect(result).toEqual(mockFile);
      expect(mockGraphql).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { fileId: 'abc' } }),
      );
    });

    it('should return null when file not found', async () => {
      mockGraphql.mockResolvedValue({ data: { getFile: null } });

      const result = await ApiService.getFile('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getFileDataByFileId', () => {
    it('should return file data record', async () => {
      const mockData = {
        fileDataId: 'fd-1',
        documentType: 'Transcript',
        metadata: '{}',
        fileId: 'abc',
      };
      mockGraphql.mockResolvedValue({
        data: { getFileDataByFileId: mockData },
      });

      const result = await ApiService.getFileDataByFileId('abc');
      expect(result).toEqual(mockData);
    });

    it('should return null when no data exists', async () => {
      mockGraphql.mockResolvedValue({
        data: { getFileDataByFileId: null },
      });

      const result = await ApiService.getFileDataByFileId('abc');
      expect(result).toBeNull();
    });
  });

  describe('createFile', () => {
    it('should create a file and return the record', async () => {
      const input = {
        fileId: 'new-1',
        name: 'upload.pdf',
        status: 'pending',
      };
      const mockResponse = { ...input, createdAt: '2024-01-01T00:00:00Z' };
      mockGraphql.mockResolvedValue({ data: { createFile: mockResponse } });

      const result = await ApiService.createFile(input);
      expect(result).toEqual(mockResponse);
      expect(mockGraphql).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { input } }),
      );
    });
  });

  describe('updateFile', () => {
    it('should update file status and return the record', async () => {
      const input = { fileId: 'abc', status: 'completed' };
      const mockResponse = { ...input, updatedAt: '2024-01-02T00:00:00Z' };
      mockGraphql.mockResolvedValue({ data: { updateFile: mockResponse } });

      const result = await ApiService.updateFile(input);
      expect(result).toEqual(mockResponse);
      expect(mockGraphql).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { input } }),
      );
    });
  });
});
