import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FtsService, buildFtsDocument } from './fts.service.js';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import type { StagingQueueItem } from '@slack-thread-manager/shared';

const mockAnonymizedContent: StagingQueueItem['anonymizedContent'] = {
  technicalSummary: {
    headline: 'Deploy pipeline fix',
    body: 'The [COMPANY] deployment pipeline had a race condition in the staging step.',
    key_decisions: ['Use mutex lock for concurrent deploys'],
    action_items: ['Add monitoring for deploy queue depth'],
  },
  plainSummary: {
    headline: 'Deployment fix',
    body: 'Fixed a timing issue in the deployment process.',
    key_decisions: ['Lock deployments to run one at a time'],
    action_items: ['Set up alerts for deployment backlogs'],
  },
};

describe('buildFtsDocument', () => {
  it('concatenates all summary fields into a single string', () => {
    const doc = buildFtsDocument(mockAnonymizedContent);

    expect(doc).toContain('Deploy pipeline fix');
    expect(doc).toContain('race condition');
    expect(doc).toContain('Use mutex lock');
    expect(doc).toContain('Add monitoring');
    expect(doc).toContain('Deployment fix');
    expect(doc).toContain('timing issue');
    expect(doc).toContain('Lock deployments');
    expect(doc).toContain('Set up alerts');
  });

  it('handles empty key_decisions and action_items', () => {
    const content: StagingQueueItem['anonymizedContent'] = {
      technicalSummary: {
        headline: 'Test',
        body: 'Body text',
        key_decisions: [],
        action_items: [],
      },
      plainSummary: {
        headline: 'Plain',
        body: 'Plain body',
        key_decisions: [],
        action_items: [],
      },
    };

    const doc = buildFtsDocument(content);
    expect(doc).toBe('Test Body text Plain Plain body');
  });

  it('handles empty headline and body gracefully', () => {
    const content: StagingQueueItem['anonymizedContent'] = {
      technicalSummary: {
        headline: '',
        body: '',
        key_decisions: ['decision'],
        action_items: [],
      },
      plainSummary: {
        headline: '',
        body: '',
        key_decisions: [],
        action_items: ['action'],
      },
    };

    const doc = buildFtsDocument(content);
    expect(doc).toBe('decision action');
  });
});

function buildMockDb() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve([]));

  return chain;
}

describe('FtsService', () => {
  let service: FtsService;
  let dbMock: ReturnType<typeof buildMockDb>;

  beforeEach(async () => {
    dbMock = buildMockDb();

    const module = await Test.createTestingModule({
      providers: [
        FtsService,
        { provide: DATABASE_TOKEN, useValue: dbMock },
      ],
    }).compile();

    service = module.get<FtsService>(FtsService);
  });

  describe('search', () => {
    it('returns empty array for empty query', async () => {
      const results = await service.search('');
      expect(results).toEqual([]);
      expect(dbMock.select).not.toHaveBeenCalled();
    });

    it('returns empty array for whitespace-only query', async () => {
      const results = await service.search('   ');
      expect(results).toEqual([]);
      expect(dbMock.select).not.toHaveBeenCalled();
    });

    it('executes search with default limit of 20', async () => {
      const mockResults = [
        { threadId: 'tid-1', classifiedTopicId: 'ct-1', rank: 0.85 },
      ];
      (dbMock.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResults);

      const results = await service.search('deployment pipeline');

      expect(results).toEqual(mockResults);
      expect(dbMock.select).toHaveBeenCalled();
      expect(dbMock.innerJoin).toHaveBeenCalled();
      expect(dbMock.where).toHaveBeenCalled();
      expect(dbMock.orderBy).toHaveBeenCalled();
      expect(dbMock.limit).toHaveBeenCalledWith(20);
    });

    it('respects custom limit option', async () => {
      (dbMock.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      await service.search('test query', { limit: 5 });

      expect(dbMock.limit).toHaveBeenCalledWith(5);
    });

    it('returns ranked results in correct shape', async () => {
      const mockResults = [
        { threadId: 'tid-1', classifiedTopicId: 'ct-1', rank: 0.95 },
        { threadId: 'tid-2', classifiedTopicId: 'ct-2', rank: 0.42 },
      ];
      (dbMock.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResults);

      const results = await service.search('pipeline');

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('threadId');
      expect(results[0]).toHaveProperty('classifiedTopicId');
      expect(results[0]).toHaveProperty('rank');
      expect(results[0].rank).toBeGreaterThan(results[1].rank);
    });
  });

  describe('refreshSearchVector', () => {
    it('updates classified_topics search_vector for the given thread', async () => {
      const txMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };

      await service.refreshSearchVector(
        txMock as unknown as Parameters<Parameters<Database['transaction']>[0]>[0],
        'thread-123',
        mockAnonymizedContent,
      );

      expect(txMock.update).toHaveBeenCalled();
      expect(txMock.set).toHaveBeenCalled();
      expect(txMock.where).toHaveBeenCalled();
    });

    it('skips update when anonymized content produces empty document', async () => {
      const txMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };

      const emptyContent: StagingQueueItem['anonymizedContent'] = {
        technicalSummary: { headline: '', body: '', key_decisions: [], action_items: [] },
        plainSummary: { headline: '', body: '', key_decisions: [], action_items: [] },
      };

      await service.refreshSearchVector(
        txMock as unknown as Parameters<Parameters<Database['transaction']>[0]>[0],
        'thread-123',
        emptyContent,
      );

      expect(txMock.update).not.toHaveBeenCalled();
    });
  });
});
