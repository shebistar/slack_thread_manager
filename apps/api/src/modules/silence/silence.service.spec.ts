import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
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
    delete: ReturnType<typeof vi.fn>;
    query: {
      silenceThresholds: {
        findFirst: ReturnType<typeof vi.fn>;
      };
    };
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
      query: {
        silenceThresholds: {
          findFirst: vi.fn().mockResolvedValue({ thresholdDays: 3, id: 'global-threshold' }),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'alert-1' }]),
          }),
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
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        SilenceService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockImplementation((key: string, fallback?: string) => {
              if (key === 'PROJECT_TIMEZONE') return 'Europe/Berlin';
              if (key === 'SLACK_TEAM_ID') return 'T-MOCK-TEAM';
              return fallback;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(SilenceService);
  });

  describe('deriveLastActivityAt', () => {
    it('should use latestReplyTs when available', () => {
      const result = service.deriveLastActivityAt('1700100000.000000', '1700000000.000000');
      expect(result?.getTime()).toBe(1700100000000);
    });

    it('should fall back to threadTs when latestReplyTs is null', () => {
      const result = service.deriveLastActivityAt(null, '1700000000.000000');
      expect(result?.getTime()).toBe(1700000000000);
    });

    it('should return null when both timestamps are invalid', () => {
      const result = service.deriveLastActivityAt('', 'not-a-timestamp');
      expect(result).toBeNull();
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

    it('should count exactly 1 workday from Friday evening to Monday morning (AC2: not flagged)', () => {
      const from = new Date('2025-05-09T17:00:00Z'); // Friday
      const to = new Date('2025-05-12T09:00:00Z'); // Monday
      expect(service.countWorkdays(from, to)).toBe(1);
    });

    it('should count exactly 4 workdays from Friday to Thursday (AC3: flagged at threshold 3)', () => {
      const from = new Date('2025-05-09T17:00:00Z'); // Friday
      const to = new Date('2025-05-15T09:00:00Z'); // Thursday
      expect(service.countWorkdays(from, to)).toBe(4);
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
      const candidate = {
        threadId: 'thread-1',
        lastActivityAt: new Date('2025-04-01T00:00:00Z'),
        messageCount: 5,
        participantCount: 3,
        topicName: 'deployment-discussion',
        workstreamId: 'ws-1',
      };

      const mockReturning = vi.fn().mockResolvedValue([{ id: 'new-alert-id' }]);
      const mockOnConflictDoNothing = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
      mockDb.insert.mockReturnValue({ values: mockValues });

      const created = await service.upsertActiveAlert(candidate);
      expect(created).toBe(true);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
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

      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockOnConflictDoNothing = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
      mockDb.insert.mockReturnValue({ values: mockValues });

      const mockUpdateReturning = vi.fn().mockResolvedValue([{ id: 'existing-alert-1' }]);
      const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning });
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

  describe('resolveThresholdDays', () => {
    it('should prefer workstream-specific threshold over global default', async () => {
      mockDb.query.silenceThresholds.findFirst
        .mockResolvedValueOnce({ thresholdDays: 5 })
        .mockResolvedValueOnce({ thresholdDays: 3 });

      const threshold = await service['resolveThresholdDays']('ws-1');
      expect(threshold).toBe(5);
    });

    it('should fall back to global threshold when workstream threshold missing', async () => {
      mockDb.query.silenceThresholds.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ thresholdDays: 4 });

      const threshold = await service['resolveThresholdDays']('ws-missing');
      expect(threshold).toBe(4);
    });

    it('should fall back to constant 3 when DB has no thresholds', async () => {
      mockDb.query.silenceThresholds.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const threshold = await service['resolveThresholdDays']('ws-none');
      expect(threshold).toBe(3);
    });
  });

  describe('threshold CRUD methods', () => {
    it('returns global + overrides in threshold configuration', async () => {
      const rows = [
        {
          id: '2d07c9f3-82d0-4efd-9227-a8cf9cb46de7',
          workstreamId: null,
          thresholdDays: 3,
          updatedAt: new Date('2026-05-15T07:00:00.000Z'),
          workstreamName: null,
        },
        {
          id: '3ca91ceb-b793-422f-bcfd-a5b398fe0ce4',
          workstreamId: 'a1f6d0bc-5699-4dc9-8138-949ab1d44a10',
          thresholdDays: 5,
          updatedAt: new Date('2026-05-15T07:00:00.000Z'),
          workstreamName: 'Infrastructure',
        },
      ];
      const orderBy = vi.fn().mockResolvedValue(rows);
      const leftJoin = vi.fn().mockReturnValue({ orderBy });
      const from = vi.fn().mockReturnValue({ leftJoin });
      mockDb.select.mockReturnValueOnce({ from });

      const result = await service.getThresholdConfiguration();

      expect(result.global.thresholdDays).toBe(3);
      expect(result.overrides).toHaveLength(1);
      expect(result.overrides[0]?.workstreamName).toBe('Infrastructure');
    });

    it('updates global threshold value', async () => {
      const updatedAt = new Date('2026-05-15T07:00:00.000Z');
      const updateWhere = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: '2d07c9f3-82d0-4efd-9227-a8cf9cb46de7',
            workstreamId: null,
            thresholdDays: 2,
            updatedAt,
          },
        ]),
      });
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      mockDb.update.mockReturnValueOnce({ set: updateSet });

      const result = await service.updateGlobalThreshold(2);
      expect(result.thresholdDays).toBe(2);
    });

    it('throws NotFoundException when workstream override targets unknown workstream', async () => {
      const selectWhere = vi.fn().mockResolvedValue([]);
      const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
      mockDb.select.mockReturnValueOnce({ from: selectFrom });

      await expect(
        service.upsertWorkstreamThreshold('missing-workstream', 5),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('removes workstream threshold override without throwing when missing', async () => {
      const deleteWhere = vi.fn().mockResolvedValue([]);
      mockDb.delete.mockReturnValueOnce({ where: deleteWhere });

      await expect(
        service.removeWorkstreamThreshold('a1f6d0bc-5699-4dc9-8138-949ab1d44a10'),
      ).resolves.toBeUndefined();
    });
  });

  describe('getActiveAlerts', () => {
    it('should return alerts joined with workstream names and Slack URLs', async () => {
      const rows = [
        {
          id: 'alert-1',
          threadId: 'thread-1',
          workstreamId: 'ws-1',
          topicName: 'Firewall migration',
          lastActivityAt: new Date('2026-05-10T10:00:00.000Z'),
          silenceDays: 5,
          participantCount: 3,
          status: 'active' as const,
          detectedAt: new Date('2026-05-15T07:30:00.000Z'),
          workstreamName: 'Infrastructure',
          channelSlackId: 'C456',
          threadTs: '1234567890.000000',
        },
      ];

      const orderBy = vi.fn().mockResolvedValue(rows);
      const where = vi.fn().mockReturnValue({ orderBy });
      const leftJoin = vi.fn().mockReturnValue({ where });
      const innerJoin2 = vi.fn().mockReturnValue({ leftJoin });
      const innerJoin1 = vi.fn().mockReturnValue({ innerJoin: innerJoin2 });
      const from = vi.fn().mockReturnValue({ innerJoin: innerJoin1 });
      mockDb.select.mockReturnValueOnce({ from });

      const result = await service.getActiveAlerts();

      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0]!.topicName).toBe('Firewall migration');
      expect(result.alerts[0]!.workstreamName).toBe('Infrastructure');
      expect(result.alerts[0]!.silenceDays).toBe(5);
      expect(result.alerts[0]!.sourceThreadUrl).toContain('T-MOCK-TEAM');
      expect(result.alerts[0]!.sourceThreadUrl).toContain('C456');
    });

    it('should return empty alerts when no active alerts exist', async () => {
      const orderBy = vi.fn().mockResolvedValue([]);
      const where = vi.fn().mockReturnValue({ orderBy });
      const leftJoin = vi.fn().mockReturnValue({ where });
      const innerJoin2 = vi.fn().mockReturnValue({ leftJoin });
      const innerJoin1 = vi.fn().mockReturnValue({ innerJoin: innerJoin2 });
      const from = vi.fn().mockReturnValue({ innerJoin: innerJoin1 });
      mockDb.select.mockReturnValueOnce({ from });

      const result = await service.getActiveAlerts();

      expect(result.alerts).toHaveLength(0);
    });

    it('should return null sourceThreadUrl when SLACK_TEAM_ID is absent', async () => {
      const moduleNoTeam = await Test.createTestingModule({
        providers: [
          SilenceService,
          { provide: DATABASE_TOKEN, useValue: mockDb },
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn().mockImplementation((key: string, fallback?: string) => {
                if (key === 'PROJECT_TIMEZONE') return 'Europe/Berlin';
                if (key === 'SLACK_TEAM_ID') return undefined;
                return fallback;
              }),
            },
          },
        ],
      }).compile();

      const serviceNoTeam = moduleNoTeam.get(SilenceService);

      const rows = [
        {
          id: 'alert-1',
          threadId: 'thread-1',
          workstreamId: null,
          topicName: 'Test topic',
          lastActivityAt: new Date('2026-05-10T10:00:00.000Z'),
          silenceDays: 3,
          participantCount: 2,
          status: 'active' as const,
          detectedAt: new Date('2026-05-15T07:30:00.000Z'),
          workstreamName: null,
          channelSlackId: 'C789',
          threadTs: '1234567890.000000',
        },
      ];

      const orderBy = vi.fn().mockResolvedValue(rows);
      const where = vi.fn().mockReturnValue({ orderBy });
      const leftJoin = vi.fn().mockReturnValue({ where });
      const innerJoin2 = vi.fn().mockReturnValue({ leftJoin });
      const innerJoin1 = vi.fn().mockReturnValue({ innerJoin: innerJoin2 });
      const from = vi.fn().mockReturnValue({ innerJoin: innerJoin1 });
      mockDb.select.mockReturnValueOnce({ from });

      const result = await serviceNoTeam.getActiveAlerts();

      expect(result.alerts[0]!.sourceThreadUrl).toBeNull();
    });
  });

  describe('dismissAlert', () => {
    it('should transition alert status to dismissed', async () => {
      const mockReturning = vi.fn().mockResolvedValue([{ id: 'alert-1' }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockDb.update.mockReturnValueOnce({ set: mockSet });

      await expect(service.dismissAlert('alert-1')).resolves.toBeUndefined();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent alert ID', async () => {
      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockDb.update.mockReturnValueOnce({ set: mockSet });

      await expect(service.dismissAlert('non-existent-id')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should throw NotFoundException for already-dismissed alert', async () => {
      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockDb.update.mockReturnValueOnce({ set: mockSet });

      await expect(service.dismissAlert('dismissed-alert-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
