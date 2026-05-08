import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { PipelineService } from './pipeline.service.js';
import { ClassifierProcessor } from './processors/classifier.processor.js';
import { SummarizerProcessor } from './processors/summarizer.processor.js';
import { PipelineStateService } from './pipeline-state.service.js';
import { PipelineRunService } from './pipeline-run.service.js';
import { LlmService } from './llm/llm.service.js';
import { LlmPendingRetryError } from './llm/llm-provider.interface.js';
import { DATABASE_TOKEN } from '../../database/database.module.js';

const makeThread = (id: string, state: string = 'ingested') => ({
  id,
  slackTeamId: 'T123',
  channelId: 'ch-1',
  threadTs: `170000000${id}.000000`,
  latestReplyTs: null,
  messageCount: 2,
  rawMessages: [{ text: 'test' }],
  participantIds: ['U1'],
  pipelineState: state as 'ingested' | 'classified',
  processingDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('PipelineService', () => {
  let service: PipelineService;
  let mockClassifier: Record<string, ReturnType<typeof vi.fn>>;
  let mockSummarizer: Record<string, ReturnType<typeof vi.fn>>;
  let mockStateService: Record<string, ReturnType<typeof vi.fn>>;
  let mockRunService: Record<string, ReturnType<typeof vi.fn>>;
  let mockLlmService: Record<string, ReturnType<typeof vi.fn>>;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    mockClassifier = {
      classifyThread: vi.fn().mockResolvedValue({
        id: 'topic-1',
        threadId: 'thread-1',
        primaryTopic: 'Test Topic',
      }),
    };

    mockSummarizer = {
      summarizeThread: vi.fn().mockResolvedValue({
        id: 'topic-1',
        threadId: 'thread-1',
        primaryTopic: 'Test Topic',
        technicalSummary: { headline: 'tech', body: 'body', key_decisions: [], action_items: [] },
        plainSummary: { headline: 'plain', body: 'body', key_decisions: [], action_items: [] },
      }),
    };

    mockStateService = {
      getThreadsByState: vi.fn().mockResolvedValue([makeThread('t1'), makeThread('t2')]),
      markPendingRetry: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };

    mockRunService = {
      startRun: vi.fn().mockResolvedValue({ id: 'run-1', startedAt: new Date() }),
      completeRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
    };

    mockLlmService = {
      resetBatchCounters: vi.fn(),
      logBatchSummary: vi.fn(),
    };

    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockImplementation(() => {
          const fromResult = {
            where: vi.fn().mockResolvedValue([{
              id: 'topic-1',
              threadId: 't1',
              primaryTopic: 'Test Topic',
              secondaryTopics: [],
              workstreamId: 'ws-1',
              confidence: 0.85,
              modelVersion: 'phi3:mini',
              promptVersion: 'classify-v1',
              technicalSummary: null,
              plainSummary: null,
              createdAt: new Date(),
            }]),
          };
          return Object.assign(
            Promise.resolve([
              { name: 'Infrastructure', id: 'ws-1' },
            ]),
            fromResult,
          );
        }),
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        PipelineService,
        { provide: ClassifierProcessor, useValue: mockClassifier },
        { provide: SummarizerProcessor, useValue: mockSummarizer },
        { provide: PipelineStateService, useValue: mockStateService },
        { provide: PipelineRunService, useValue: mockRunService },
        { provide: LlmService, useValue: mockLlmService },
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get(PipelineService);
  });

  it('processes multiple threads with per-item error isolation (AC: #6)', async () => {
    const result = await service.runClassification('2026-05-08');

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.pendingRetry).toBe(0);

    expect(mockClassifier.classifyThread).toHaveBeenCalledTimes(2);
    expect(mockRunService.startRun).toHaveBeenCalledOnce();
    expect(mockRunService.completeRun).toHaveBeenCalledWith('run-1', {
      threadsProcessed: 2,
      threadsFailed: 0,
      fallbackCount: 0,
    });
  });

  it('returns zeros and skips batch run when no threads (AC: #6)', async () => {
    mockStateService.getThreadsByState.mockResolvedValue([]);

    const result = await service.runClassification('2026-05-08');

    expect(result).toEqual({ processed: 0, failed: 0, pendingRetry: 0 });
    expect(mockRunService.startRun).not.toHaveBeenCalled();
    expect(mockClassifier.classifyThread).not.toHaveBeenCalled();
  });

  it('isolates failures — one thread fails, others succeed (AC: #6)', async () => {
    mockClassifier.classifyThread
      .mockResolvedValueOnce({ id: 'topic-1' })
      .mockRejectedValueOnce(new Error('LLM exploded'));

    const result = await service.runClassification('2026-05-08');

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.pendingRetry).toBe(0);

    expect(mockStateService.markFailed).toHaveBeenCalledWith(
      't2',
      'ingested',
      expect.any(Error),
    );
  });

  it('increments pendingRetry on LlmPendingRetryError (AC: #6)', async () => {
    mockClassifier.classifyThread
      .mockResolvedValueOnce({ id: 'topic-1' })
      .mockRejectedValueOnce(new LlmPendingRetryError('all failed', 'all'));

    const result = await service.runClassification('2026-05-08');

    expect(result.processed).toBe(1);
    expect(result.pendingRetry).toBe(1);
    expect(result.failed).toBe(0);

    expect(mockStateService.markPendingRetry).toHaveBeenCalledWith(
      't2',
      'ingested',
      expect.any(LlmPendingRetryError),
    );
  });

  it('calls resetBatchCounters before processing and logBatchSummary after (AC: #6)', async () => {
    await service.runClassification('2026-05-08');

    expect(mockLlmService.resetBatchCounters).toHaveBeenCalledOnce();
    expect(mockLlmService.logBatchSummary).toHaveBeenCalledOnce();

    const resetOrder = mockLlmService.resetBatchCounters.mock.invocationCallOrder[0];
    const classifyOrder = mockClassifier.classifyThread.mock.invocationCallOrder[0];
    const summaryOrder = mockLlmService.logBatchSummary.mock.invocationCallOrder[0];
    expect(resetOrder).toBeLessThan(classifyOrder);
    expect(classifyOrder).toBeLessThan(summaryOrder);
  });

  it('counts pendingRetry when classifier returns null (low confidence)', async () => {
    mockClassifier.classifyThread
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'topic-2' });

    const result = await service.runClassification('2026-05-08');

    expect(result.processed).toBe(1);
    expect(result.pendingRetry).toBe(1);
    expect(result.failed).toBe(0);
  });

  describe('runSummarization', () => {
    beforeEach(() => {
      mockStateService.getThreadsByState.mockResolvedValue([
        makeThread('t1', 'classified'),
        makeThread('t2', 'classified'),
      ]);
    });

    it('processes classified threads with per-item error isolation (AC: #7)', async () => {
      const result = await service.runSummarization('2026-05-08');

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockSummarizer.summarizeThread).toHaveBeenCalledTimes(2);
      expect(mockRunService.startRun).toHaveBeenCalledOnce();
      expect(mockRunService.completeRun).toHaveBeenCalledWith('run-1', {
        threadsProcessed: 2,
        threadsFailed: 0,
        fallbackCount: 0,
      });
    });

    it('returns zeros and skips batch run when no classified threads', async () => {
      mockStateService.getThreadsByState.mockResolvedValue([]);

      const result = await service.runSummarization('2026-05-08');

      expect(result).toEqual({ processed: 0, failed: 0, pendingRetry: 0 });
      expect(mockRunService.startRun).not.toHaveBeenCalled();
      expect(mockSummarizer.summarizeThread).not.toHaveBeenCalled();
    });

    it('isolates failures — one thread fails, others succeed', async () => {
      mockSummarizer.summarizeThread
        .mockResolvedValueOnce({ id: 'topic-1' })
        .mockRejectedValueOnce(new Error('LLM exploded'));

      const result = await service.runSummarization('2026-05-08');

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.pendingRetry).toBe(0);
    });

    it('calls resetBatchCounters before and logBatchSummary after', async () => {
      await service.runSummarization('2026-05-08');

      expect(mockLlmService.resetBatchCounters).toHaveBeenCalledOnce();
      expect(mockLlmService.logBatchSummary).toHaveBeenCalledOnce();
    });

    it('increments pendingRetry on LlmPendingRetryError', async () => {
      mockSummarizer.summarizeThread
        .mockResolvedValueOnce({ id: 'topic-1' })
        .mockRejectedValueOnce(new LlmPendingRetryError('all failed', 'all'));

      const result = await service.runSummarization('2026-05-08');

      expect(result.processed).toBe(1);
      expect(result.pendingRetry).toBe(1);
      expect(result.failed).toBe(0);

      expect(mockStateService.markPendingRetry).toHaveBeenCalledWith(
        't2',
        'classified',
        expect.any(LlmPendingRetryError),
      );
    });
  });
});
