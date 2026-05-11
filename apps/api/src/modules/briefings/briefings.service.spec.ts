import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import { BriefingsService } from './briefings.service.js';
import { PipelineStateService } from '../pipeline/pipeline-state.service.js';

function createMockUser(overrides: Partial<{ id: string; role: string; email: string; displayName: string; slackHandle: string }> = {}) {
  return {
    id: overrides.id ?? 'user-1',
    email: overrides.email ?? 'test@example.com',
    displayName: overrides.displayName ?? 'Test User',
    slackHandle: overrides.slackHandle ?? '@test',
    slackNicknames: [],
    role: overrides.role ?? 'PM',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockThread(overrides: Partial<{
  threadId: string;
  workstreamId: string | null;
  workstreamName: string | null;
  itemType: string;
}> = {}) {
  return {
    threadId: overrides.threadId ?? 'thread-1',
    threadTs: '1700000000.000100',
    channelSlackId: 'C01ABC',
    headline: 'Test Topic',
    technicalSummary: { text: 'Technical details about the topic' },
    plainSummary: { text: 'Simple summary of the topic' },
    workstreamName: overrides.workstreamName ?? 'Engineering',
    workstreamId: overrides.workstreamId ?? 'ws-1',
    itemType: overrides.itemType ?? 'standard',
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
      return Object.assign(result, { orderBy: mockSelectOrderBy });
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
});
