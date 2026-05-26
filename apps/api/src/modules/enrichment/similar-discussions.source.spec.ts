import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SimilarDiscussionsSource } from './similar-discussions.source.js';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import { LlmService } from '../pipeline/llm/llm.service.js';

describe('SimilarDiscussionsSource', () => {
  let source: SimilarDiscussionsSource;

  const mockLlmService = {
    embed: vi.fn().mockResolvedValue({ embedding: Array(768).fill(0.1) }),
  };

  const mockDb = {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      const config: Record<string, string | number> = {
        ENRICHMENT_MAX_SIMILAR_RESULTS: 5,
        CORRELATION_SIMILARITY_THRESHOLD: 0.7,
        SLACK_TEAM_ID: 'T12345',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        SimilarDiscussionsSource,
        { provide: DATABASE_TOKEN, useValue: mockDb },
        { provide: LlmService, useValue: mockLlmService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    source = module.get<SimilarDiscussionsSource>(SimilarDiscussionsSource);
  });

  it('should be defined', () => {
    expect(source).toBeDefined();
    expect(source.name).toBe('Similar Past Discussions');
  });

  it('returns empty sections when context has no search term', async () => {
    const result = await source.query('thread-1', {});
    expect(result.sections).toEqual([]);
    expect(mockLlmService.embed).not.toHaveBeenCalled();
  });

  it('returns empty sections when search text is whitespace only', async () => {
    const result = await source.query('thread-1', { primaryTopic: '   ' });
    expect(result.sections).toEqual([]);
    expect(mockLlmService.embed).not.toHaveBeenCalled();
  });

  it('embeds topic and executes vector search query', async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        {
          thread_id: 'aaa',
          primary_topic: 'Migration planning',
          plain_summary: 'Discussed OCP migration steps',
          channel_name: 'platform-eng',
          slack_team_id: 'T12345',
          channel_slack_id: 'C999',
          thread_ts: '1716123456.789012',
          distance: 0.15,
        },
      ],
    });

    const result = await source.query('thread-1', { primaryTopic: 'VM migration' });

    expect(mockLlmService.embed).toHaveBeenCalledWith('VM migration');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({
      title: 'Migration planning',
      sourceType: 'PAST_DISCUSSION',
      relevanceScore: 0.85,
    });
    expect(result.sections[0]!.sourceUrl).toContain('https://app.slack.com/client/T12345/C999/thread/');
  });

  it('constructs permalink with dots removed from thread_ts', async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        {
          thread_id: 'bbb',
          primary_topic: 'Test topic',
          plain_summary: null,
          channel_name: 'general',
          slack_team_id: 'T12345',
          channel_slack_id: 'C100',
          thread_ts: '1716.123.456',
          distance: 0.2,
        },
      ],
    });

    const result = await source.query('thread-1', { primaryTopic: 'test' });

    expect(result.sections[0]!.sourceUrl).toContain('C100-1716123456');
  });

  it('returns empty on embed failure', async () => {
    mockLlmService.embed.mockRejectedValueOnce(new Error('LLM unavailable'));

    const result = await source.query('thread-1', { primaryTopic: 'test' });
    expect(result.sections).toEqual([]);
  });

  it('returns empty on DB query failure', async () => {
    mockDb.execute.mockRejectedValueOnce(new Error('DB timeout'));

    const result = await source.query('thread-1', { primaryTopic: 'test' });
    expect(result.sections).toEqual([]);
  });

  it('uses channel name in description when summary is null', async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        {
          thread_id: 'ccc',
          primary_topic: 'Topic',
          plain_summary: null,
          channel_name: 'infra',
          slack_team_id: 'T12345',
          channel_slack_id: 'C200',
          thread_ts: '1716000000.000000',
          distance: 0.1,
        },
      ],
    });

    const result = await source.query('thread-1', { primaryTopic: 'test' });
    expect(result.sections[0]!.description).toBe('Discussion in #infra');
  });
});
