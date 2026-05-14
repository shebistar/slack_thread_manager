import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SearchService } from './search.service.js';
import { FtsService } from './fts.service.js';
import { VectorSearchService } from './vector-search.service.js';
import { HybridSearchService } from './hybrid-search.service.js';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { HybridSearchResult } from './hybrid-search.service.js';
import type { UserRole } from '@slack-thread-manager/shared';

const THREAD_ID_1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const THREAD_ID_2 = 'aaaaaaaa-0000-4000-8000-000000000002';

const makeRow = (overrides: Partial<{
  threadId: string;
  classifiedTopicId: string;
  slackTeamId: string;
  threadTs: string;
  channelSlackId: string;
  primaryTopic: string;
  technicalSummary: unknown;
  plainSummary: unknown;
  workstreamName: string | null;
}> = {}) => ({
  threadId: THREAD_ID_1,
  classifiedTopicId: 'ct-1',
  slackTeamId: 'T-TEAM',
  threadTs: '1683000000.123456',
  channelSlackId: 'C-CHANNEL',
  primaryTopic: 'Deployment pipeline decision',
  technicalSummary: { headline: 'Tech headline', body: 'Tech body' },
  plainSummary: { headline: 'Plain headline', body: 'Plain body' },
  workstreamName: 'Platform',
  ...overrides,
});

const makeMergedResult = (overrides: Partial<HybridSearchResult> = {}): HybridSearchResult => ({
  threadId: THREAD_ID_1,
  classifiedTopicId: 'ct-1',
  combinedScore: 0.75,
  matchType: 'BOTH',
  ftsScore: 0.4,
  semanticScore: 0.6,
  ...overrides,
});

function buildDbMock(resolvedRows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => Promise.resolve(resolvedRows));
  return chain;
}

describe('SearchService', () => {
  let service: SearchService;
  let mockFtsService: { search: ReturnType<typeof vi.fn> };
  let mockVectorService: { search: ReturnType<typeof vi.fn> };
  let mockHybridService: { merge: ReturnType<typeof vi.fn> };
  let mockConfigService: { get: ReturnType<typeof vi.fn> };
  let dbMock: ReturnType<typeof buildDbMock>;

  beforeEach(async () => {
    mockFtsService = { search: vi.fn().mockResolvedValue([]) };
    mockVectorService = { search: vi.fn().mockResolvedValue([]) };
    mockHybridService = { merge: vi.fn().mockReturnValue([]) };
    mockConfigService = { get: vi.fn().mockReturnValue('T-TEAM') };
    dbMock = buildDbMock([makeRow()]);

    const module = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: FtsService, useValue: mockFtsService },
        { provide: VectorSearchService, useValue: mockVectorService },
        { provide: HybridSearchService, useValue: mockHybridService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DATABASE_TOKEN, useValue: dbMock },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  describe('search() — orchestration', () => {
    it('runs FTS and semantic search in parallel (AC 1)', async () => {
      mockHybridService.merge.mockReturnValue([makeMergedResult()]);
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([makeRow()]);

      await service.search('deployment', 'PM');

      expect(mockFtsService.search).toHaveBeenCalledWith('deployment');
      expect(mockVectorService.search).toHaveBeenCalledWith('deployment');
      expect(mockHybridService.merge).toHaveBeenCalled();
    });

    it('returns correct meta shape with total, query, searchTimeMs (AC 3)', async () => {
      mockHybridService.merge.mockReturnValue([makeMergedResult()]);
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([makeRow()]);

      const result = await service.search('pipeline', 'PM');

      expect(result.meta.query).toBe('pipeline');
      expect(result.meta.total).toBe(1);
      expect(typeof result.meta.searchTimeMs).toBe('number');
      expect(result.meta.searchTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('returns empty results when hybrid merge is empty (AC 5)', async () => {
      mockHybridService.merge.mockReturnValue([]);

      const result = await service.search('no results query', 'PM');

      expect(result.results).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('does not query DB when merge returns empty (early exit)', async () => {
      mockHybridService.merge.mockReturnValue([]);

      await service.search('empty', 'PM');

      expect(dbMock.select).not.toHaveBeenCalled();
    });
  });

  describe('search() — result shape (AC 2)', () => {
    it('includes all required fields on each result item', async () => {
      mockHybridService.merge.mockReturnValue([makeMergedResult()]);
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([makeRow()]);

      const result = await service.search('deployment', 'PM');
      const item = result.results[0];

      expect(item).toBeDefined();
      expect(item).toHaveProperty('threadId', THREAD_ID_1);
      expect(item).toHaveProperty('threadHeadline', 'Deployment pipeline decision');
      expect(item).toHaveProperty('summarySnippet');
      expect(item).toHaveProperty('workstreamName', 'Platform');
      expect(item).toHaveProperty('sourceThreadUrl');
      expect(item).toHaveProperty('relevanceScore', 0.75);
      expect(item).toHaveProperty('matchType', 'BOTH');
    });

    it('builds Slack permalink from teamId + channelSlackId + threadTs (AC 2)', async () => {
      mockHybridService.merge.mockReturnValue([makeMergedResult()]);
      mockConfigService.get.mockReturnValue('T-SLACK');
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRow({ threadTs: '1683000000.123456', channelSlackId: 'C-CHAN', slackTeamId: 'T-SLACK' }),
      ]);

      const result = await service.search('query', 'PM');
      const url = result.results[0]?.sourceThreadUrl;

      expect(url).toContain('T-SLACK');
      expect(url).toContain('C-CHAN');
      expect(url).toContain('1683000000123456');
    });

    it('falls back to row slackTeamId when SLACK_TEAM_ID is not configured', async () => {
      mockHybridService.merge.mockReturnValue([makeMergedResult()]);
      mockConfigService.get.mockReturnValue(undefined);
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([makeRow()]);

      const result = await service.search('query', 'PM');
      expect(result.results[0]?.sourceThreadUrl).toContain('/client/T-TEAM/');
    });

    it('returns null workstreamName when thread has no workstream', async () => {
      mockHybridService.merge.mockReturnValue([makeMergedResult()]);
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRow({ workstreamName: null }),
      ]);

      const result = await service.search('query', 'PM');
      expect(result.results[0]?.workstreamName).toBeNull();
    });

    it('preserves matchType from hybrid merge result (AC 2)', async () => {
      const merged = [
        makeMergedResult({ threadId: THREAD_ID_1, matchType: 'KEYWORD' }),
        makeMergedResult({ threadId: THREAD_ID_2, matchType: 'SEMANTIC', combinedScore: 0.6 }),
      ];
      mockHybridService.merge.mockReturnValue(merged);
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRow({ threadId: THREAD_ID_1 }),
        makeRow({ threadId: THREAD_ID_2 }),
      ]);

      const result = await service.search('deployment', 'PM');
      const types = result.results.map((r) => r.matchType);
      expect(types).toContain('KEYWORD');
      expect(types).toContain('SEMANTIC');
    });

    it('maps row by threadId + classifiedTopicId for multi-topic threads', async () => {
      mockHybridService.merge.mockReturnValue([
        makeMergedResult({
          threadId: THREAD_ID_1,
          classifiedTopicId: 'ct-2',
          matchType: 'BOTH',
        }),
      ]);
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRow({
          threadId: THREAD_ID_1,
          classifiedTopicId: 'ct-1',
          primaryTopic: 'Wrong topic',
        }),
        makeRow({
          threadId: THREAD_ID_1,
          classifiedTopicId: 'ct-2',
          primaryTopic: 'Correct topic',
        }),
      ]);

      const result = await service.search('deployment', 'PM');
      expect(result.results[0]?.threadHeadline).toBe('Correct topic');
    });
  });

  describe('search() — role-aware summary selection (AC 2, 6)', () => {
    it('uses plain summary for PM role', async () => {
      mockHybridService.merge.mockReturnValue([makeMergedResult()]);
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRow({
          plainSummary: { headline: 'PM headline', body: 'Plain body' },
          technicalSummary: { headline: 'Tech headline', body: 'Tech body' },
        }),
      ]);

      const result = await service.search('query', 'PM');
      expect(result.results[0]?.summarySnippet).toContain('PM headline');
    });

    it('uses plain summary for SALES role', async () => {
      mockHybridService.merge.mockReturnValue([makeMergedResult()]);
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRow({
          plainSummary: { headline: 'Sales plain', body: '' },
          technicalSummary: { headline: 'Tech only', body: '' },
        }),
      ]);

      const result = await service.search('query', 'SALES');
      expect(result.results[0]?.summarySnippet).toContain('Sales plain');
    });

    it('uses technical summary for ARCHITECT role (AC 6)', async () => {
      mockHybridService.merge.mockReturnValue([makeMergedResult()]);
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRow({
          plainSummary: { headline: 'Plain only', body: '' },
          technicalSummary: { headline: 'Architect technical', body: 'Deep context' },
        }),
      ]);

      const result = await service.search('query', 'ARCHITECT');
      expect(result.results[0]?.summarySnippet).toContain('Architect technical');
    });

    it('uses technical summary for CONSULTANT role (AC 6)', async () => {
      mockHybridService.merge.mockReturnValue([makeMergedResult()]);
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRow({
          plainSummary: { headline: 'Plain text', body: '' },
          technicalSummary: { headline: 'Consultant tech', body: 'Technical detail' },
        }),
      ]);

      const result = await service.search('query', 'CONSULTANT');
      expect(result.results[0]?.summarySnippet).toContain('Consultant tech');
    });

    it('returns null summarySnippet when summary is null', async () => {
      mockHybridService.merge.mockReturnValue([makeMergedResult()]);
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRow({ plainSummary: null }),
      ]);

      const result = await service.search('query', 'PM');
      expect(result.results[0]?.summarySnippet).toBeNull();
    });

    it('does not apply workstream filtering regardless of role (FR17 / AC 6)', async () => {
      const merged = [
        makeMergedResult({ threadId: THREAD_ID_1 }),
        makeMergedResult({ threadId: THREAD_ID_2, combinedScore: 0.5 }),
      ];
      mockHybridService.merge.mockReturnValue(merged);
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRow({ threadId: THREAD_ID_1, workstreamName: 'Platform' }),
        makeRow({ threadId: THREAD_ID_2, workstreamName: 'Delivery' }),
      ]);

      const result = await service.search('query', 'PM');

      // PM gets all results — no workstream filtering in search
      expect(result.results).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });
  });

  describe('search() — no-result suggestions (AC 5)', () => {
    it('includes suggestions array when no results returned', async () => {
      mockHybridService.merge.mockReturnValue([]);

      const result = await service.search('nonexistent topic', 'PM');

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    });

    it('omits suggestions when results exist', async () => {
      mockHybridService.merge.mockReturnValue([makeMergedResult()]);
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([makeRow()]);

      const result = await service.search('deployment', 'PM');

      expect(result.suggestions).toBeUndefined();
    });

    it('generates deterministic suggestions for same query (AC 5)', async () => {
      mockHybridService.merge.mockReturnValue([]);

      const r1 = await service.search('pipeline auth fix', 'PM');
      const r2 = await service.search('pipeline auth fix', 'ADMIN');

      expect(r1.suggestions).toEqual(r2.suggestions);
    });

    it('suggestions include shorter query hint for multi-word queries', async () => {
      mockHybridService.merge.mockReturnValue([]);

      const result = await service.search('authentication pipeline failure', 'PM');

      const hasShorterHint = result.suggestions!.some((s) => s.includes('authentication'));
      expect(hasShorterHint).toBe(true);
    });

    it('includes suggestions when merged hits are dropped during enrichment', async () => {
      mockHybridService.merge.mockReturnValue([
        makeMergedResult({ threadId: THREAD_ID_1, classifiedTopicId: 'ct-2' }),
      ]);
      (dbMock.where as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRow({ threadId: THREAD_ID_1, classifiedTopicId: 'ct-1' }),
      ]);

      const result = await service.search('nonexistent topic', 'PM');
      expect(result.results).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    });
  });

  describe('generateSuggestions()', () => {
    it('returns at least one suggestion for any query', () => {
      expect(service.generateSuggestions('single').length).toBeGreaterThan(0);
      expect(service.generateSuggestions('multi word query').length).toBeGreaterThan(0);
    });

    it('returns shorter-query hint when query has multiple meaningful words', () => {
      const suggestions = service.generateSuggestions('authentication pipeline failure');
      const hasShorterHint = suggestions.some((s) =>
        s.toLowerCase().includes('authentication') || s.toLowerCase().includes('shorter'),
      );
      expect(hasShorterHint).toBe(true);
    });

    it('is deterministic — same input yields same output', () => {
      const s1 = service.generateSuggestions('deploy pipeline');
      const s2 = service.generateSuggestions('deploy pipeline');
      expect(s1).toEqual(s2);
    });
  });
});

describe('SearchService — roles that use UserRole type', () => {
  const TECHNICAL_ROLES: UserRole[] = ['ARCHITECT', 'CONSULTANT'];
  const PLAIN_ROLES: UserRole[] = ['PM', 'SALES', 'TRAINING', 'ADMIN'];

  it('TECHNICAL_ROLES and PLAIN_ROLES are exhaustive for UserRole', () => {
    const allRoles: UserRole[] = [...TECHNICAL_ROLES, ...PLAIN_ROLES];
    const uniqueRoles = new Set(allRoles);
    // All known roles are covered
    expect(uniqueRoles.has('ARCHITECT')).toBe(true);
    expect(uniqueRoles.has('CONSULTANT')).toBe(true);
    expect(uniqueRoles.has('PM')).toBe(true);
    expect(uniqueRoles.has('SALES')).toBe(true);
    expect(uniqueRoles.has('TRAINING')).toBe(true);
    expect(uniqueRoles.has('ADMIN')).toBe(true);
  });
});
