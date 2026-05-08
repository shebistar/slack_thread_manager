import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PipelineStateService } from './pipeline-state.service.js';
import { InvalidStateTransitionError } from './pipeline.errors.js';
import { DATABASE_TOKEN } from '../../database/database.module.js';

const makeThread = (overrides?: Record<string, unknown>) => ({
  id: 'thread-1',
  slackTeamId: 'T123',
  channelId: 'ch-1',
  threadTs: '1234.5678',
  latestReplyTs: null,
  messageCount: 3,
  rawMessages: [],
  participantIds: [],
  pipelineState: 'ingested',
  processingDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('PipelineStateService', () => {
  let service: PipelineStateService;
  let mockTx: Record<string, ReturnType<typeof vi.fn>>;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    const selectResult = [makeThread()];
    const updateResult = [makeThread({ pipelineState: 'classified' })];

    mockTx = {
      select: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;

    const selectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(selectResult),
      }),
    };

    const updateChain = {
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(updateResult),
        }),
      }),
    };

    const insertChain = {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    };

    mockTx.select = vi.fn().mockReturnValue(selectChain);
    mockTx.update = vi.fn().mockReturnValue(updateChain);
    mockTx.insert = vi.fn().mockReturnValue(insertChain);

    const dbInsertChain = {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    };

    const dbSelectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    };

    mockDb = {
      transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
      select: vi.fn().mockReturnValue(dbSelectChain),
      insert: vi.fn().mockReturnValue(dbInsertChain),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineStateService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<PipelineStateService>(PipelineStateService);
  });

  describe('isValidTransition', () => {
    it('allows ingested → classified', () => {
      expect(service.isValidTransition('ingested', 'classified')).toBe(true);
    });

    it('rejects ingested → summarized (skip)', () => {
      expect(service.isValidTransition('ingested', 'summarized')).toBe(false);
    });

    it('allows any state → failed', () => {
      expect(service.isValidTransition('classified', 'failed')).toBe(true);
      expect(service.isValidTransition('embedded', 'failed')).toBe(true);
    });

    it('allows pending_retry → ingested (retry re-entry)', () => {
      expect(service.isValidTransition('pending_retry', 'ingested')).toBe(true);
    });

    it('rejects transitions from delivered (terminal)', () => {
      expect(service.isValidTransition('delivered', 'ingested')).toBe(false);
      expect(service.isValidTransition('delivered', 'classified')).toBe(false);
    });
  });

  describe('transitionState', () => {
    it('transitions ingested → classified successfully', async () => {
      const result = await service.transitionState('thread-1', 'classified');
      expect(result.pipelineState).toBe('classified');
      expect(mockTx.update).toHaveBeenCalled();
    });

    it('throws InvalidStateTransitionError on invalid transition', async () => {
      await expect(
        service.transitionState('thread-1', 'summarized'),
      ).rejects.toThrow(InvalidStateTransitionError);
    });

    it('throws NotFoundException when thread not found', async () => {
      const emptySelectChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      };
      mockTx.select = vi.fn().mockReturnValue(emptySelectChain);

      await expect(
        service.transitionState('nonexistent', 'classified'),
      ).rejects.toThrow(NotFoundException);
    });

    it('sets processingDate when provided', async () => {
      const setFn = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([makeThread({ pipelineState: 'classified', processingDate: '2026-05-08' })]),
        }),
      });
      mockTx.update = vi.fn().mockReturnValue({ set: setFn });

      await service.transitionState('thread-1', 'classified', '2026-05-08');
      expect(setFn).toHaveBeenCalledWith(
        expect.objectContaining({
          pipelineState: 'classified',
          processingDate: '2026-05-08',
        }),
      );
    });

    it('allows pending_retry → ingested for retry re-entry', async () => {
      const selectWhere = vi.fn().mockResolvedValue([makeThread({ pipelineState: 'pending_retry' })]);
      mockTx.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: selectWhere }),
      });

      const updateReturning = vi.fn().mockResolvedValue([makeThread({ pipelineState: 'ingested' })]);
      mockTx.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ returning: updateReturning }),
        }),
      });

      const result = await service.transitionState('thread-1', 'ingested');
      expect(result.pipelineState).toBe('ingested');
    });
  });

  describe('markFailed', () => {
    it('inserts a pipeline_failures row without changing thread state', async () => {
      const valuesFn = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      });
      mockDb.insert = vi.fn().mockReturnValue({ values: valuesFn });

      await service.markFailed(
        'thread-1',
        'classified',
        new Error('LLM timeout'),
        { attempt: 2 },
      );

      expect(mockDb.insert).toHaveBeenCalled();
      expect(valuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: 'thread-1',
          pipelineStage: 'classified',
          errorMessage: 'LLM timeout',
          errorContext: { attempt: 2 },
        }),
      );
    });
  });

  describe('markPendingRetry', () => {
    it('sets thread state to pending_retry and inserts failure row', async () => {
      const setFn = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });
      const txValuesFn = vi.fn().mockResolvedValue([]);
      mockTx.update = vi.fn().mockReturnValue({ set: setFn });
      mockTx.insert = vi.fn().mockReturnValue({ values: txValuesFn });

      await service.markPendingRetry(
        'thread-1',
        'classified',
        new Error('All providers failed'),
      );

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(setFn).toHaveBeenCalledWith(
        expect.objectContaining({ pipelineState: 'pending_retry' }),
      );
      expect(txValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: 'thread-1',
          pipelineStage: 'classified',
          errorMessage: 'All providers failed',
          errorContext: { retryable: true },
        }),
      );
    });
  });

  describe('getThreadsByState', () => {
    it('returns threads at the given state', async () => {
      const threads = [makeThread()];
      const whereFn = vi.fn().mockResolvedValue(threads);
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: whereFn }),
      });

      const result = await service.getThreadsByState('ingested');
      expect(result).toEqual(threads);
      expect(whereFn).toHaveBeenCalled();
    });

    it('filters by processingDate when provided', async () => {
      const threads = [makeThread()];
      const whereFn = vi.fn().mockResolvedValue(threads);
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: whereFn }),
      });

      const result = await service.getThreadsByState('ingested', '2026-05-08');
      expect(result).toEqual(threads);
      expect(whereFn).toHaveBeenCalled();
    });
  });
});
