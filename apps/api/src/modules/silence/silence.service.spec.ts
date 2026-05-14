import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import { SilenceService } from './silence.service.js';

function createMockThread(overrides: Partial<{
  id: string;
  latestReplyTs: string | null;
  threadTs: string;
  messageCount: number;
  participantIds: string[];
  topicName: string;
  workstreamId: string | null;
}> = {}) {
  return {
    threadId: overrides.id ?? 'thread-1',
    latestReplyTs: overrides.latestReplyTs ?? null,
    threadTs: overrides.threadTs ?? '1700000000.000000',
    messageCount: overrides.messageCount ?? 5,
    participantIds: overrides.participantIds ?? ['user-a', 'user-b', 'user-c'],
    topicName: overrides.topicName ?? 'deployment-discussion',
    workstreamId: overrides.workstreamId ?? 'ws-1',
  };
}

describe('SilenceService', () => {
  let service: SilenceService;
  let mockDb: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  let selectChain: {
    from: ReturnType<typeof vi.fn>;
  };
  let fromChain: {
    innerJoin: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
  };
  let joinChain: {
    where: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    joinChain = {
      where: vi.fn().mockResolvedValue([]),
    };
    fromChain = {
      innerJoin: vi.fn().mockReturnValue(joinChain),
      where: vi.fn().mockResolvedValue([]),
    };
    selectChain = {
      from: vi.fn().mockReturnValue(fromChain),
    };

    mockDb = {
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'alert-1' }]),
          }),
          returning: vi.fn().mockResolvedValue([{ id: 'alert-1' }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        SilenceService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get(SilenceService);
  });

  describe('deriveLastActivityAt', () => {
    it('should use latestReplyTs when available', () => {
      const result = service.deriveLastActivityAt('1700100000.000000', '1700000000.000000');
      expect(result.getTime()).toBe(1700100000000);
    });

    it('should fall back to threadTs when latestReplyTs is null', () => {
      const result = service.deriveLastActivityAt(null, '1700000000.000000');
      expect(result.getTime()).toBe(1700000000000);
    });
  });

  describe('countWorkdays', () => {
    it('should count only weekdays between two dates', () => {
      // Monday May 5, 2025 to Friday May 9, 2025 = 4 workdays
      const from = new Date('2025-05-05T00:00:00Z');
      const to = new Date('2025-05-09T00:00:00Z');
      expect(service.countWorkdays(from, to)).toBe(4);
    });

    it('should skip weekends', () => {
      // Friday May 9, 2025 to Monday May 12, 2025 = 1 workday (Monday)
      const from = new Date('2025-05-09T00:00:00Z');
      const to = new Date('2025-05-12T00:00:00Z');
      expect(service.countWorkdays(from, to)).toBe(1);
    });

    it('should return 0 when from equals to', () => {
      const date = new Date('2025-05-05T00:00:00Z');
      expect(service.countWorkdays(date, date)).toBe(0);
    });

    it('should return 0 when to is before from', () => {
      const from = new Date('2025-05-09T00:00:00Z');
      const to = new Date('2025-05-05T00:00:00Z');
      expect(service.countWorkdays(from, to)).toBe(0);
    });

    it('should count a full work week as 5 days', () => {
      // Monday May 5 to Monday May 12 = 5 workdays
      const from = new Date('2025-05-05T00:00:00Z');
      const to = new Date('2025-05-12T00:00:00Z');
      expect(service.countWorkdays(from, to)).toBe(5);
    });

    it('should count two full work weeks as 10 days', () => {
      // Monday May 5 to Monday May 19 = 10 workdays
      const from = new Date('2025-05-05T00:00:00Z');
      const to = new Date('2025-05-19T00:00:00Z');
      expect(service.countWorkdays(from, to)).toBe(10);
    });

    it('should handle same-day with different times as 0 workdays', () => {
      const from = new Date('2025-05-05T08:00:00Z');
      const to = new Date('2025-05-05T17:00:00Z');
      expect(service.countWorkdays(from, to)).toBe(0);
    });
  });

  describe('findSilenceCandidates', () => {
    it('should return candidates that exceed the silence threshold', async () => {
      const oldTs = String((Date.now() / 1000) - 30 * 86400); // 30 days ago
      const row = createMockThread({ latestReplyTs: oldTs, threadTs: oldTs });

      joinChain.where.mockResolvedValue([row]);

      const candidates = await service.findSilenceCandidates();
      expect(candidates.length).toBe(1);
      expect(candidates[0]!.threadId).toBe('thread-1');
      expect(candidates[0]!.topicName).toBe('deployment-discussion');
    });

    it('should exclude threads with recent activity', async () => {
      const recentTs = String(Date.now() / 1000); // just now
      const row = createMockThread({ latestReplyTs: recentTs, threadTs: recentTs });

      joinChain.where.mockResolvedValue([row]);

      const candidates = await service.findSilenceCandidates();
      expect(candidates.length).toBe(0);
    });

    it('should use threadTs as fallback when latestReplyTs is null', async () => {
      const oldTs = String((Date.now() / 1000) - 30 * 86400);
      const row = createMockThread({ latestReplyTs: null, threadTs: oldTs });

      joinChain.where.mockResolvedValue([row]);

      const candidates = await service.findSilenceCandidates();
      expect(candidates.length).toBe(1);
    });
  });

  describe('upsertActiveAlert', () => {
    it('should create a new alert when none exists for the thread', async () => {
      // First select (check existing) returns empty
      fromChain.where.mockResolvedValueOnce([]);

      const candidate = {
        threadId: 'thread-1',
        lastActivityAt: new Date('2025-04-01T00:00:00Z'),
        messageCount: 5,
        participantCount: 3,
        topicName: 'deployment-discussion',
        workstreamId: 'ws-1',
      };

      // Mock the select chain for the existence check
      const limitMock = vi.fn().mockResolvedValue([]);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      const created = await service.upsertActiveAlert(candidate);
      expect(created).toBe(true);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should update existing alert and return false', async () => {
      const candidate = {
        threadId: 'thread-1',
        lastActivityAt: new Date('2025-04-01T00:00:00Z'),
        messageCount: 5,
        participantCount: 3,
        topicName: 'deployment-discussion',
        workstreamId: 'ws-1',
      };

      // Mock the select chain for the existence check — returns existing alert
      const limitMock = vi.fn().mockResolvedValue([{ id: 'existing-alert-1' }]);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
      const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
      mockDb.update.mockReturnValue({ set: mockUpdateSet });

      const created = await service.upsertActiveAlert(candidate);
      expect(created).toBe(false);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('resolveAlertsForThreads', () => {
    it('should resolve active alerts for given thread IDs', async () => {
      const mockReturning = vi.fn().mockResolvedValue([{ id: 'alert-1' }, { id: 'alert-2' }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockDb.update.mockReturnValue({ set: mockSet });

      const resolved = await service.resolveAlertsForThreads(['thread-1', 'thread-2']);
      expect(resolved).toBe(2);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should return 0 when no thread IDs provided', async () => {
      const resolved = await service.resolveAlertsForThreads([]);
      expect(resolved).toBe(0);
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should return 0 when no active alerts match', async () => {
      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockDb.update.mockReturnValue({ set: mockSet });

      const resolved = await service.resolveAlertsForThreads(['thread-no-alert']);
      expect(resolved).toBe(0);
    });
  });

  describe('runDetection', () => {
    it('should return a detection summary with counts', async () => {
      // Mock findSilenceCandidates — no candidates
      joinChain.where.mockResolvedValue([]);
      // Mock resolveAlertsForActiveThreads — no active alerts
      fromChain.where.mockResolvedValue([]);

      const summary = await service.runDetection();
      expect(summary).toHaveProperty('threadsScanned');
      expect(summary).toHaveProperty('alertsCreated');
      expect(summary).toHaveProperty('alertsResolved');
      expect(summary).toHaveProperty('durationMs');
      expect(summary.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
