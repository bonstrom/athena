import { renderHook, waitFor } from '@testing-library/react';

interface TestMessage {
  id: string;
  content: string;
  isDeleted: boolean;
  embedding?: number[] | null;
}

const mockLoadModel = jest.fn<Promise<void>, []>();
const mockGenerateEmbedding = jest.fn<Promise<number[]>, [string]>();
const mockFilter = jest.fn<{ toArray: () => Promise<TestMessage[]> }, [(message: TestMessage) => boolean]>();
const mockToArray = jest.fn<Promise<TestMessage[]>, []>();
const mockUpdate = jest.fn<Promise<number>, [string, { embedding: number[] }]>();

let mockRagEnabledState = false;

jest.mock('../../store/AuthStore', () => ({
  useAuthStore: (): { ragEnabled: boolean } => ({ ragEnabled: mockRagEnabledState }),
}));

jest.mock('../../services/embeddingService', () => ({
  embeddingService: {
    loadModel: (...args: []): Promise<void> => mockLoadModel(...args),
    generateEmbedding: (...args: [string]): Promise<number[]> => mockGenerateEmbedding(...args),
  },
}));

jest.mock('../../database/AthenaDb', () => ({
  athenaDb: {
    messages: {
      filter: (...args: [(message: TestMessage) => boolean]): { toArray: () => Promise<TestMessage[]> } => mockFilter(...args),
      update: (...args: [string, { embedding: number[] }]): Promise<number> => mockUpdate(...args),
    },
  },
}));

import { useEmbeddingBackfill } from '../useEmbeddingBackfill';

describe('useEmbeddingBackfill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRagEnabledState = false;

    mockFilter.mockImplementation(() => ({
      toArray: (): Promise<TestMessage[]> => mockToArray(),
    }));

    mockToArray.mockResolvedValue([]);
    mockLoadModel.mockResolvedValue();
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2]);
    mockUpdate.mockResolvedValue(1);
  });

  it('does nothing when rag is disabled', async () => {
    mockRagEnabledState = false;

    renderHook(() => useEmbeddingBackfill());

    await waitFor(() => {
      expect(mockLoadModel).not.toHaveBeenCalled();
      expect(mockFilter).not.toHaveBeenCalled();
      expect(mockGenerateEmbedding).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  it('loads model and backfills embeddings for non-empty messages', async () => {
    mockRagEnabledState = true;
    mockToArray.mockResolvedValue([
      { id: 'm1', content: 'Embed this', isDeleted: false, embedding: null },
      { id: 'm2', content: '   ', isDeleted: false, embedding: null },
    ]);
    mockGenerateEmbedding.mockResolvedValue([0.9, 0.1]);

    renderHook(() => useEmbeddingBackfill());

    await waitFor(() => {
      expect(mockLoadModel).toHaveBeenCalledTimes(1);
      expect(mockFilter).toHaveBeenCalledTimes(1);
      expect(mockGenerateEmbedding).toHaveBeenCalledWith('Embed this');
      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledWith('m1', { embedding: [0.9, 0.1] });
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it('stops when model load fails', async () => {
    mockRagEnabledState = true;
    mockLoadModel.mockRejectedValue(new Error('load failed'));

    renderHook(() => useEmbeddingBackfill());

    await waitFor(() => {
      expect(mockLoadModel).toHaveBeenCalledTimes(1);
      expect(mockFilter).not.toHaveBeenCalled();
      expect(mockGenerateEmbedding).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
