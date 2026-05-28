import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import { BriefingsService } from './briefings.service.js';
import { PipelineStateService } from '../pipeline/pipeline-state.service.js';

type UserRole = 'ARCHITECT' | 'PM' | 'CONSULTANT' | 'SALES' | 'TRAINING' | 'ADMIN';
type ItemType = 'standard' | 'cross_workstream' | 'orphaned_action' | 'gone_quiet' | 'backfill';

function createMockUser(overrides: Partial<{ id: string; role: UserRole; email: string; displayName: string; slackHandle: string }> = {}) {
  return {
    id: overrides.id ?? 'user-1',
    email: overrides.email ?? 'test@example.com',
    displayName: overrides.displayName ?? 'Test User',
    slackHandle: overrides.slackHandle ?? '@test',
    slackNicknames: [] as string[],
    role: overrides.role ?? ('PM' as UserRole),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockThread(overrides: Partial<{
  threadId: string;
  workstreamId: string | null;
  workstreamName: string | null;
  itemType: ItemType;
}> = {}) {
  return {
    threadId: overrides.threadId ?? 'thread-1',
    threadTs: '1700000000.000100',
    channelSlackId: 'C01ABC',
    headline: 'Test Topic',
    technicalSummary: { text: 'Technical details about the topic' } as unknown,
    plainSummary: { text: 'Simple summary of the topic' } as unknown,
    workstreamName: overrides.workstreamName ?? 'Engineering',
    workstreamId: overrides.workstreamId ?? 'ws-1',
    itemType: overrides.itemType ?? ('standard' as ItemType),
  };
}

describe('BriefingsService', () => {
  let service: BriefingsService;
  let mockDb: Record<string, any>;
  let mockPipelineStateService: { transitionState: ReturnType<typeof vi.fn> };
  let mockConfigService: { get: ReturnType<typeof vi.fn> };

  let mockSelectFrom: ReturnType<typeof vi.fn>;
  let mockSelectInnerJoin: ReturnType<typeof vi.fn>;
  let mockSelectLeftJoin: ReturnType<typeof vi.fn>;
  let mockSelectWhere: ReturnType<typeof vi.fn>;
  let mockSelectOrderBy: ReturnType<typeof vi.fn>;
  let mockSelectLimit: ReturnType<typeof vi.fn>;
  let mockInsertValues: ReturnType<typeof vi.fn>;
  let mockInsertReturning: ReturnType<typeof vi.fn>;

  let selectCallCount: number;
  let selectResults: unknown[][];

  beforeEach(async () => {
    selectCallCount = 0;
    selectResults = [];

    mockSelectLimit = vi.fn().mockImplementation(() => selectResults[selectCallCount - 1] ?? []);
    mockSelectOrderBy = vi.fn().mockReturnValue({ limit: mockSelectLimit });
    mockSelectWhere = vi.fn().mockImplementation(() => {
      const result = selectResults[selectCallCount - 1] ?? [];
      return Object.assign(result, { orderBy: mockSelectOrderBy, limit: mockSelectLimit });
    });
    mockSelectLeftJoin = vi.fn().mockReturnValue({ where: mockSelectWhere });
    mockSelectInnerJoin = vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({ leftJoin: mockSelectLeftJoin }),
      leftJoin: mockSelectLeftJoin,
      where: mockSelectWhere,
    });
    mockSelectFrom = vi.fn().mockImplementation(() => {
      selectCallCount++;
      return {
        innerJoin: mockSelectInnerJoin,
        leftJoin: mockSelectLeftJoin,
        where: mockSelectWhere,
        orderBy: mockSelectOrderBy,
      };
    });

    mockInsertReturning = vi.fn().mockResolvedValue([{ id: 'briefing-1' }]);
    mockInsertValues = vi.fn().mockReturnValue({ returning: mockInsertReturning, then: (resolve: any) => resolve() });

    mockDb = {
      select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
      insert: vi.fn().mockReturnValue({ values: mockInsertValues }),
    };

    mockPipelineStateService = {
      transitionState: vi.fn().mockResolvedValue({}),
    };

    mockConfigService = {
      get: vi.fn().mockReturnValue('T12345'),
    };

    const module = await Test.createTestingModule({
      providers: [
        BriefingsService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
        { provide: PipelineStateService, useValue: mockPipelineStateService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(BriefingsService);
  });

  describe('mapRoleToBriefingShape', () => {
    it('should map PM to filtered_brief', () => {
      expect(service.mapRoleToBriefingShape('PM')).toBe('filtered_brief');
    });

    it('should map SALES to executive_scan', () => {
      expect(service.mapRoleToBriefingShape('SALES')).toBe('executive_scan');
    });

    it('should map TRAINING to executive_scan', () => {
      expect(service.mapRoleToBriefingShape('TRAINING')).toBe('executive_scan');
    });

    it('should map ARCHITECT to intelligence_report', () => {
      expect(service.mapRoleToBriefingShape('ARCHITECT')).toBe('intelligence_report');
    });

    it('should map CONSULTANT to intelligence_report', () => {
      expect(service.mapRoleToBriefingShape('CONSULTANT')).toBe('intelligence_report');
    });

    it('should map ADMIN to executive_scan', () => {
      expect(service.mapRoleToBriefingShape('ADMIN')).toBe('executive_scan');
    });

    it('should default unknown roles to executive_scan', () => {
      expect(service.mapRoleToBriefingShape('UNKNOWN')).toBe('executive_scan');
    });
  });

  describe('buildBriefingItems', () => {
    const pmUser = createMockUser({ role: 'PM' });
    const architectUser = createMockUser({ id: 'user-arch', role: 'ARCHITECT' });
    const salesUser = createMockUser({ id: 'user-sales', role: 'SALES' });

    it('should use plain summary for non-intelligence_report shapes', async () => {
      const threads = [createMockThread()];

      mockSelectWhere.mockResolvedValueOnce([{ workstreamId: 'ws-1' }]);

      const items = await service.buildBriefingItems(threads, 'filtered_brief', pmUser);

      expect(items[0]!.summaryText).toBe('Simple summary of the topic');
    });

    it('should use technical summary for intelligence_report shape', async () => {
      const threads = [createMockThread()];

      const items = await service.buildBriefingItems(threads, 'intelligence_report', architectUser);

      expect(items[0]!.summaryText).toBe('Technical details about the topic');
    });

    it('should filter threads by user workstreams for filtered_brief', async () => {
      const threads = [
        createMockThread({ threadId: 'thread-1', workstreamId: 'ws-1', workstreamName: 'Engineering' }),
        createMockThread({ threadId: 'thread-2', workstreamId: 'ws-2', workstreamName: 'Sales' }),
      ];

      mockSelectWhere.mockResolvedValueOnce([{ workstreamId: 'ws-1' }]);

      const items = await service.buildBriefingItems(threads, 'filtered_brief', pmUser);

      expect(items).toHaveLength(1);
      expect(items[0]!.threadId).toBe('thread-1');
    });

    it('should include all threads for executive_scan', async () => {
      const threads = [
        createMockThread({ threadId: 'thread-1', workstreamId: 'ws-1' }),
        createMockThread({ threadId: 'thread-2', workstreamId: 'ws-2' }),
      ];

      const items = await service.buildBriefingItems(threads, 'executive_scan', salesUser);

      expect(items).toHaveLength(2);
    });

    it('should sort by item type priority: cross_workstream first', async () => {
      const threads = [
        createMockThread({ threadId: 'thread-1', itemType: 'standard' }),
        createMockThread({ threadId: 'thread-2', itemType: 'cross_workstream' }),
        createMockThread({ threadId: 'thread-3', itemType: 'orphaned_action' }),
      ];

      const items = await service.buildBriefingItems(threads, 'executive_scan', salesUser);

      expect(items[0]!.itemType).toBe('cross_workstream');
      expect(items[1]!.itemType).toBe('orphaned_action');
      expect(items[2]!.itemType).toBe('standard');
    });

    it('should build Slack permalink when SLACK_TEAM_ID is set', async () => {
      const threads = [createMockThread()];

      const items = await service.buildBriefingItems(threads, 'executive_scan', salesUser);

      expect(items[0]!.sourceThreadUrl).toBe(
        'https://app.slack.com/client/T12345/C01ABC/thread/C01ABC-1700000000000100',
      );
    });

    it('should return null permalink when SLACK_TEAM_ID is not set', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      const threads = [createMockThread()];

      const items = await service.buildBriefingItems(threads, 'executive_scan', salesUser);

      expect(items[0]!.sourceThreadUrl).toBeNull();
    });

    it('should handle string summaries directly', async () => {
      const threads = [createMockThread()];
      threads[0]!.plainSummary = 'A plain string summary';

      const items = await service.buildBriefingItems(threads, 'executive_scan', salesUser);

      expect(items[0]!.summaryText).toBe('A plain string summary');
    });

    it('should handle null summaries gracefully', async () => {
      const threads = [createMockThread()];
      threads[0]!.plainSummary = null;

      const items = await service.buildBriefingItems(threads, 'executive_scan', salesUser);

      expect(items[0]!.summaryText).toBe('');
    });
  });

  describe('generateBriefingForUser', () => {
    it('should skip if briefing already exists for user + date', async () => {
      selectResults = [[{ id: 'existing-briefing' }]];

      const user = createMockUser();
      const threads = [createMockThread()];
      const result = await service.generateBriefingForUser(user, threads, new Date('2026-05-11'));

      expect(result).toBeNull();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should create briefing and items when no duplicate exists', async () => {
      selectResults = [
        [],
        [{ workstreamId: 'ws-1' }],
        [{ id: 'prior-briefing' }],
      ];

      mockInsertValues.mockReturnValueOnce({
        returning: vi.fn().mockResolvedValue([{
          id: 'briefing-new',
          userId: 'user-1',
          briefingDate: new Date('2026-05-11'),
          briefingShape: 'filtered_brief',
          generatedAt: new Date(),
          threadCount: 1,
          workstreamCount: 1,
        }]),
      }).mockReturnValueOnce({
        then: (resolve: any) => resolve(),
      });

      const user = createMockUser();
      const threads = [createMockThread()];
      const result = await service.generateBriefingForUser(user, threads, new Date('2026-05-11'));

      expect(result).toEqual({ itemCount: 1 });
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('getTodayBriefing', () => {
    it('should return briefing with items when one exists for today', async () => {
      const resolvedUser = { id: 'user-1' };
      const mockBriefing = {
        id: 'briefing-1',
        userId: 'user-1',
        briefingDate: new Date(),
        briefingShape: 'executive_scan' as const,
        generatedAt: new Date(),
        threadCount: 3,
        workstreamCount: 2,
      };
      const mockItems = [
        {
          id: 'item-1',
          briefingId: 'briefing-1',
          threadId: 'thread-1',
          headline: 'Test headline',
          summaryText: 'Test summary',
          workstreamName: 'Engineering',
          sourceThreadUrl: null,
          itemType: 'standard' as const,
          sortOrder: 0,
        },
      ];

      mockSelectFrom
        .mockImplementationOnce(() => {
          selectCallCount++;
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([resolvedUser]),
            }),
          };
        })
        .mockImplementationOnce(() => {
          selectCallCount++;
          return {
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([mockBriefing]),
              }),
            }),
          };
        })
        .mockImplementationOnce(() => {
          selectCallCount++;
          return {
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue(mockItems),
              }),
            }),
          };
        });

      const result = await service.getTodayBriefing('user-1', 'test@example.com');

      expect(result).not.toBeNull();
      expect(result!.briefing).toEqual(mockBriefing);
      expect(result!.items).toEqual(mockItems);
    });

    it('should return null when no briefing exists for today', async () => {
      mockSelectFrom
        .mockImplementationOnce(() => {
          selectCallCount++;
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          };
        })
        .mockImplementationOnce(() => {
          selectCallCount++;
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
            }),
          };
        })
        .mockImplementationOnce(() => {
          selectCallCount++;
          return {
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          };
        });

      const result = await service.getTodayBriefing('user-1', 'test@example.com');

      expect(result).toBeNull();
    });
  });

  describe('generateBriefingsForAllUsers', () => {
    it('should return zeros when no users exist', async () => {
      const fromMock = mockSelectFrom;
      fromMock.mockImplementationOnce(() => {
        selectCallCount++;
        return Promise.resolve([]);
      });

      const result = await service.generateBriefingsForAllUsers();

      expect(result).toEqual({ usersProcessed: 0, briefingsGenerated: 0, itemsGenerated: 0 });
    });

    it('should return zeros when no approved threads exist', async () => {
      const fromMock = mockSelectFrom;

      fromMock
        .mockImplementationOnce(() => {
          selectCallCount++;
          return Promise.resolve([createMockUser()]);
        })
        .mockImplementationOnce(() => {
          selectCallCount++;
          return {
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ generatedAt: new Date('2026-05-10') }]),
            }),
          };
        });

      const getApprovedSpy = vi.spyOn(service, 'getApprovedThreadsSince');
      getApprovedSpy.mockResolvedValueOnce([]);

      const result = await service.generateBriefingsForAllUsers();

      expect(result.usersProcessed).toBe(1);
      expect(result.briefingsGenerated).toBe(0);
    });

    it('should isolate per-user errors — one failure does not block others', async () => {
      const user1 = createMockUser({ id: 'user-1', role: 'SALES' });
      const user2 = createMockUser({ id: 'user-2', role: 'ARCHITECT' });
      const user3 = createMockUser({ id: 'user-3', role: 'TRAINING' });
      const thread = createMockThread();

      const fromMock = mockSelectFrom;
      fromMock
        .mockImplementationOnce(() => {
          selectCallCount++;
          return Promise.resolve([user1, user2, user3]);
        })
        .mockImplementationOnce(() => {
          selectCallCount++;
          return {
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          };
        });

      const getApprovedSpy = vi.spyOn(service, 'getApprovedThreadsSince');
      getApprovedSpy.mockResolvedValueOnce([thread]);

      const genSpy = vi.spyOn(service, 'generateBriefingForUser');
      genSpy
        .mockResolvedValueOnce({ itemCount: 2 })
        .mockRejectedValueOnce(new Error('User 2 DB error'))
        .mockResolvedValueOnce({ itemCount: 3 });

      const result = await service.generateBriefingsForAllUsers();

      expect(genSpy).toHaveBeenCalledTimes(3);
      expect(result.briefingsGenerated).toBe(2);
      expect(result.itemsGenerated).toBe(5);
    });
  });

  describe('markItemAsRead', () => {
    it('should insert a read record and return the result', async () => {
      const readAt = new Date('2026-05-12T08:00:00Z');

      mockSelectFrom.mockImplementationOnce(() => {
        selectCallCount++;
        return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: 'item-1' }]) }) };
      });
      const mockReturning = vi.fn().mockResolvedValue([{ readAt }]);
      const mockOnConflictDoNothing = vi.fn().mockReturnValue({ returning: mockReturning });
      mockInsertValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });

      const result = await service.markItemAsRead('user-1', 'item-1');

      expect(result.briefingItemId).toBe('item-1');
      expect(result.readAt).toEqual(readAt);
      expect(mockOnConflictDoNothing).toHaveBeenCalled();
    });

    it('should return existing read record if already marked (idempotent)', async () => {
      const existingReadAt = new Date('2026-05-11T10:00:00Z');

      mockSelectFrom.mockImplementationOnce(() => {
        selectCallCount++;
        return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: 'item-1' }]) }) };
      });
      mockSelectFrom.mockImplementationOnce(() => {
        selectCallCount++;
        return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ readAt: existingReadAt }]) }) };
      });
      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockOnConflictDoNothing = vi.fn().mockReturnValue({ returning: mockReturning });
      mockInsertValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });

      const result = await service.markItemAsRead('user-1', 'item-1');

      expect(result.briefingItemId).toBe('item-1');
      expect(result.readAt).toEqual(existingReadAt);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent item', async () => {
      mockSelectFrom.mockImplementationOnce(() => {
        selectCallCount++;
        return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) };
      });

      await expect(service.markItemAsRead('user-1', 'nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('getBriefingById', () => {
    it('returns briefing with items and readItemIds when found', async () => {
      const briefing = {
        id: 'briefing-1',
        userId: 'user-1',
        briefingDate: new Date('2026-05-12T00:00:00.000Z'),
        briefingShape: 'filtered_brief',
        generatedAt: new Date('2026-05-12T04:00:00.000Z'),
        threadCount: 2,
        workstreamCount: 1,
      };
      const items = [
        {
          id: 'item-1',
          briefingId: 'briefing-1',
          threadId: 'thread-1',
          headline: 'Headline',
          summaryText: 'Summary',
          workstreamName: 'Platform',
          sourceThreadUrl: null,
          itemType: 'standard',
          sortOrder: 0,
          latestActivityAt: null,
          messageCount: null,
          participantCount: 0,
        },
      ];

      mockSelectFrom.mockImplementationOnce(() => {
        selectCallCount++;
        return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([briefing]) }) };
      });
      mockSelectFrom.mockImplementationOnce(() => {
        selectCallCount++;
        return {
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(items),
            }),
          }),
        };
      });
      vi.spyOn(service, 'getReadItemIds').mockResolvedValueOnce(['item-1']);

      const result = await service.getBriefingById('user-1', 'briefing-1');

      expect(result).toEqual({
        briefing,
        items,
        readItemIds: ['item-1'],
      });
    });

    it('returns null when briefing does not exist or belongs to different user', async () => {
      mockSelectFrom.mockImplementationOnce(() => {
        selectCallCount++;
        return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) };
      });

      const result = await service.getBriefingById('user-1', 'briefing-1');

      expect(result).toBeNull();
    });
  });

  describe('getBriefingHistory', () => {
    it('returns metadata list ordered by date desc', async () => {
      const rows = [
        {
          id: 'briefing-2',
          briefingDate: new Date('2026-05-12T00:00:00.000Z'),
          briefingShape: 'filtered_brief',
          threadCount: 4,
          workstreamCount: 2,
          generatedAt: new Date('2026-05-12T04:00:00.000Z'),
        },
        {
          id: 'briefing-1',
          briefingDate: new Date('2026-05-11T00:00:00.000Z'),
          briefingShape: 'filtered_brief',
          threadCount: 3,
          workstreamCount: 2,
          generatedAt: new Date('2026-05-11T04:00:00.000Z'),
        },
      ];

      mockSelectFrom.mockImplementationOnce(() => {
        selectCallCount++;
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(rows),
          }),
        };
      });

      const result = await service.getBriefingHistory('user-1', 7);

      expect(result).toEqual(rows);
    });

    it('returns empty array when no history exists', async () => {
      mockSelectFrom.mockImplementationOnce(() => {
        selectCallCount++;
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        };
      });

      const result = await service.getBriefingHistory('user-1', 7);

      expect(result).toEqual([]);
    });
  });

  describe('getReadItemIds', () => {
    it('should return read item IDs for a given briefing', async () => {
      mockSelectFrom.mockImplementationOnce(() => {
        selectCallCount++;
        return { where: vi.fn().mockResolvedValue([{ id: 'item-1' }, { id: 'item-2' }, { id: 'item-3' }]) };
      });
      mockSelectFrom.mockImplementationOnce(() => {
        selectCallCount++;
        return { where: vi.fn().mockResolvedValue([{ briefingItemId: 'item-1' }, { briefingItemId: 'item-3' }]) };
      });

      const result = await service.getReadItemIds('user-1', 'briefing-1');

      expect(result).toEqual(['item-1', 'item-3']);
    });

    it('should return empty array when no items exist for the briefing', async () => {
      mockSelectFrom.mockImplementationOnce(() => {
        selectCallCount++;
        return { where: vi.fn().mockResolvedValue([]) };
      });

      const result = await service.getReadItemIds('user-1', 'briefing-1');

      expect(result).toEqual([]);
    });
  });

  describe('hasExistingBriefings', () => {
    it('should return false when user has no prior briefings', async () => {
      mockSelectFrom.mockImplementationOnce(() => {
        selectCallCount++;
        return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) };
      });

      const result = await service.hasExistingBriefings('user-new');

      expect(result).toBe(false);
    });

    it('should return true when user has existing briefings', async () => {
      mockSelectFrom.mockImplementationOnce(() => {
        selectCallCount++;
        return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: 'briefing-1' }]) }) };
      });

      const result = await service.hasExistingBriefings('user-1');

      expect(result).toBe(true);
    });
  });

  describe('getBackfillThreads', () => {
    it('should return empty array when user has no workstream assignments', async () => {
      mockSelectFrom.mockImplementationOnce(() => {
        selectCallCount++;
        return { where: vi.fn().mockResolvedValue([]) };
      });

      const user = createMockUser({ id: 'user-new' });
      const result = await service.getBackfillThreads(user, 90);

      expect(result).toEqual([]);
    });

    it('should return delivered threads filtered by workstreams within lookback window', async () => {
      mockSelectFrom
        .mockImplementationOnce(() => {
          selectCallCount++;
          return { where: vi.fn().mockResolvedValue([{ workstreamId: 'ws-1' }]) };
        })
        .mockImplementationOnce(() => {
          selectCallCount++;
          const backfillRows = [
            {
              threadId: 'historical-thread-1',
              threadTs: '1699000000.000100',
              channelSlackId: 'C01XYZ',
              primaryTopic: 'Past decision',
              technicalSummary: { text: 'Technical past' },
              plainSummary: { text: 'Plain past' },
              workstreamName: 'Engineering',
              workstreamId: 'ws-1',
            },
          ];
          return {
            innerJoin: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                leftJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockReturnValue({
                    orderBy: vi.fn().mockResolvedValue(backfillRows),
                  }),
                }),
              }),
            }),
          };
        });

      const user = createMockUser({ id: 'user-new' });
      const result = await service.getBackfillThreads(user, 90);

      expect(result).toHaveLength(1);
      expect(result[0]!.threadId).toBe('historical-thread-1');
      expect(result[0]!.itemType).toBe('backfill');
    });
  });

  describe('generateBriefingForUser — backfill behavior', () => {
    it('should include backfill items for first-time users', async () => {
      const newUser = createMockUser({ id: 'user-new', role: 'CONSULTANT' });
      const dailyThread = createMockThread({ threadId: 'daily-1' });
      const today = new Date('2026-05-27');
      today.setUTCHours(0, 0, 0, 0);

      mockSelectFrom
        .mockImplementationOnce(() => {
          selectCallCount++;
          return { where: vi.fn().mockResolvedValue([]) };
        });

      const hasExistingSpy = vi.spyOn(service, 'hasExistingBriefings').mockResolvedValueOnce(false);

      const backfillThread = createMockThread({
        threadId: 'backfill-1',
        itemType: 'backfill',
        workstreamName: 'Engineering',
      });
      const getBackfillSpy = vi.spyOn(service, 'getBackfillThreads').mockResolvedValueOnce([backfillThread]);

      const buildSpy = vi.spyOn(service, 'buildBriefingItems');
      buildSpy
        .mockResolvedValueOnce([{
          threadId: 'backfill-1',
          headline: 'Backfill topic',
          summaryText: 'Historical context',
          workstreamName: 'Engineering',
          sourceThreadUrl: null,
          itemType: 'backfill' as ItemType,
        }])
        .mockResolvedValueOnce([{
          threadId: 'daily-1',
          headline: 'Daily topic',
          summaryText: 'Today summary',
          workstreamName: 'Engineering',
          sourceThreadUrl: null,
          itemType: 'standard' as ItemType,
        }]);

      mockInsertValues.mockReturnValueOnce({
        returning: vi.fn().mockResolvedValue([{
          id: 'briefing-new',
          userId: 'user-new',
          briefingDate: today,
          briefingShape: 'intelligence_report',
          generatedAt: new Date(),
          threadCount: 2,
          workstreamCount: 1,
        }]),
      }).mockReturnValueOnce({
        then: (resolve: any) => resolve(),
      });

      const result = await service.generateBriefingForUser(newUser, [dailyThread], today);

      expect(result).toEqual({ itemCount: 2 });
      expect(hasExistingSpy).toHaveBeenCalledWith('user-new');
      expect(getBackfillSpy).toHaveBeenCalled();
      expect(buildSpy).toHaveBeenCalledTimes(2);
    });

    it('should NOT include backfill items for repeat users', async () => {
      const existingUser = createMockUser({ id: 'user-existing', role: 'SALES' });
      const dailyThread = createMockThread({ threadId: 'daily-1' });
      const today = new Date('2026-05-27');
      today.setUTCHours(0, 0, 0, 0);

      mockSelectFrom
        .mockImplementationOnce(() => {
          selectCallCount++;
          return { where: vi.fn().mockResolvedValue([]) };
        });

      const hasExistingSpy = vi.spyOn(service, 'hasExistingBriefings').mockResolvedValueOnce(true);
      const getBackfillSpy = vi.spyOn(service, 'getBackfillThreads');

      const buildSpy = vi.spyOn(service, 'buildBriefingItems');
      buildSpy.mockResolvedValueOnce([{
        threadId: 'daily-1',
        headline: 'Daily topic',
        summaryText: 'Today summary',
        workstreamName: 'Engineering',
        sourceThreadUrl: null,
        itemType: 'standard' as ItemType,
      }]);

      mockInsertValues.mockReturnValueOnce({
        returning: vi.fn().mockResolvedValue([{
          id: 'briefing-existing',
          userId: 'user-existing',
          briefingDate: today,
          briefingShape: 'executive_scan',
          generatedAt: new Date(),
          threadCount: 1,
          workstreamCount: 1,
        }]),
      }).mockReturnValueOnce({
        then: (resolve: any) => resolve(),
      });

      const result = await service.generateBriefingForUser(existingUser, [dailyThread], today);

      expect(result).toEqual({ itemCount: 1 });
      expect(hasExistingSpy).toHaveBeenCalledWith('user-existing');
      expect(getBackfillSpy).not.toHaveBeenCalled();
      expect(buildSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle first-time user with no approved threads (backfill-only briefing)', async () => {
      const newUser = createMockUser({ id: 'user-backfill-only', role: 'PM' });
      const today = new Date('2026-05-27');
      today.setUTCHours(0, 0, 0, 0);

      mockSelectFrom
        .mockImplementationOnce(() => {
          selectCallCount++;
          return { where: vi.fn().mockResolvedValue([]) };
        });

      vi.spyOn(service, 'hasExistingBriefings').mockResolvedValueOnce(false);
      vi.spyOn(service, 'getBackfillThreads').mockResolvedValueOnce([
        createMockThread({ threadId: 'backfill-only-1', itemType: 'backfill' }),
      ]);

      const buildSpy = vi.spyOn(service, 'buildBriefingItems');
      buildSpy
        .mockResolvedValueOnce([{
          threadId: 'backfill-only-1',
          headline: 'Historical topic',
          summaryText: 'History summary',
          workstreamName: 'Engineering',
          sourceThreadUrl: null,
          itemType: 'backfill' as ItemType,
        }])
        .mockResolvedValueOnce([]);

      mockInsertValues.mockReturnValueOnce({
        returning: vi.fn().mockResolvedValue([{
          id: 'briefing-backfill-only',
          userId: 'user-backfill-only',
          briefingDate: today,
          briefingShape: 'filtered_brief',
          generatedAt: new Date(),
          threadCount: 1,
          workstreamCount: 1,
        }]),
      }).mockReturnValueOnce({
        then: (resolve: any) => resolve(),
      });

      const result = await service.generateBriefingForUser(newUser, [], today);

      expect(result).toEqual({ itemCount: 1 });
    });
  });

  describe('buildBriefingItems — backfill sort priority', () => {
    it('should sort backfill items before all other types', async () => {
      const threads = [
        createMockThread({ threadId: 'thread-1', itemType: 'standard' }),
        createMockThread({ threadId: 'thread-2', itemType: 'backfill' }),
        createMockThread({ threadId: 'thread-3', itemType: 'cross_workstream' }),
      ];

      const salesUser = createMockUser({ id: 'user-sales', role: 'SALES' });
      const items = await service.buildBriefingItems(threads, 'executive_scan', salesUser);

      expect(items[0]!.itemType).toBe('backfill');
      expect(items[1]!.itemType).toBe('cross_workstream');
      expect(items[2]!.itemType).toBe('standard');
    });
  });
});
