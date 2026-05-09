import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OrphanedActionDetectorProcessor } from './orphaned-action-detector.processor.js';
import { DATABASE_TOKEN } from '../../../database/database.module.js';

describe('OrphanedActionDetectorProcessor', () => {
  let processor: OrphanedActionDetectorProcessor;
  let mockDb: any;
  let mockConfigService: any;

  const makeThread = (overrides: Partial<{
    id: string;
    latestReplyTs: string;
    participantIds: string[];
    pipelineState: string;
  }> = {}) => ({
    id: overrides.id ?? 'thread-1',
    latestReplyTs: overrides.latestReplyTs ?? '1714500000.000000',
    participantIds: overrides.participantIds ?? ['alice', 'bob'],
    pipelineState: overrides.pipelineState ?? 'summarized',
  });

  const makeTopic = (overrides: Partial<{
    threadId: string;
    technicalSummary: any;
  }> = {}) => ({
    threadId: overrides.threadId ?? 'thread-1',
    technicalSummary: overrides.technicalSummary ?? {
      headline: 'Test',
      body: 'Test body',
      key_decisions: [],
      action_items: ['Fix the deployment pipeline', 'Update docs for @alice'],
    },
  });

  beforeEach(async () => {
    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    };

    mockConfigService = {
      get: vi.fn().mockReturnValue(2),
    };

    const module = await Test.createTestingModule({
      providers: [
        OrphanedActionDetectorProcessor,
        { provide: DATABASE_TOKEN, useValue: mockDb },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    processor = module.get(OrphanedActionDetectorProcessor);
  });

  function setupDbChain(result: any) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(result),
    };
    return chain;
  }

  describe('runDetection', () => {
    it('returns zeros when no summarized threads exist', async () => {
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValue(selectChain);

      const result = await processor.runDetection();

      expect(result).toEqual({ detected: 0, resolved: 0, scanned: 0 });
    });

    it('detects orphaned actions for inactive threads beyond threshold', async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 5);
      const slackTs = (threeDaysAgo.getTime() / 1000).toString();

      const threads = [makeThread({ id: 'thread-1', latestReplyTs: slackTs })];
      const topics = [makeTopic({ threadId: 'thread-1' })];

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockImplementation(() => {
            if (callCount === 1) return Promise.resolve(threads);
            if (callCount === 2) return Promise.resolve(topics);
            return Promise.resolve([]);
          }),
        };
      });

      const insertReturning = vi.fn().mockResolvedValue([{ id: 'action-1' }]);
      const insertOnConflict = vi.fn().mockReturnValue({ returning: insertReturning });
      const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
      mockDb.insert.mockReturnValue({ values: insertValues });

      const result = await processor.runDetection();

      expect(result.detected).toBe(2);
      expect(result.scanned).toBe(1);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('resolves orphaned actions when thread has new activity', async () => {
      const now = new Date();
      const recentTs = (now.getTime() / 1000).toString();
      const pastDetected = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const threads = [makeThread({ id: 'thread-1', latestReplyTs: recentTs })];
      const topics = [makeTopic({
        threadId: 'thread-1',
        technicalSummary: { action_items: [] },
      })];
      const existingOrphaned = [{
        id: 'orphaned-1',
        threadId: 'thread-1',
        detectedAt: pastDetected,
      }];

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockImplementation(() => {
            if (callCount === 1) return Promise.resolve(threads);
            if (callCount === 2) return Promise.resolve(topics);
            if (callCount === 3) return Promise.resolve(existingOrphaned);
            if (callCount === 4) return Promise.resolve([{ id: 'thread-1', latestReplyTs: recentTs }]);
            return Promise.resolve([]);
          }),
        };
      });

      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      mockDb.update.mockReturnValue({ set: updateSet });

      const result = await processor.runDetection();

      expect(result.resolved).toBe(1);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('reopens previously resolved action when inactivity threshold is reached again', async () => {
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const slackTs = (fiveDaysAgo.getTime() / 1000).toString();

      const threads = [makeThread({ id: 'thread-1', latestReplyTs: slackTs })];
      const topics = [makeTopic({
        threadId: 'thread-1',
        technicalSummary: { action_items: ['Follow up with alice'] },
      })];

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockImplementation(() => {
            if (callCount === 1) return Promise.resolve(threads);
            if (callCount === 2) return Promise.resolve(topics);
            if (callCount === 3) return Promise.resolve([]);
            return Promise.resolve([]);
          }),
        };
      });

      const insertReturning = vi.fn().mockResolvedValue([]);
      const insertOnConflict = vi.fn().mockReturnValue({ returning: insertReturning });
      const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
      mockDb.insert.mockReturnValue({ values: insertValues });

      const updateReturning = vi.fn().mockResolvedValue([{ id: 'reopened-1' }]);
      const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      mockDb.update.mockReturnValue({ set: updateSet });

      const result = await processor.runDetection();

      expect(result.detected).toBe(1);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('does not detect orphaned actions for recently active threads', async () => {
      const now = new Date();
      const recentTs = ((now.getTime() - 1000) / 1000).toString();

      const threads = [makeThread({ id: 'thread-1', latestReplyTs: recentTs })];
      const topics = [makeTopic({ threadId: 'thread-1' })];

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockImplementation(() => {
            if (callCount === 1) return Promise.resolve(threads);
            if (callCount === 2) return Promise.resolve(topics);
            return Promise.resolve([]);
          }),
        };
      });

      const result = await processor.runDetection();

      expect(result.detected).toBe(0);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('does not create duplicates due to idempotency (onConflictDoNothing returns null)', async () => {
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const slackTs = (fiveDaysAgo.getTime() / 1000).toString();

      const threads = [makeThread({ id: 'thread-1', latestReplyTs: slackTs })];
      const topics = [makeTopic({
        threadId: 'thread-1',
        technicalSummary: { action_items: ['Already tracked action'] },
      })];

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockImplementation(() => {
            if (callCount === 1) return Promise.resolve(threads);
            if (callCount === 2) return Promise.resolve(topics);
            return Promise.resolve([]);
          }),
        };
      });

      const insertReturning = vi.fn().mockResolvedValue([]);
      const insertOnConflict = vi.fn().mockReturnValue({ returning: insertReturning });
      const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
      mockDb.insert.mockReturnValue({ values: insertValues });

      const result = await processor.runDetection();

      expect(result.detected).toBe(0);
    });

    it('skips threads with empty action_items array', async () => {
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const slackTs = (fiveDaysAgo.getTime() / 1000).toString();

      const threads = [makeThread({ id: 'thread-1', latestReplyTs: slackTs })];
      const topics = [makeTopic({
        threadId: 'thread-1',
        technicalSummary: { action_items: [] },
      })];

      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockImplementation(() => {
            if (callCount === 1) return Promise.resolve(threads);
            if (callCount === 2) return Promise.resolve(topics);
            return Promise.resolve([]);
          }),
        };
      });

      const result = await processor.runDetection();

      expect(result.detected).toBe(0);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('countWorkdays', () => {
    it('counts elapsed Mon-Fri workdays excluding the end date', () => {
      // Monday to Friday = 3 elapsed workdays (Tue, Wed, Thu)
      const monday = new Date('2026-05-04T10:00:00Z');
      const friday = new Date('2026-05-08T10:00:00Z');
      expect(processor.countWorkdays(monday, friday)).toBe(3);
    });

    it('excludes weekends from count', () => {
      // Friday to Monday = 0 elapsed workdays
      const friday = new Date('2026-05-08T17:00:00Z');
      const monday = new Date('2026-05-11T09:00:00Z');
      expect(processor.countWorkdays(friday, monday)).toBe(0);
    });

    it('returns 0 when end is before or equal to start', () => {
      const date = new Date('2026-05-08T10:00:00Z');
      expect(processor.countWorkdays(date, date)).toBe(0);
      expect(processor.countWorkdays(date, new Date('2026-05-07T10:00:00Z'))).toBe(0);
    });

    it('treats Friday evening to Monday morning as 0 elapsed workdays', () => {
      const fridayEvening = new Date('2026-05-08T21:00:00Z');
      const mondayMorning = new Date('2026-05-11T08:00:00Z');
      expect(processor.countWorkdays(fridayEvening, mondayMorning)).toBe(0);
    });

    it('flags thread inactive since Friday when checked on Wednesday (2 workdays passed)', () => {
      const fridayEvening = new Date('2026-05-08T21:00:00Z');
      const wednesday = new Date('2026-05-13T10:00:00Z');
      expect(processor.countWorkdays(fridayEvening, wednesday)).toBe(2);
    });
  });

  describe('parseSlackTs', () => {
    it('parses valid Slack timestamp to Date', () => {
      const result = processor.parseSlackTs('1714500000.000000');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getTime()).toBe(1714500000000);
    });

    it('returns null for null input', () => {
      expect(processor.parseSlackTs(null)).toBeNull();
    });

    it('returns null for invalid timestamp', () => {
      expect(processor.parseSlackTs('not-a-number')).toBeNull();
    });
  });

  describe('extractAssignee', () => {
    it('extracts @mention from action text', () => {
      const result = processor.extractAssignee(
        'Update docs for @alice',
        ['alice', 'bob'],
      );
      expect(result).toBe('alice');
    });

    it('extracts "assigned to" pattern', () => {
      const result = processor.extractAssignee(
        'This task is assigned to Bob for review',
        ['alice', 'bob'],
      );
      expect(result).toBe('Bob');
    });

    it('matches participant name in action text', () => {
      const result = processor.extractAssignee(
        'Bob needs to fix the deployment pipeline',
        ['alice', 'bob'],
      );
      expect(result).toBe('bob');
    });

    it('returns null when no assignee found', () => {
      const result = processor.extractAssignee(
        'Fix the deployment pipeline',
        ['alice', 'bob'],
      );
      expect(result).toBeNull();
    });
  });
});
