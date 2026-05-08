import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClassifierProcessor } from './classifier.processor.js';
import { LlmService } from '../llm/llm.service.js';
import { PipelineStateService } from '../pipeline-state.service.js';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import { buildClassificationPrompt } from '../llm/prompts/classify.prompt.js';

const MOCK_THREAD = {
  id: 'thread-1',
  slackTeamId: 'T123',
  channelId: 'ch-1',
  threadTs: '1700000000.000000',
  latestReplyTs: null,
  messageCount: 3,
  rawMessages: [
    { user: 'U1', text: 'We need to migrate storage classes', ts: '1700000000.000000' },
    { user: 'U2', text: 'I agree, the current setup is not ideal', ts: '1700000001.000000' },
  ],
  participantIds: ['U1', 'U2'],
  pipelineState: 'ingested' as const,
  processingDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_WORKSTREAMS = [
  { name: 'Infrastructure', id: 'ws-infra' },
  { name: 'Networking', id: 'ws-net' },
];

function makeClassificationResponse(overrides = {}) {
  return {
    primary_topic: 'Storage Migration',
    secondary_topics: ['Infrastructure'],
    workstream_id: 'Infrastructure',
    confidence_score: 0.85,
    ...overrides,
  };
}

function makeLlmResult(classification = makeClassificationResponse()) {
  return {
    content: JSON.stringify(classification),
    modelVersion: 'phi3:mini',
    latencyMs: 500,
    success: true as const,
    usedFallback: false,
    promptVersion: 'classify-v1',
  };
}

describe('ClassifierProcessor', () => {
  let processor: ClassifierProcessor;
  let mockLlmService: Record<string, ReturnType<typeof vi.fn>>;
  let mockPipelineStateService: Record<string, ReturnType<typeof vi.fn>>;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;
  let mockConfigService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    mockLlmService = {
      complete: vi.fn().mockResolvedValue(makeLlmResult()),
      resetBatchCounters: vi.fn(),
      logBatchSummary: vi.fn(),
    };

    mockPipelineStateService = {
      transitionState: vi.fn().mockResolvedValue(MOCK_THREAD),
      markPendingRetry: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };

    const mockInsertReturning = vi.fn().mockResolvedValue([{
      id: 'topic-1',
      threadId: 'thread-1',
      primaryTopic: 'Storage Migration',
      secondaryTopics: ['Infrastructure'],
      workstreamId: 'ws-infra',
      confidence: 0.85,
      modelVersion: 'phi3:mini',
      promptVersion: 'classify-v1',
      createdAt: new Date(),
    }]);

    mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockInsertReturning,
        }),
      }),
    };

    mockConfigService = {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'CLASSIFICATION_CONFIDENCE_THRESHOLD') return 0.6;
        return undefined;
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        ClassifierProcessor,
        { provide: LlmService, useValue: mockLlmService },
        { provide: PipelineStateService, useValue: mockPipelineStateService },
        { provide: DATABASE_TOKEN, useValue: mockDb },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    processor = module.get(ClassifierProcessor);
  });

  it('classifies a thread and stores the result (AC: #1, #2, #4)', async () => {
    const result = await processor.classifyThread(MOCK_THREAD, MOCK_WORKSTREAMS, '2026-05-08');

    expect(result).not.toBeNull();
    expect(result!.primaryTopic).toBe('Storage Migration');

    expect(mockLlmService.complete).toHaveBeenCalledOnce();
    expect(mockDb.insert).toHaveBeenCalledOnce();

    expect(mockPipelineStateService.transitionState).toHaveBeenCalledWith(
      'thread-1',
      'classified',
      '2026-05-08',
    );
  });

  it('marks pending_retry when confidence is below threshold (AC: #3)', async () => {
    mockLlmService.complete.mockResolvedValue(
      makeLlmResult(makeClassificationResponse({ confidence_score: 0.3 })),
    );

    const result = await processor.classifyThread(MOCK_THREAD, MOCK_WORKSTREAMS);

    expect(result).toBeNull();
    expect(mockPipelineStateService.markPendingRetry).toHaveBeenCalledWith(
      'thread-1',
      'ingested',
      expect.any(Error),
    );
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockPipelineStateService.transitionState).not.toHaveBeenCalled();
  });

  it('retries once on malformed JSON, then throws (AC: #1)', async () => {
    mockLlmService.complete
      .mockResolvedValueOnce({ ...makeLlmResult(), content: 'not json {{{' })
      .mockResolvedValueOnce({ ...makeLlmResult(), content: 'still bad' });

    await expect(processor.classifyThread(MOCK_THREAD, MOCK_WORKSTREAMS)).rejects.toThrow(
      'malformed JSON',
    );

    expect(mockLlmService.complete).toHaveBeenCalledTimes(2);
  });

  it('retries once on Zod validation failure, then throws', async () => {
    const badPayload = { primary_topic: '', secondary_topics: 'not-array', confidence_score: 2 };
    mockLlmService.complete
      .mockResolvedValueOnce({ ...makeLlmResult(), content: JSON.stringify(badPayload) })
      .mockResolvedValueOnce({ ...makeLlmResult(), content: JSON.stringify(badPayload) });

    await expect(processor.classifyThread(MOCK_THREAD, MOCK_WORKSTREAMS)).rejects.toThrow(
      'validation failed',
    );

    expect(mockLlmService.complete).toHaveBeenCalledTimes(2);
  });

  it('resolves workstream name case-insensitively (AC: #5)', async () => {
    mockLlmService.complete.mockResolvedValue(
      makeLlmResult(makeClassificationResponse({ workstream_id: 'infrastructure' })),
    );

    await processor.classifyThread(MOCK_THREAD, MOCK_WORKSTREAMS, '2026-05-08');

    const insertCall = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertCall.workstreamId).toBe('ws-infra');
  });

  it('sets workstreamId to null when no match (AC: #5)', async () => {
    mockLlmService.complete.mockResolvedValue(
      makeLlmResult(makeClassificationResponse({ workstream_id: 'unknown-ws' })),
    );

    await processor.classifyThread(MOCK_THREAD, MOCK_WORKSTREAMS, '2026-05-08');

    const insertCall = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertCall.workstreamId).toBeNull();
  });

  it('includes workstream names in the prompt (AC: #5)', async () => {
    await processor.classifyThread(MOCK_THREAD, MOCK_WORKSTREAMS, '2026-05-08');

    const promptArg = mockLlmService.complete.mock.calls[0][0] as string;
    expect(promptArg).toContain('Infrastructure');
    expect(promptArg).toContain('Networking');

    const expected = buildClassificationPrompt(
      JSON.stringify(MOCK_THREAD.rawMessages),
      ['Infrastructure', 'Networking'],
    );
    expect(promptArg).toBe(expected);
  });
});
