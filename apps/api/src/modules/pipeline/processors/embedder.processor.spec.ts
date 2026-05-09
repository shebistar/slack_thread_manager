import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbedderProcessor } from './embedder.processor.js';
import type { SlackThread } from '@slack-thread-manager/db';

const mockEmbedding = Array.from({ length: 768 }, (_, i) => i * 0.001);

const mockThread: SlackThread = {
  id: 'thread-1',
  slackTeamId: 'T123',
  channelId: 'channel-1',
  threadTs: '1700000000.000000',
  latestReplyTs: '1700000100.000000',
  messageCount: 5,
  rawMessages: [],
  participantIds: ['user1', 'user2'],
  pipelineState: 'summarized',
  processingDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockTopic = {
  id: 'topic-1',
  threadId: 'thread-1',
  primaryTopic: 'Storage Migration',
  secondaryTopics: ['Infrastructure'],
  workstreamId: 'ws-1',
  confidence: 0.85,
  modelVersion: 'phi3:mini',
  promptVersion: 'classify-v1',
  technicalSummary: { headline: 'Storage backend migration discussion', body: 'Team discussed moving to new storage.' },
  plainSummary: { headline: 'Storage changes planned', body: 'The team is planning storage improvements.' },
  createdAt: new Date(),
};

describe('EmbedderProcessor', () => {
  let processor: EmbedderProcessor;
  let mockLlmService: Record<string, ReturnType<typeof vi.fn>>;
  let mockPipelineStateService: Record<string, ReturnType<typeof vi.fn>>;
  let mockDb: Record<string, unknown>;
  let mockConfigService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    mockLlmService = {
      embed: vi.fn().mockResolvedValue({
        embedding: mockEmbedding,
        modelVersion: 'nomic-embed-text',
      }),
    };

    mockPipelineStateService = {
      transitionState: vi.fn().mockResolvedValue(mockThread),
    };

    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi.fn().mockImplementation((cb) => cb([mockTopic])),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: 'embed-1',
              threadId: 'thread-1',
              embedding: mockEmbedding,
              modelVersion: 'nomic-embed-text',
              createdAt: new Date(),
            }]),
          }),
        }),
      }),
    };

    mockConfigService = {
      get: vi.fn().mockReturnValue(768),
    };

    processor = new EmbedderProcessor(
      mockLlmService as any,
      mockPipelineStateService as any,
      mockDb as any,
      mockConfigService as any,
    );
  });

  it('should embed thread successfully with summary text', async () => {
    const result = await processor.embedThread(mockThread, '2026-05-08');

    expect(mockLlmService.embed).toHaveBeenCalledWith(
      expect.stringContaining('Storage Migration'),
    );
    expect(mockLlmService.embed).toHaveBeenCalledWith(
      expect.stringContaining('Storage backend migration discussion'),
    );
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockPipelineStateService.transitionState).toHaveBeenCalledWith(
      'thread-1',
      'embedded',
      '2026-05-08',
    );
    expect(result).toBeDefined();
    expect(result.threadId).toBe('thread-1');
  });

  it('should throw error when no classified topic found', async () => {
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          then: vi.fn().mockImplementation((cb) => cb([])),
        }),
      }),
    });

    await expect(processor.embedThread(mockThread, '2026-05-08')).rejects.toThrow(
      'No classified topic found for thread thread-1',
    );

    expect(mockPipelineStateService.transitionState).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('should throw error on embedding dimension mismatch', async () => {
    mockLlmService.embed.mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
      modelVersion: 'nomic-embed-text',
    });

    await expect(processor.embedThread(mockThread, '2026-05-08')).rejects.toThrow(
      'Embedding dimension mismatch: got 3, expected 768',
    );

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockPipelineStateService.transitionState).not.toHaveBeenCalled();
  });

  it('should propagate LLM embed errors to caller', async () => {
    mockLlmService.embed.mockRejectedValue(new Error('CPU model embedding failed'));

    await expect(processor.embedThread(mockThread, '2026-05-08')).rejects.toThrow(
      'CPU model embedding failed',
    );

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockPipelineStateService.transitionState).not.toHaveBeenCalled();
  });

  it('should use only primaryTopic when summaries are null', async () => {
    const topicNoSummaries = { ...mockTopic, technicalSummary: null, plainSummary: null };
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          then: vi.fn().mockImplementation((cb) => cb([topicNoSummaries])),
        }),
      }),
    });

    await processor.embedThread(mockThread, '2026-05-08');

    expect(mockLlmService.embed).toHaveBeenCalledWith('Storage Migration');
  });
});
