import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { StagingQueueService } from './staging-queue.service.js';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import { PipelineStateService } from '../pipeline-state.service.js';
import type { AnonymizationResult } from '@slack-thread-manager/shared';

function makeMockResult(overrides: Partial<AnonymizationResult> = {}): AnonymizationResult {
  return {
    threadId: overrides.threadId ?? 'thread-uuid-1',
    originalContent: overrides.originalContent ?? {
      technicalSummary: { headline: 'h', body: 'b', key_decisions: [], action_items: [] },
      plainSummary: { headline: 'h', body: 'b', key_decisions: [], action_items: [] },
    },
    anonymizedContent: overrides.anonymizedContent ?? {
      technicalSummary: { headline: 'h', body: 'b', key_decisions: [], action_items: [] },
      plainSummary: { headline: 'h', body: 'b', key_decisions: [], action_items: [] },
    },
    flags: overrides.flags ?? [],
  };
}

describe('StagingQueueService', () => {
  let service: StagingQueueService;
  let mockTransaction: ReturnType<typeof vi.fn>;
  let mockPipelineStateService: Record<string, ReturnType<typeof vi.fn>>;
  let mockDb: Record<string, unknown>;
  let insertedRows: Array<Record<string, unknown>>;
  let updateReturningQueue: Array<Array<{ id: string }>>;
  let selectExistingQueue: Array<Array<{ id: string; pipelineState: string | null }>>;
  let approvedRows: Array<{ threadId: string }>;

  beforeEach(async () => {
    insertedRows = [];
    updateReturningQueue = [[{ id: 'thread-uuid-1' }]];
    selectExistingQueue = [[{ id: 'thread-uuid-1', pipelineState: 'embedded' }]];
    approvedRows = [];
    mockPipelineStateService = {
      markFailed: vi.fn().mockResolvedValue(undefined),
    };

    mockTransaction = vi.fn().mockImplementation(async (callback) => {
      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockImplementation(async () => updateReturningQueue.shift() ?? []),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(async () => selectExistingQueue.shift() ?? []),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockImplementation(async (values) => {
            insertedRows.push(values as Record<string, unknown>);
          }),
        }),
      };
      return callback(tx);
    });

    mockDb = {
      transaction: mockTransaction,
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(async () => approvedRows),
        }),
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        StagingQueueService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
        { provide: PipelineStateService, useValue: mockPipelineStateService },
      ],
    }).compile();

    service = module.get<StagingQueueService>(StagingQueueService);
  });

  it('8.1: empty input returns zero counts and null batchId', async () => {
    const result = await service.stageResults([]);

    expect(result).toEqual({ threadsStaged: 0, threadsFailed: 0, batchId: null });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('8.2: single thread with flags inserts staging_queue row correctly', async () => {
    const flags = [{ term: 'Acme', replacement: 'EOS', category: 'company_name' as const, source: 'BLOCKLIST' as const, positions: [{ field: 'technicalSummary.headline', startIndex: 0, endIndex: 4 }] }];
    const input = makeMockResult({ threadId: 'thread-uuid-1', flags });

    const result = await service.stageResults([input]);

    expect(result.threadsStaged).toBe(1);
    expect(result.threadsFailed).toBe(0);
    expect(result.batchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toEqual(expect.objectContaining({
      threadId: 'thread-uuid-1',
      flags,
      status: 'pending',
    }));
    expect(mockPipelineStateService.markFailed).not.toHaveBeenCalled();
  });

  it('8.3: thread with zero flags still inserted — mandatory gate', async () => {
    const input = makeMockResult({ threadId: 'thread-uuid-1', flags: [] });

    const result = await service.stageResults([input]);

    expect(result.threadsStaged).toBe(1);
    expect(result.threadsFailed).toBe(0);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toEqual(expect.objectContaining({
      threadId: 'thread-uuid-1',
      flags: [],
      status: 'pending',
    }));
  });

  it('8.4: thread pipeline state transition is claimed before insert', async () => {
    const input = makeMockResult({ threadId: 'thread-uuid-1' });

    await service.stageResults([input]);

    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(insertedRows).toHaveLength(1);
  });

  it('8.5: thread NOT in embedded state is skipped and persisted as pipeline failure', async () => {
    updateReturningQueue = [[]];
    selectExistingQueue = [[{ id: 'thread-uuid-1', pipelineState: 'classified' }]];

    const input = makeMockResult({ threadId: 'thread-uuid-1' });
    const result = await service.stageResults([input]);

    expect(result.threadsStaged).toBe(0);
    expect(result.threadsFailed).toBe(1);
    expect(insertedRows).toHaveLength(0);
    expect(mockPipelineStateService.markFailed).toHaveBeenCalledWith(
      'thread-uuid-1',
      'embedded',
      expect.any(Error),
    );
  });

  it('8.6: multiple threads all get same batchId', async () => {
    const inputs = [
      makeMockResult({ threadId: 'thread-1' }),
      makeMockResult({ threadId: 'thread-2' }),
      makeMockResult({ threadId: 'thread-3' }),
    ];

    updateReturningQueue = [[{ id: 'thread-1' }], [{ id: 'thread-2' }], [{ id: 'thread-3' }]];

    const result = await service.stageResults(inputs);

    expect(result.threadsStaged).toBe(3);
    expect(result.batchId).toMatch(/^[0-9a-f-]{36}$/);

    const insertCalls = insertedRows.map((r) => r.batchId as string);
    const uniqueBatchIds = new Set(insertCalls);
    expect(uniqueBatchIds.size).toBe(1);
  });

  it('8.7: per-thread error isolation — one failure does not block others', async () => {
    const inputs = [
      makeMockResult({ threadId: 'thread-fail' }),
      makeMockResult({ threadId: 'thread-ok' }),
    ];

    let callCount = 0;
    mockTransaction.mockImplementation(async (callback) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('DB write failed');
      }
      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'thread-ok' }]),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: 'thread-ok', pipelineState: 'embedded' }]),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      };
      return callback(tx);
    });

    const result = await service.stageResults(inputs);

    expect(result.threadsStaged).toBe(1);
    expect(result.threadsFailed).toBe(1);
    expect(mockPipelineStateService.markFailed).toHaveBeenCalledWith(
      'thread-fail',
      'embedded',
      expect.any(Error),
    );
  });

  it('8.8: JSONB content matches input exactly', async () => {
    const original = {
      technicalSummary: { headline: 'Original H', body: 'Original B', key_decisions: ['d1'], action_items: ['a1'] },
      plainSummary: { headline: 'Plain H', body: 'Plain B', key_decisions: [], action_items: [] },
    };
    const anonymized = {
      technicalSummary: { headline: 'Anon H', body: 'Anon B', key_decisions: ['d1'], action_items: ['a1'] },
      plainSummary: { headline: 'Plain H', body: 'Plain B', key_decisions: [], action_items: [] },
    };
    const input = makeMockResult({ originalContent: original, anonymizedContent: anonymized });

    await service.stageResults([input]);

    expect(insertedRows[0]).toEqual(expect.objectContaining({
      originalContent: original,
      anonymizedContent: anonymized,
    }));
  });

  it('8.9: both BLOCKLIST and LLM flags preserved correctly', async () => {
    const flags = [
      { term: 'Acme', replacement: 'EOS', category: 'company_name' as const, source: 'BLOCKLIST' as const, positions: [{ field: 'technicalSummary.headline', startIndex: 0, endIndex: 4 }] },
      { term: 'Bob', replacement: '[PERSON]', category: 'person_name' as const, source: 'LLM' as const, confidence: 0.9 },
    ];
    const input = makeMockResult({ flags });

    await service.stageResults([input]);

    expect(insertedRows[0]).toEqual(expect.objectContaining({ flags }));
  });

  it('8.10: batchId is a valid UUID', async () => {
    const input = makeMockResult();
    const result = await service.stageResults([input]);

    expect(result.batchId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('8.14: getApprovedThreadIds returns only approved thread IDs', async () => {
    approvedRows = [
      { threadId: 'approved-1' },
      { threadId: 'approved-2' },
    ];

    const result = await service.getApprovedThreadIds();

    expect(result).toEqual(['approved-1', 'approved-2']);
  });
});
