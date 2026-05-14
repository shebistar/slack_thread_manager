import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StagingService } from './staging.service.js';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import { FtsService } from '../../search/fts.service.js';

const mockStagingId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const mockThreadId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const mockBatchId = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';
const mockReviewerId = 'c1b2c3d4-e5f6-7890-abcd-ef1234567890';
const mockWorkstreamId = 'd1b2c3d4-e5f6-7890-abcd-ef1234567890';

const mockStagingRow = {
  id: mockStagingId,
  threadId: mockThreadId,
  batchId: mockBatchId,
  status: 'pending' as const,
  createdAt: new Date('2026-05-01T10:00:00Z'),
  reviewedAt: null,
  reviewedBy: null,
  flags: [{ term: 'Acme Corp', replacement: '[COMPANY]', category: 'company_name', source: 'BLOCKLIST', positions: [{ field: 'body', startIndex: 0, endIndex: 9 }] }],
  originalContent: {
    technicalSummary: { headline: 'Test', body: 'Original body with Acme Corp', key_decisions: [], action_items: [] },
    plainSummary: { headline: 'Test', body: 'Original body', key_decisions: [], action_items: [] },
  },
  anonymizedContent: {
    technicalSummary: { headline: 'Test', body: 'Anonymized body with [COMPANY]', key_decisions: [], action_items: [] },
    plainSummary: { headline: 'Test', body: 'Anonymized body', key_decisions: [], action_items: [] },
  },
  workstreamId: mockWorkstreamId,
  workstreamName: 'Platform',
};

/**
 * Creates a chainable mock that tracks calls and resolves in sequence.
 * Each `.where()` or `.groupBy()` is a terminal that resolves via a queue.
 */
function buildMockDb() {
  const resolveQueue: unknown[] = [];
  const updateWhereQueue: unknown[] = [];
  const updateReturningQueue: unknown[] = [];

  function dequeue() {
    return resolveQueue.shift() ?? [];
  }

  function makeChain(): Record<string, unknown> {
    const self: Record<string, unknown> = {};
    self.select = vi.fn(() => self);
    self.from = vi.fn(() => self);
    self.innerJoin = vi.fn(() => self);
    self.leftJoin = vi.fn(() => self);
    self.where = vi.fn(() => {
      const val = dequeue();
      return Object.assign(Promise.resolve(val), {
        groupBy: vi.fn(() => Promise.resolve(dequeue())),
      });
    });
    self.groupBy = vi.fn(() => Promise.resolve(dequeue()));
    return self;
  }

  const chain = makeChain();

  const txMock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(() => {
      const val = dequeue();
      return Promise.resolve(val);
    }),
    update: vi.fn(() => {
      const updateChain: Record<string, unknown> = {};
      updateChain.set = vi.fn(() => updateChain);
      updateChain.where = vi.fn(() => {
        const val = updateWhereQueue.shift();
        const whereResult = Promise.resolve(val) as Promise<unknown> & {
          returning?: ReturnType<typeof vi.fn>;
        };
        whereResult.returning = vi.fn(() => {
          const returningVal = updateReturningQueue.shift();
          return Promise.resolve(returningVal);
        });
        return whereResult;
      });
      return updateChain;
    }),
  };

  chain.transaction = vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock));

  function enqueue(...values: unknown[]) {
    resolveQueue.length = 0;
    resolveQueue.push(...values);
  }

  function enqueueUpdateWhere(...values: unknown[]) {
    updateWhereQueue.length = 0;
    updateWhereQueue.push(...values);
  }

  function enqueueUpdateReturning(...values: unknown[]) {
    updateReturningQueue.length = 0;
    updateReturningQueue.push(...values);
  }

  return { dbMock: chain, txMock, enqueue, enqueueUpdateWhere, enqueueUpdateReturning };
}

const mockFtsService = {
  refreshSearchVector: vi.fn().mockResolvedValue(undefined),
};

describe('StagingService', () => {
  let service: StagingService;
  let dbMock: ReturnType<typeof buildMockDb>['dbMock'];
  let txMock: ReturnType<typeof buildMockDb>['txMock'];
  let enqueue: ReturnType<typeof buildMockDb>['enqueue'];
  let enqueueUpdateWhere: ReturnType<typeof buildMockDb>['enqueueUpdateWhere'];
  let enqueueUpdateReturning: ReturnType<typeof buildMockDb>['enqueueUpdateReturning'];

  beforeEach(async () => {
    const mocks = buildMockDb();
    dbMock = mocks.dbMock;
    txMock = mocks.txMock;
    enqueue = mocks.enqueue;
    enqueueUpdateWhere = mocks.enqueueUpdateWhere;
    enqueueUpdateReturning = mocks.enqueueUpdateReturning;
    mockFtsService.refreshSearchVector.mockClear();

    const module = await Test.createTestingModule({
      providers: [
        StagingService,
        { provide: DATABASE_TOKEN, useValue: dbMock },
        { provide: FtsService, useValue: mockFtsService },
      ],
    }).compile();

    service = module.get<StagingService>(StagingService);
  });

  describe('listPending', () => {
    function setupListSequence(
      items: unknown[],
      statusCounts: unknown[],
      flaggedCount: unknown[],
      batchGroupBy: unknown[],
    ) {
      enqueue(
        items,          // main query .where()
        statusCounts,   // getQueueCounts: .groupBy()
        flaggedCount,   // getQueueCounts flagged: .where()
        batchGroupBy,   // buildBatchSummary: .where() -> .groupBy()
      );
    }

    it('returns items with default filters', async () => {
      setupListSequence(
        [mockStagingRow],
        [{ status: 'pending', cnt: 3 }, { status: 'approved', cnt: 1 }, { status: 'rejected', cnt: 1 }],
        [{ cnt: 2 }],
        [],
      );

      const result = await service.listPending({ view: 'all' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(mockStagingId);
      expect(result.items[0].workstream).toEqual({ id: mockWorkstreamId, name: 'Platform' });
      expect(result.counts.total).toBe(5);
      expect(result.counts.pending).toBe(3);
    });

    it('filters by flagged view', async () => {
      const unflaggedRow = { ...mockStagingRow, id: 'unflagged-1', flags: [] };
      setupListSequence(
        [mockStagingRow, unflaggedRow],
        [{ status: 'pending', cnt: 2 }],
        [{ cnt: 1 }],
        [],
      );

      const result = await service.listPending({ view: 'flagged' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].flags.length).toBeGreaterThan(0);
    });

    it('filters by workstream ID', async () => {
      const otherRow = { ...mockStagingRow, id: 'other', workstreamId: 'other-ws', workstreamName: 'Other' };
      setupListSequence(
        [mockStagingRow, otherRow],
        [{ status: 'pending', cnt: 2 }],
        [{ cnt: 1 }],
        [],
      );

      const result = await service.listPending({ view: 'all', workstreamId: mockWorkstreamId });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].workstream!.id).toBe(mockWorkstreamId);
    });

    it('returns correct counts shape', async () => {
      setupListSequence(
        [],
        [{ status: 'pending', cnt: 5 }, { status: 'approved', cnt: 3 }, { status: 'rejected', cnt: 2 }],
        [{ cnt: 4 }],
        [],
      );

      const result = await service.listPending({ view: 'all' });

      expect(result.counts).toEqual({
        total: 10,
        pending: 5,
        approved: 3,
        rejected: 2,
        flagged: 4,
      });
    });
  });

  describe('reviewItem', () => {
    it('approves item and transitions thread to approved', async () => {
      txMock.where
        .mockResolvedValueOnce([mockStagingRow])
        .mockResolvedValueOnce([{ cnt: 0 }]);
      enqueueUpdateWhere(undefined, undefined);
      enqueueUpdateReturning([{ id: mockThreadId }]);

      const result = await service.reviewItem(mockStagingId, 'approve', mockReviewerId);

      expect(txMock.update).toHaveBeenCalled();
      expect(result.batchComplete).toBe(true);
      expect(mockFtsService.refreshSearchVector).toHaveBeenCalledWith(
        txMock,
        mockThreadId,
        mockStagingRow.anonymizedContent,
      );
    });

    it('skips FTS refresh when thread is not in staged state', async () => {
      txMock.where
        .mockResolvedValueOnce([mockStagingRow])
        .mockResolvedValueOnce([{ cnt: 0 }]);
      enqueueUpdateWhere(undefined, undefined);
      enqueueUpdateReturning([]);

      await service.reviewItem(mockStagingId, 'approve', mockReviewerId);

      expect(mockFtsService.refreshSearchVector).not.toHaveBeenCalled();
    });

    it('rejects item without transitioning thread state', async () => {
      txMock.where
        .mockResolvedValueOnce([mockStagingRow])
        .mockResolvedValueOnce([{ cnt: 2 }]);

      const result = await service.reviewItem(mockStagingId, 'reject', mockReviewerId);

      expect(result.batchComplete).toBe(false);
      expect(result.remainingPending).toBe(2);
      expect(mockFtsService.refreshSearchVector).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for non-existent item', async () => {
      txMock.where.mockResolvedValueOnce([]);

      await expect(
        service.reviewItem('nonexistent-id', 'approve', mockReviewerId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for already-reviewed item', async () => {
      txMock.where.mockResolvedValueOnce([{ ...mockStagingRow, status: 'approved' }]);

      await expect(
        service.reviewItem(mockStagingId, 'approve', mockReviewerId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('approveAllClean', () => {
    it('approves only items with empty flags and refreshes FTS', async () => {
      const cleanItem = {
        id: 'clean-1',
        threadId: mockThreadId,
        batchId: mockBatchId,
        anonymizedContent: mockStagingRow.anonymizedContent,
      };
      enqueue(
        [cleanItem],    // select clean items .where()
        [{ cnt: 0 }],  // remaining pending .where()
      );
      enqueueUpdateWhere(undefined, undefined);
      enqueueUpdateReturning([{ id: mockThreadId }]);

      const result = await service.approveAllClean({}, mockReviewerId);

      expect(result.approvedCount).toBe(1);
      expect(result.batchComplete).toBe(true);
      expect(mockFtsService.refreshSearchVector).toHaveBeenCalledWith(
        expect.anything(),
        mockThreadId,
        mockStagingRow.anonymizedContent,
      );
    });

    it('respects workstream filter during bulk approval', async () => {
      const cleanItem = {
        id: 'clean-1',
        threadId: mockThreadId,
        batchId: mockBatchId,
        anonymizedContent: mockStagingRow.anonymizedContent,
      };
      enqueue(
        [cleanItem],                      // select clean items
        [{ threadId: mockThreadId }],     // workstream thread lookup
        [{ cnt: 1 }],                     // remaining pending
      );
      enqueueUpdateWhere(undefined, undefined);
      enqueueUpdateReturning([{ id: mockThreadId }]);

      const result = await service.approveAllClean(
        { workstreamId: mockWorkstreamId },
        mockReviewerId,
      );

      expect(result.approvedCount).toBe(1);
    });

    it('returns batchComplete: false when pending items remain', async () => {
      enqueue(
        [],             // no clean items to approve
        [{ cnt: 3 }],  // remaining pending
      );

      const result = await service.approveAllClean({}, mockReviewerId);

      expect(result.approvedCount).toBe(0);
      expect(result.remainingPending).toBe(3);
      expect(result.batchComplete).toBe(false);
    });
  });

  describe('getBatchProgress', () => {
    it('returns batch summary with counts by status', async () => {
      const batchRows = [
        { status: 'pending', cnt: 2, createdAt: new Date('2026-05-01T10:00:00Z') },
        { status: 'approved', cnt: 3, createdAt: new Date('2026-05-01T10:00:00Z') },
        { status: 'rejected', cnt: 1, createdAt: new Date('2026-05-01T10:00:00Z') },
      ];
      // .where() consumes first value, .groupBy() consumes second
      enqueue(undefined, batchRows);

      const result = await service.getBatchProgress(mockBatchId);

      expect(result.batchId).toBe(mockBatchId);
      expect(result.total).toBe(6);
      expect(result.pending).toBe(2);
      expect(result.approved).toBe(3);
      expect(result.rejected).toBe(1);
    });
  });
});
