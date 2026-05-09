import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { SummarizerProcessor } from './summarizer.processor.js';
import { LlmService } from '../llm/llm.service.js';
import { PipelineStateService } from '../pipeline-state.service.js';
import { DATABASE_TOKEN } from '../../../database/database.module.js';
import { buildSummarizationPrompt } from '../llm/prompts/summarize.prompt.js';

const MOCK_THREAD = {
  id: 'thread-1',
  slackTeamId: 'T123',
  channelId: 'ch-1',
  threadTs: '1700000000.000000',
  latestReplyTs: null,
  messageCount: 3,
  rawMessages: [
    { user: 'U1', text: 'We need to migrate storage classes', ts: '1700000000.000000' },
    { user: 'U2', text: 'I agree, Ceph is the way forward', ts: '1700000001.000000' },
  ],
  participantIds: ['U1', 'U2'],
  pipelineState: 'classified' as const,
  processingDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_CLASSIFIED_TOPIC = {
  id: 'topic-1',
  threadId: 'thread-1',
  primaryTopic: 'Storage Migration',
  secondaryTopics: ['Infrastructure'],
  workstreamId: 'ws-infra',
  confidence: 0.85,
  modelVersion: 'phi3:mini',
  promptVersion: 'classify-v1',
  technicalSummary: null,
  plainSummary: null,
  createdAt: new Date(),
};

const MOCK_ROSTER = [
  { handle: 'U1', role: 'ARCHITECT', displayName: 'Ravi Kumar' },
  { handle: 'U2', role: 'CONSULTANT', displayName: 'Priya Singh' },
];

function makeSummarizationResponse() {
  return {
    technical_summary: {
      headline: 'Storage migration from NFS to Ceph requires VM compatibility layer',
      body: 'The team discussed migrating persistent storage from NFS v4.1...',
      key_decisions: ['Adopt Ceph RBD for block storage'],
      action_items: ['Ravi to benchmark Ceph throughput by Friday'],
    },
    plain_summary: {
      headline: 'Team is changing how files are stored to improve performance',
      body: 'The infrastructure team is moving file storage to a newer system...',
      key_decisions: ['New storage system approved'],
      action_items: ['Performance testing due by end of week'],
    },
  };
}

function makeLlmResult(summarization = makeSummarizationResponse()) {
  return {
    content: JSON.stringify(summarization),
    modelVersion: 'phi3:mini',
    latencyMs: 800,
    success: true as const,
    usedFallback: false,
    promptVersion: 'summarize-v1',
  };
}

describe('SummarizerProcessor', () => {
  let processor: SummarizerProcessor;
  let mockLlmService: Record<string, ReturnType<typeof vi.fn>>;
  let mockPipelineStateService: Record<string, ReturnType<typeof vi.fn>>;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

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

    mockDb = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              ...MOCK_CLASSIFIED_TOPIC,
              technicalSummary: makeSummarizationResponse().technical_summary,
              plainSummary: makeSummarizationResponse().plain_summary,
            }]),
          }),
        }),
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        SummarizerProcessor,
        { provide: LlmService, useValue: mockLlmService },
        { provide: PipelineStateService, useValue: mockPipelineStateService },
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    processor = module.get(SummarizerProcessor);
  });

  it('summarizes a thread and stores both summaries (AC: #1, #2, #5)', async () => {
    const result = await processor.summarizeThread(
      MOCK_THREAD,
      MOCK_CLASSIFIED_TOPIC,
      MOCK_ROSTER,
      'Infrastructure',
      '2026-05-08',
    );

    expect(result).not.toBeNull();
    expect(result.technicalSummary).toBeDefined();
    expect(result.plainSummary).toBeDefined();

    expect(mockLlmService.complete).toHaveBeenCalledOnce();
    expect(mockDb.update).toHaveBeenCalledOnce();

    expect(mockPipelineStateService.transitionState).toHaveBeenCalledWith(
      'thread-1',
      'summarized',
      '2026-05-08',
    );
  });

  it('retries once on malformed JSON, then throws (AC: #6)', async () => {
    mockLlmService.complete
      .mockResolvedValueOnce({ ...makeLlmResult(), content: 'not json {{{' })
      .mockResolvedValueOnce({ ...makeLlmResult(), content: 'still bad' });

    await expect(
      processor.summarizeThread(MOCK_THREAD, MOCK_CLASSIFIED_TOPIC, MOCK_ROSTER, null),
    ).rejects.toThrow('malformed JSON');

    expect(mockLlmService.complete).toHaveBeenCalledTimes(2);
  });

  it('retries once on Zod validation failure, then throws (AC: #6)', async () => {
    const badPayload = { technical_summary: { headline: '' }, plain_summary: 'not-object' };
    mockLlmService.complete
      .mockResolvedValueOnce({ ...makeLlmResult(), content: JSON.stringify(badPayload) })
      .mockResolvedValueOnce({ ...makeLlmResult(), content: JSON.stringify(badPayload) });

    await expect(
      processor.summarizeThread(MOCK_THREAD, MOCK_CLASSIFIED_TOPIC, MOCK_ROSTER, null),
    ).rejects.toThrow('validation failed');

    expect(mockLlmService.complete).toHaveBeenCalledTimes(2);
  });

  it('includes participant roles from roster in the prompt (AC: #4)', async () => {
    await processor.summarizeThread(
      MOCK_THREAD,
      MOCK_CLASSIFIED_TOPIC,
      MOCK_ROSTER,
      'Infrastructure',
    );

    const promptArg = mockLlmService.complete.mock.calls[0][0] as string;
    expect(promptArg).toContain('Ravi Kumar');
    expect(promptArg).toContain('ARCHITECT');
    expect(promptArg).toContain('Priya Singh');
    expect(promptArg).toContain('CONSULTANT');
  });

  it('includes classification context in the prompt (AC: #1)', async () => {
    await processor.summarizeThread(
      MOCK_THREAD,
      MOCK_CLASSIFIED_TOPIC,
      MOCK_ROSTER,
      'Infrastructure',
    );

    const promptArg = mockLlmService.complete.mock.calls[0][0] as string;
    expect(promptArg).toContain('Storage Migration');
    expect(promptArg).toContain('Infrastructure');

    const expected = buildSummarizationPrompt(
      JSON.stringify(MOCK_THREAD.rawMessages),
      {
        primaryTopic: 'Storage Migration',
        secondaryTopics: ['Infrastructure'],
        workstreamName: 'Infrastructure',
      },
      MOCK_ROSTER,
    );
    expect(promptArg).toBe(expected);
  });

  it('handles thread with no matching roster entries (AC: #4)', async () => {
    const unknownRoster = [
      { handle: 'U1', role: 'unknown', displayName: 'U1' },
      { handle: 'U2', role: 'unknown', displayName: 'U2' },
    ];

    await processor.summarizeThread(
      MOCK_THREAD,
      MOCK_CLASSIFIED_TOPIC,
      unknownRoster,
      null,
    );

    const promptArg = mockLlmService.complete.mock.calls[0][0] as string;
    expect(promptArg).toContain('@U1');
    expect(promptArg).toContain('unknown');
  });
});
