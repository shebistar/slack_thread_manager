import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CorrelatorProcessor } from './correlator.processor.js';
import { DATABASE_TOKEN } from '../../../database/database.module.js';

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
};

const mockConfigService = {
  get: vi.fn().mockReturnValue(0.7),
};

// Fluent builder helpers for Drizzle mocks
function makeSelect(returnValue: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    then: vi.fn(),
  };
  (chain as Record<string, unknown>)[Symbol.iterator] = undefined;
  // Make it thenable
  const promise = Promise.resolve(returnValue);
  chain.where.mockReturnValue(promise);
  chain.from.mockReturnValue(chain);
  return chain;
}

function makeInsert() {
  const chain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue([]),
  };
  return chain;
}

describe('CorrelatorProcessor', () => {
  let processor: CorrelatorProcessor;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        CorrelatorProcessor,
        { provide: DATABASE_TOKEN, useValue: mockDb },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    processor = module.get(CorrelatorProcessor);
  });

  describe('runBatchCorrelation()', () => {
    it('returns zeros immediately when fewer than 2 embedded threads', async () => {
      // slackThreads select returns 1 row
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { threadId: 'thread-1', channelId: 'chan-1', participantIds: [] },
        ]),
      });

      const result = await processor.runBatchCorrelation();

      expect(result).toEqual({ created: 0, updated: 0, pairsEvaluated: 0 });
      expect(mockDb.execute).not.toHaveBeenCalled();
    });

    it('returns zeros when 0 embedded threads', async () => {
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      });

      const result = await processor.runBatchCorrelation();

      expect(result).toEqual({ created: 0, updated: 0, pairsEvaluated: 0 });
    });

    it('creates SEMANTIC correlations for cross-channel high-similarity pairs', async () => {
      const thread1 = { threadId: 't1', channelId: 'chan-1', participantIds: [] };
      const thread2 = { threadId: 't2', channelId: 'chan-2', participantIds: [] };

      // 1st select: embedded threads
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([thread1, thread2]),
      });
      // execute: semantic similarity query returns one pair above threshold
      mockDb.execute.mockResolvedValueOnce({
        rows: [
          {
            source_thread_id: 't1',
            correlated_thread_id: 't2',
            cosine_similarity: 0.85,
          },
        ],
      });
      // 2nd select: classifiedTopics for topic match (different topics)
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { threadId: 't1', primaryTopic: 'Topic A' },
          { threadId: 't2', primaryTopic: 'Topic B' },
        ]),
      });
      // upsert checks: 4 selects (2 pairs × 2 directions) → all 'created' (not existing)
      for (let i = 0; i < 2; i++) {
        mockDb.select.mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        });
      }
      mockDb.insert.mockReturnValue(makeInsert());

      const result = await processor.runBatchCorrelation();

      expect(result.pairsEvaluated).toBe(1);
      expect(result.created).toBe(2); // forward + reverse
      expect(result.updated).toBe(0);
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });

    it('creates TOPIC_MATCH correlations for threads with same primary topic in different channels', async () => {
      const thread1 = { threadId: 't1', channelId: 'chan-1', participantIds: [] };
      const thread2 = { threadId: 't2', channelId: 'chan-2', participantIds: [] };

      // embedded threads
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([thread1, thread2]),
      });
      // semantic: no pairs above threshold
      mockDb.execute.mockResolvedValueOnce({ rows: [] });
      // classifiedTopics: same primary_topic
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { threadId: 't1', primaryTopic: 'Shared Topic' },
          { threadId: 't2', primaryTopic: 'Shared Topic' },
        ]),
      });
      // upsert checks: 2 directions, neither exists
      for (let i = 0; i < 2; i++) {
        mockDb.select.mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        });
      }
      mockDb.insert.mockReturnValue(makeInsert());

      const result = await processor.runBatchCorrelation();

      expect(result.pairsEvaluated).toBe(1);
      expect(result.created).toBe(2);

      // Verify the insert was called with confidence = 1.0 and type = topic_match
      const insertCallArgs = mockDb.insert.mock.results
        .map((r) => r.value.values.mock.calls[0]?.[0])
        .filter(Boolean);
      expect(insertCallArgs.some((a) => a.correlationType === 'topic_match' && a.confidence === 1.0)).toBe(true);
    });

    it('creates PARTICIPANT_OVERLAP correlations for threads with shared participants in different channels', async () => {
      const thread1 = { threadId: 't1', channelId: 'chan-1', participantIds: ['alice', 'bob'] };
      const thread2 = { threadId: 't2', channelId: 'chan-2', participantIds: ['bob', 'carol'] };

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([thread1, thread2]),
      });
      // semantic: no pairs
      mockDb.execute.mockResolvedValueOnce({ rows: [] });
      // topics: different topics
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { threadId: 't1', primaryTopic: 'Topic A' },
          { threadId: 't2', primaryTopic: 'Topic B' },
        ]),
      });
      // upsert checks: 2 directions
      for (let i = 0; i < 2; i++) {
        mockDb.select.mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        });
      }
      mockDb.insert.mockReturnValue(makeInsert());

      const result = await processor.runBatchCorrelation();

      expect(result.pairsEvaluated).toBe(1);
      // Jaccard(['alice','bob'], ['bob','carol']) = 1/3 ≈ 0.333
      const insertCallArgs = mockDb.insert.mock.results
        .map((r) => r.value.values.mock.calls[0]?.[0])
        .filter(Boolean);
      expect(insertCallArgs.some((a) => a.correlationType === 'participant_overlap')).toBe(true);
      const conf = insertCallArgs.find((a) => a.correlationType === 'participant_overlap')?.confidence;
      expect(conf).toBeCloseTo(1 / 3, 5);
    });

    it('does NOT correlate threads in the same channel (even with same topic)', async () => {
      const thread1 = { threadId: 't1', channelId: 'chan-1', participantIds: [] };
      const thread2 = { threadId: 't2', channelId: 'chan-1', participantIds: [] }; // same channel

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([thread1, thread2]),
      });
      // semantic: pgvector query filters same channel already
      mockDb.execute.mockResolvedValueOnce({ rows: [] });
      // topics: same topic, but same channel
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { threadId: 't1', primaryTopic: 'Shared Topic' },
          { threadId: 't2', primaryTopic: 'Shared Topic' },
        ]),
      });

      const result = await processor.runBatchCorrelation();

      expect(result.pairsEvaluated).toBe(0);
      expect(result.created).toBe(0);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('does NOT create correlations when cosine similarity is below threshold', async () => {
      const thread1 = { threadId: 't1', channelId: 'chan-1', participantIds: [] };
      const thread2 = { threadId: 't2', channelId: 'chan-2', participantIds: [] };

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([thread1, thread2]),
      });
      // semantic: no pairs above threshold (query filters them out)
      mockDb.execute.mockResolvedValueOnce({ rows: [] });
      // topics: different
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { threadId: 't1', primaryTopic: 'Topic A' },
          { threadId: 't2', primaryTopic: 'Topic B' },
        ]),
      });

      const result = await processor.runBatchCorrelation();

      expect(result.pairsEvaluated).toBe(0);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('is idempotent: running twice on same threads updates existing rows, not creates', async () => {
      const thread1 = { threadId: 't1', channelId: 'chan-1', participantIds: [] };
      const thread2 = { threadId: 't2', channelId: 'chan-2', participantIds: [] };

      // First run — both directions are 'created'
      // (Skipped here — testing idempotency of second run)

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([thread1, thread2]),
      });
      mockDb.execute.mockResolvedValueOnce({
        rows: [{ source_thread_id: 't1', correlated_thread_id: 't2', cosine_similarity: 0.9 }],
      });
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { threadId: 't1', primaryTopic: 'Topic A' },
          { threadId: 't2', primaryTopic: 'Topic B' },
        ]),
      });
      // upsert checks: both directions already EXIST
      for (let i = 0; i < 2; i++) {
        mockDb.select.mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([{ id: `existing-${i}` }]),
        });
      }
      mockDb.insert.mockReturnValue(makeInsert());

      const result = await processor.runBatchCorrelation();

      expect(result.pairsEvaluated).toBe(1);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(2); // both directions updated
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });

    it('SEMANTIC type takes priority when same pair also has topic_match', async () => {
      const thread1 = { threadId: 't1', channelId: 'chan-1', participantIds: [] };
      const thread2 = { threadId: 't2', channelId: 'chan-2', participantIds: [] };

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([thread1, thread2]),
      });
      // semantic: pair found
      mockDb.execute.mockResolvedValueOnce({
        rows: [{ source_thread_id: 't1', correlated_thread_id: 't2', cosine_similarity: 0.95 }],
      });
      // topics: same topic too
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { threadId: 't1', primaryTopic: 'Same Topic' },
          { threadId: 't2', primaryTopic: 'Same Topic' },
        ]),
      });
      // upsert checks: 2 directions
      for (let i = 0; i < 2; i++) {
        mockDb.select.mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        });
      }
      mockDb.insert.mockReturnValue(makeInsert());

      const result = await processor.runBatchCorrelation();

      // Only 1 pair stored (deduplicated), with SEMANTIC type
      expect(result.pairsEvaluated).toBe(1);
      const insertCallArgs = mockDb.insert.mock.results
        .map((r) => r.value.values.mock.calls[0]?.[0])
        .filter(Boolean);
      expect(insertCallArgs.every((a) => a.correlationType === 'semantic')).toBe(true);
    });
  });
});
