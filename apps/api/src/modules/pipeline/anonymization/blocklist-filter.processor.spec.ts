import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { BlocklistMatch } from '@slack-thread-manager/shared';
import { BlocklistFilterProcessor } from './blocklist-filter.processor.js';
import { DATABASE_TOKEN } from '../../../database/database.module.js';

const makeSummary = (
  headline = 'Default headline',
  body = 'Default body text',
  keyDecisions: string[] = [],
  actionItems: string[] = [],
) => ({
  headline,
  body,
  key_decisions: keyDecisions,
  action_items: actionItems,
});

const makeBlocklistEntry = (
  term: string,
  replacement: string,
  category: string,
  id = crypto.randomUUID(),
) => ({
  id,
  term,
  replacement,
  category,
  createdAt: new Date(),
});

describe('BlocklistFilterProcessor', () => {
  let processor: BlocklistFilterProcessor;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    mockDb = {
      select: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        BlocklistFilterProcessor,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    processor = module.get(BlocklistFilterProcessor);
  });

  function setupMocks(
    threads: Array<{ id: string }>,
    blocklistEntries: Array<ReturnType<typeof makeBlocklistEntry>>,
    topics: Array<{ threadId: string; technicalSummary: unknown; plainSummary: unknown }>,
  ) {
    // 1st select: slackThreads where pipelineState = 'embedded'
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(threads),
      }),
    });

    if (threads.length === 0) return;

    // 2nd select: anonymizationBlocklist
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockResolvedValue(blocklistEntries),
    });

    // 3rd select: classifiedTopics where threadId in threadIds
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(topics),
      }),
    });
  }

  it('8.1: exact case-insensitive match replaces term', async () => {
    const techSummary = makeSummary('Meeting about acme corp migration', 'Details here');
    const plainSummary = makeSummary('Summary', 'Plain text');

    setupMocks(
      [{ id: 'thread-1' }],
      [makeBlocklistEntry('Acme Corp', 'EOS', 'company_name')],
      [{ threadId: 'thread-1', technicalSummary: techSummary, plainSummary }],
    );

    const result = await processor.runFilter();

    expect(result.threadsScanned).toBe(1);
    expect(result.threadsWithMatches).toBe(1);
    expect(result.totalMatches).toBe(1);

    const threadResult = result.results[0];
    expect(threadResult.originalContent.technicalSummary.headline).toBe('Meeting about acme corp migration');
    expect(threadResult.anonymizedContent.technicalSummary.headline).toBe('Meeting about EOS migration');
    expect(threadResult.flags[0].term).toBe('Acme Corp');
    expect(threadResult.flags[0].source).toBe('BLOCKLIST');
  });

  it('8.2: possessive match replaces term preserving suffix', async () => {
    const techSummary = makeSummary("Acme Corp's servers are down", 'Details');
    const plainSummary = makeSummary('Summary', 'Plain');

    setupMocks(
      [{ id: 'thread-1' }],
      [makeBlocklistEntry('Acme Corp', 'EOS', 'company_name')],
      [{ threadId: 'thread-1', technicalSummary: techSummary, plainSummary }],
    );

    const result = await processor.runFilter();

    expect(result.threadsWithMatches).toBe(1);
    const threadResult = result.results[0];
    expect(threadResult.anonymizedContent.technicalSummary.headline).toContain("EOS's");
  });

  it('8.3: plural match replaces term', async () => {
    const techSummary = makeSummary('Multiple servers found', 'Details');
    const plainSummary = makeSummary('Summary', 'Plain');

    setupMocks(
      [{ id: 'thread-1' }],
      [makeBlocklistEntry('server', '[INFRA]', 'infrastructure')],
      [{ threadId: 'thread-1', technicalSummary: techSummary, plainSummary }],
    );

    const result = await processor.runFilter();

    expect(result.threadsWithMatches).toBe(1);
    const threadResult = result.results[0];
    expect(threadResult.anonymizedContent.technicalSummary.headline).toContain('[INFRA]');
  });

  it('8.4: word boundary prevents false positives', async () => {
    const techSummary = makeSummary('Soil erosion is a problem', 'Details about erosion');
    const plainSummary = makeSummary('Summary', 'Plain');

    setupMocks(
      [{ id: 'thread-1' }],
      [makeBlocklistEntry('EOS', '[REDACTED]', 'company_name')],
      [{ threadId: 'thread-1', technicalSummary: techSummary, plainSummary }],
    );

    const result = await processor.runFilter();

    expect(result.threadsWithMatches).toBe(0);
    expect(result.totalMatches).toBe(0);
    const threadResult = result.results[0];
    expect(threadResult.anonymizedContent.technicalSummary.headline).toBe('Soil erosion is a problem');
  });

  it('8.5: multiple matches from different blocklist terms', async () => {
    const techSummary = makeSummary('Acme Corp contacted John Smith', 'Details');
    const plainSummary = makeSummary('Summary', 'Plain');

    setupMocks(
      [{ id: 'thread-1' }],
      [
        makeBlocklistEntry('Acme Corp', 'EOS', 'company_name'),
        makeBlocklistEntry('John Smith', '[PERSON]', 'person_name'),
      ],
      [{ threadId: 'thread-1', technicalSummary: techSummary, plainSummary }],
    );

    const result = await processor.runFilter();

    expect(result.threadsWithMatches).toBe(1);
    expect(result.results[0].flags).toHaveLength(2);
    expect(result.totalMatches).toBeGreaterThanOrEqual(2);
    expect(result.results[0].anonymizedContent.technicalSummary.headline).toContain('EOS');
    expect(result.results[0].anonymizedContent.technicalSummary.headline).toContain('[PERSON]');
  });

  it('8.6: matches across multiple fields', async () => {
    const techSummary = makeSummary(
      'Acme Corp headline',
      'Acme Corp in body',
      ['Acme Corp decided X'],
      ['Acme Corp action'],
    );
    const plainSummary = makeSummary('Summary', 'Plain');

    setupMocks(
      [{ id: 'thread-1' }],
      [makeBlocklistEntry('Acme Corp', 'EOS', 'company_name')],
      [{ threadId: 'thread-1', technicalSummary: techSummary, plainSummary }],
    );

    const result = await processor.runFilter();

    expect(result.threadsWithMatches).toBe(1);

    const flag = result.results[0].flags[0] as BlocklistMatch;
    const positions = flag.positions;
    const fields = positions.map((p: { field: string }) => p.field);
    expect(fields).toContain('technicalSummary.headline');
    expect(fields).toContain('technicalSummary.body');
    expect(fields.some((f: string) => f.startsWith('technicalSummary.key_decisions'))).toBe(true);
    expect(fields.some((f: string) => f.startsWith('technicalSummary.action_items'))).toBe(true);
  });

  it('8.7: zero embedded threads returns empty result', async () => {
    setupMocks([], [], []);

    const result = await processor.runFilter();

    expect(result).toEqual({
      threadsScanned: 0,
      threadsWithMatches: 0,
      totalMatches: 0,
      results: [],
    });
  });

  it('8.8: zero blocklist terms returns zero matches but still produces results for staging', async () => {
    const techSummary = makeSummary('Some content', 'Body text');
    const plainSummary = makeSummary('Summary', 'Plain');

    setupMocks(
      [{ id: 'thread-1' }],
      [],
      [{ threadId: 'thread-1', technicalSummary: techSummary, plainSummary }],
    );

    const result = await processor.runFilter();

    expect(result.threadsScanned).toBe(1);
    expect(result.threadsWithMatches).toBe(0);
    expect(result.totalMatches).toBe(0);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].threadId).toBe('thread-1');
    expect(result.results[0].flags).toHaveLength(0);
  });

  it('8.9: original content is preserved unmodified', async () => {
    const techSummary = makeSummary('Meeting about Acme Corp', 'Details');
    const plainSummary = makeSummary('Summary', 'Plain');

    setupMocks(
      [{ id: 'thread-1' }],
      [makeBlocklistEntry('Acme Corp', 'EOS', 'company_name')],
      [{ threadId: 'thread-1', technicalSummary: techSummary, plainSummary }],
    );

    const result = await processor.runFilter();

    const threadResult = result.results[0];
    expect(threadResult.originalContent.technicalSummary.headline).toBe('Meeting about Acme Corp');
    expect(threadResult.anonymizedContent.technicalSummary.headline).toBe('Meeting about EOS');
    expect(threadResult.originalContent.technicalSummary.headline).not.toBe(
      threadResult.anonymizedContent.technicalSummary.headline,
    );
  });

  it('8.10: position tracking reports correct field and indices', async () => {
    const headline = 'Hello Acme Corp world';
    const techSummary = makeSummary(headline, 'Body text');
    const plainSummary = makeSummary('Summary', 'Plain');

    setupMocks(
      [{ id: 'thread-1' }],
      [makeBlocklistEntry('Acme Corp', 'EOS', 'company_name')],
      [{ threadId: 'thread-1', technicalSummary: techSummary, plainSummary }],
    );

    const result = await processor.runFilter();

    const flag = result.results[0].flags[0] as BlocklistMatch;
    const positions = flag.positions;
    const headlinePos = positions.find((p: { field: string }) => p.field === 'technicalSummary.headline');
    expect(headlinePos).toBeDefined();
    expect(headlinePos!.startIndex).toBe(headline.indexOf('Acme Corp'));
    expect(headlinePos!.endIndex).toBe(headline.indexOf('Acme Corp') + 'Acme Corp'.length);
  });

  it('8.11: per-item error isolation — one thread failure does not block others', async () => {
    const goodSummary = makeSummary('Acme Corp content', 'Body');
    const plainSummary = makeSummary('Summary', 'Plain');

    // 1st select: 2 embedded threads
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 'thread-1' }, { id: 'thread-2' }]),
      }),
    });

    // 2nd select: blocklist entries
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockResolvedValue([makeBlocklistEntry('Acme Corp', 'EOS', 'company_name')]),
    });

    // 3rd select: topics — thread-1 has null technicalSummary (edge case), thread-2 has valid data
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { threadId: 'thread-1', technicalSummary: null, plainSummary: null },
          { threadId: 'thread-2', technicalSummary: goodSummary, plainSummary },
        ]),
      }),
    });

    const result = await processor.runFilter();

    // thread-1 skipped (no summaries), thread-2 processed
    expect(result.threadsScanned).toBe(2);
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    const thread2Result = result.results.find((r) => r.threadId === 'thread-2');
    expect(thread2Result).toBeDefined();
    expect(thread2Result!.flags.length).toBeGreaterThan(0);
  });

  it('handles regex special characters in blocklist terms', async () => {
    const techSummary = makeSummary('Visit https://acme.internal for details', 'Body');
    const plainSummary = makeSummary('Summary', 'Plain');

    setupMocks(
      [{ id: 'thread-1' }],
      [makeBlocklistEntry('https://acme.internal', '[URL_REDACTED]', 'url')],
      [{ threadId: 'thread-1', technicalSummary: techSummary, plainSummary }],
    );

    const result = await processor.runFilter();

    expect(result.threadsWithMatches).toBe(1);
    expect(result.results[0].anonymizedContent.technicalSummary.headline).toContain('[URL_REDACTED]');
  });
});
