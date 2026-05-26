import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotebookLmSource } from './notebooklm.source.js';

describe('NotebookLmSource', () => {
  let source: NotebookLmSource;
  const mockConfigService = {
    get: vi.fn((key: string) => {
      const config: Record<string, string | number> = {
        ENRICHMENT_NOTEBOOKLM_URL: 'https://notebooklm.example.com',
        ENRICHMENT_SOURCE_TIMEOUT_MS: 5000,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotebookLmSource,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    source = module.get<NotebookLmSource>(NotebookLmSource);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(source).toBeDefined();
    expect(source.name).toBe('NotebookLM');
  });

  it('returns empty sections when no base URL is configured', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'ENRICHMENT_NOTEBOOKLM_URL') return undefined;
      return 5000;
    });

    const unconfiguredModule = await Test.createTestingModule({
      providers: [
        NotebookLmSource,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();
    const unconfiguredSource = unconfiguredModule.get<NotebookLmSource>(NotebookLmSource);

    const result = await unconfiguredSource.query('thread-1', { primaryTopic: 'test' });
    expect(result.sections).toEqual([]);
  });

  it('returns empty sections when context has no search term', async () => {
    const result = await source.query('thread-1', {});
    expect(result.sections).toEqual([]);
  });

  it('normalizes API response to EnrichmentSection format', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [
          { title: 'VM Migration Guide', snippet: 'How to migrate VMs', url: 'https://nb.com/doc1', score: 0.92 },
        ],
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const result = await source.query('thread-1', { primaryTopic: 'VM migration' });

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toEqual({
      title: 'VM Migration Guide',
      description: 'How to migrate VMs',
      sourceUrl: 'https://nb.com/doc1',
      sourceType: 'NOTEBOOKLM',
      relevanceScore: 0.92,
    });

    vi.unstubAllGlobals();
  });

  it('returns empty on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await source.query('thread-1', { primaryTopic: 'test' });
    expect(result.sections).toEqual([]);

    vi.unstubAllGlobals();
  });

  it('returns empty on timeout (AbortError)', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const result = await source.query('thread-1', { primaryTopic: 'test' });
    expect(result.sections).toEqual([]);

    vi.unstubAllGlobals();
  });
});
