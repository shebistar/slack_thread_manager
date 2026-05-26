import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OpenShiftDocsSource } from './openshift-docs.source.js';

describe('OpenShiftDocsSource', () => {
  let source: OpenShiftDocsSource;
  const mockConfigService = {
    get: vi.fn((key: string) => {
      const config: Record<string, string | number> = {
        ENRICHMENT_OPENSHIFT_DOCS_URL: 'https://docs.openshift.com',
        ENRICHMENT_SOURCE_TIMEOUT_MS: 5000,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OpenShiftDocsSource,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    source = module.get<OpenShiftDocsSource>(OpenShiftDocsSource);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(source).toBeDefined();
    expect(source.name).toBe('OpenShift Docs');
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
          { title: 'SDN Guide', excerpt: 'Software-defined networking overview', url: '/docs/networking/sdn', relevance: 0.88 },
          { title: 'Network Policy', excerpt: 'Configuring network policies', url: 'https://docs.openshift.com/policies', relevance: 0.75 },
        ],
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const result = await source.query('thread-1', { primaryTopic: 'networking' });

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toEqual({
      title: 'SDN Guide',
      description: 'Software-defined networking overview',
      sourceUrl: 'https://docs.openshift.com/docs/networking/sdn',
      sourceType: 'OPENSHIFT_DOCS',
      relevanceScore: 0.88,
    });
    expect(result.sections[1]!.sourceUrl).toBe('https://docs.openshift.com/policies');

    vi.unstubAllGlobals();
  });

  it('returns empty on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const result = await source.query('thread-1', { primaryTopic: 'test' });
    expect(result.sections).toEqual([]);

    vi.unstubAllGlobals();
  });

  it('returns empty on timeout', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const result = await source.query('thread-1', { primaryTopic: 'test' });
    expect(result.sections).toEqual([]);

    vi.unstubAllGlobals();
  });
});
