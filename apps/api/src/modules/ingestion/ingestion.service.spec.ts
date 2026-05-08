import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import { IngestionService } from './ingestion.service.js';
import { SlackClientService } from '../slack/slack-client.service.js';

function createMockSlackClient() {
  return {
    isConfigured: vi.fn().mockReturnValue(true),
    fetchChannelHistory: vi.fn().mockResolvedValue({
      messages: [
        {
          ts: '1700000000.000100',
          user: 'U01ABC',
          text: 'Thread starter',
          threadTs: '1700000000.000100',
          raw: {
            ts: '1700000000.000100',
            user: 'U01ABC',
            text: 'Thread starter',
            thread_ts: '1700000000.000100',
            reply_count: 2,
          },
        },
      ],
      hasMore: false,
    }),
    fetchThreadReplies: vi.fn().mockResolvedValue({
      messages: [
        {
          ts: '1700000000.000100',
          user: 'U01ABC',
          text: 'Thread starter',
          threadTs: '1700000000.000100',
          raw: { ts: '1700000000.000100', user: 'U01ABC', text: 'Thread starter' },
        },
        {
          ts: '1700000001.000200',
          user: 'U02DEF',
          text: 'Reply one',
          threadTs: '1700000000.000100',
          raw: { ts: '1700000001.000200', user: 'U02DEF', text: 'Reply one' },
        },
      ],
      hasMore: false,
    }),
  };
}

function createMockDb() {
  return {
    query: {
      slackChannels: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'channel-uuid-1',
            slackChannelId: 'C01ABC123',
            name: 'general',
            workstreamId: 'ws-uuid-1',
            isActive: true,
            createdAt: new Date(),
          },
        ]),
      },
      slackThreads: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    transaction: vi.fn().mockImplementation(async (fn) => {
      const tx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'thread-uuid-1' }]),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      };
      return fn(tx);
    }),
  };
}

describe('IngestionService', () => {
  let service: IngestionService;
  let slackClient: ReturnType<typeof createMockSlackClient>;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    slackClient = createMockSlackClient();
    db = createMockDb();

    const module = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: SlackClientService, useValue: slackClient },
        { provide: DATABASE_TOKEN, useValue: db },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockImplementation((key: string, defaultValue?: string) => {
              if (key === 'SLACK_TEAM_ID') return 'T01TESTTEAM';
              return defaultValue ?? '';
            }),
          },
        },
      ],
    }).compile();

    service = module.get(IngestionService);
  });

  describe('ingestAllChannels', () => {
    it('should fetch active channels and ingest threads', async () => {
      const result = await service.ingestAllChannels();

      expect(db.query.slackChannels.findMany).toHaveBeenCalled();
      expect(slackClient.fetchChannelHistory).toHaveBeenCalledWith('C01ABC123', { cursor: undefined });
      expect(slackClient.fetchThreadReplies).toHaveBeenCalled();
      expect(result.channelsPolled).toBe(1);
      expect(result.threadsFound).toBe(1);
      expect(result.threadsStored).toBe(1);
      expect(result.errors).toBe(0);
    });

    it('should skip ingestion when Slack client is not configured', async () => {
      slackClient.isConfigured.mockReturnValue(false);

      const result = await service.ingestAllChannels();

      expect(result.channelsPolled).toBe(0);
      expect(db.query.slackChannels.findMany).not.toHaveBeenCalled();
    });

    it('should skip ingestion when SLACK_TEAM_ID is not set', async () => {
      const moduleWithoutTeamId = await Test.createTestingModule({
        providers: [
          IngestionService,
          { provide: SlackClientService, useValue: slackClient },
          { provide: DATABASE_TOKEN, useValue: db },
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn().mockReturnValue(''),
            },
          },
        ],
      }).compile();

      const svc = moduleWithoutTeamId.get(IngestionService);
      const result = await svc.ingestAllChannels();

      expect(result.channelsPolled).toBe(0);
    });
  });

  describe('ingestChannel', () => {
    it('should process thread-starting messages from channel history', async () => {
      const result = await service.ingestChannel('channel-uuid-1', 'C01ABC123', 'general');

      expect(slackClient.fetchChannelHistory).toHaveBeenCalledWith('C01ABC123', { cursor: undefined });
      expect(result.threadsFound).toBe(1);
      expect(result.threadsStored).toBe(1);
    });

    it('should skip non-thread messages', async () => {
      slackClient.fetchChannelHistory.mockResolvedValue({
        messages: [
          {
            ts: '1700000002.000300',
            user: 'U03GHI',
            text: 'Just a regular message',
            raw: { ts: '1700000002.000300', user: 'U03GHI', text: 'Just a regular message' },
          },
        ],
        hasMore: false,
      });

      const result = await service.ingestChannel('channel-uuid-1', 'C01ABC123', 'general');

      expect(result.threadsFound).toBe(0);
      expect(result.threadsStored).toBe(0);
    });
  });

  describe('error isolation', () => {
    it('should continue processing other threads when one fails', async () => {
      slackClient.fetchChannelHistory.mockResolvedValue({
        messages: [
          {
            ts: '1700000000.000100',
            user: 'U01ABC',
            text: 'Thread 1',
            threadTs: '1700000000.000100',
            raw: { ts: '1700000000.000100', reply_count: 1 },
          },
          {
            ts: '1700000002.000300',
            user: 'U03GHI',
            text: 'Thread 2',
            threadTs: '1700000002.000300',
            raw: { ts: '1700000002.000300', reply_count: 1 },
          },
        ],
        hasMore: false,
      });

      slackClient.fetchThreadReplies
        .mockRejectedValueOnce(new Error('Slack API timeout'))
        .mockResolvedValueOnce({
          messages: [
            {
              ts: '1700000002.000300',
              user: 'U03GHI',
              text: 'Thread 2',
              threadTs: '1700000002.000300',
              raw: { ts: '1700000002.000300', user: 'U03GHI', text: 'Thread 2' },
            },
          ],
          hasMore: false,
        });

      const result = await service.ingestChannel('channel-uuid-1', 'C01ABC123', 'general');

      expect(result.threadsFound).toBe(2);
      expect(result.threadsStored).toBe(1);
      expect(result.errors).toBe(1);
    });
  });

  describe('participant extraction', () => {
    it('should extract unique participant handles from messages', async () => {
      const capturedValues: Record<string, unknown>[] = [];

      db.transaction.mockImplementation(async (fn) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
              capturedValues.push(vals);
              return {
                onConflictDoUpdate: vi.fn().mockReturnValue({
                  returning: vi.fn().mockResolvedValue([{ id: 'thread-uuid-1' }]),
                }),
              };
            }),
          }),
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        };
        return fn(tx);
      });

      slackClient.fetchThreadReplies.mockResolvedValue({
        messages: [
          { ts: '1', user: 'U01ABC', text: 'msg1', raw: { ts: '1', user: 'U01ABC' } },
          { ts: '2', user: 'U02DEF', text: 'msg2', raw: { ts: '2', user: 'U02DEF' } },
          { ts: '3', user: 'U01ABC', text: 'msg3', raw: { ts: '3', user: 'U01ABC' } },
          { ts: '4', user: 'unknown', text: 'msg4', raw: { ts: '4' } },
        ],
        hasMore: false,
      });

      await service.ingestAllChannels();

      expect(db.transaction).toHaveBeenCalled();
      const threadUpsert = capturedValues.find((v) => 'participantIds' in v);
      expect(threadUpsert).toBeDefined();
      expect(threadUpsert!.participantIds).toEqual(['U01ABC', 'U02DEF']);
    });
  });

  describe('upsert idempotency', () => {
    it('should use onConflictDoUpdate for deduplication', async () => {
      await service.ingestAllChannels();

      expect(db.transaction).toHaveBeenCalled();
      const txFn = db.transaction.mock.calls[0][0];

      const mockTx = {
        insert: vi.fn(),
        delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      };
      const valuesReturn = {
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'thread-uuid-1' }]),
        }),
      };
      mockTx.insert.mockReturnValue({ values: vi.fn().mockReturnValue(valuesReturn) });

      await txFn(mockTx);

      expect(mockTx.insert).toHaveBeenCalled();
      expect(valuesReturn.onConflictDoUpdate).toHaveBeenCalled();
    });
  });

  describe('ingestThread — skip-if-unchanged (AC: #4)', () => {
    it('should skip and return "skipped" when latestReplyTs matches stored value', async () => {
      db.query.slackThreads.findFirst.mockResolvedValue({
        id: 'existing-thread-id',
        latestReplyTs: '1700000001.000200',
      });

      const starter = {
        ts: '1700000000.000100',
        user: 'U01ABC',
        text: 'Thread starter',
        threadTs: '1700000000.000100',
        latestReply: '1700000001.000200',
        raw: { ts: '1700000000.000100', reply_count: 2, latest_reply: '1700000001.000200' },
      };

      const result = await service.ingestThread('channel-uuid-1', 'C01ABC123', starter);

      expect(result).toBe('skipped');
      expect(slackClient.fetchThreadReplies).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('should re-ingest and return "ingested" when latestReplyTs has changed', async () => {
      db.query.slackThreads.findFirst.mockResolvedValue({
        id: 'existing-thread-id',
        latestReplyTs: '1700000001.000200',
      });

      const starter = {
        ts: '1700000000.000100',
        user: 'U01ABC',
        text: 'Thread starter',
        threadTs: '1700000000.000100',
        latestReply: '1700000002.000300',
        raw: { ts: '1700000000.000100', reply_count: 3, latest_reply: '1700000002.000300' },
      };

      const result = await service.ingestThread('channel-uuid-1', 'C01ABC123', starter);

      expect(result).toBe('ingested');
      expect(slackClient.fetchThreadReplies).toHaveBeenCalled();
      expect(db.transaction).toHaveBeenCalled();
    });

    it('should ingest and return "ingested" when thread is new (not in DB)', async () => {
      db.query.slackThreads.findFirst.mockResolvedValue(null);

      const starter = {
        ts: '1700000000.000100',
        user: 'U01ABC',
        text: 'New thread',
        threadTs: '1700000000.000100',
        latestReply: '1700000001.000200',
        raw: { ts: '1700000000.000100', reply_count: 1 },
      };

      const result = await service.ingestThread('channel-uuid-1', 'C01ABC123', starter);

      expect(result).toBe('ingested');
      expect(slackClient.fetchThreadReplies).toHaveBeenCalled();
      expect(db.transaction).toHaveBeenCalled();
    });

    it('should include pipelineState in upsert values', async () => {
      db.query.slackThreads.findFirst.mockResolvedValue(null);

      const capturedValues: Record<string, unknown>[] = [];
      db.transaction.mockImplementation(async (fn) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
              capturedValues.push(vals);
              return {
                onConflictDoUpdate: vi.fn().mockReturnValue({
                  returning: vi.fn().mockResolvedValue([{ id: 'thread-uuid-1' }]),
                }),
              };
            }),
          }),
          delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
        };
        return fn(tx);
      });

      const starter = {
        ts: '1700000000.000100',
        user: 'U01ABC',
        text: 'Thread',
        threadTs: '1700000000.000100',
        latestReply: '1700000001.000200',
        raw: { ts: '1700000000.000100', reply_count: 1 },
      };

      await service.ingestThread('channel-uuid-1', 'C01ABC123', starter);

      const threadUpsert = capturedValues.find((v) => 'threadTs' in v);
      expect(threadUpsert).toBeDefined();
      expect(threadUpsert!.pipelineState).toBe('ingested');
    });
  });

  describe('detectUpdatedThreads (AC: #1, #2, #4)', () => {
    it('should call ingestThread for threads whose latestReplyTs has changed', async () => {
      db.query.slackThreads.findMany.mockResolvedValue([
        { id: 'thread-uuid-1', threadTs: '1700000000.000100', latestReplyTs: '1700000001.000200' },
      ]);

      // fetchThreadReplies returns root message with a NEWER latest_reply
      slackClient.fetchThreadReplies.mockResolvedValueOnce({
        messages: [
          {
            ts: '1700000000.000100',
            user: 'U01ABC',
            text: 'Thread root',
            threadTs: '1700000000.000100',
            latestReply: '1700000002.000300',
            raw: { ts: '1700000000.000100', latest_reply: '1700000002.000300' },
          },
        ],
        hasMore: false,
      });

      // findFirst for skip-check inside ingestThread should return mismatched ts
      db.query.slackThreads.findFirst.mockResolvedValue({
        id: 'thread-uuid-1',
        latestReplyTs: '1700000001.000200',
      });

      // Full replies fetch inside ingestThread
      slackClient.fetchThreadReplies.mockResolvedValueOnce({
        messages: [
          { ts: '1700000000.000100', user: 'U01ABC', text: 'root', threadTs: '1700000000.000100', raw: {} },
          { ts: '1700000002.000300', user: 'U02DEF', text: 'new reply', threadTs: '1700000000.000100', raw: {} },
        ],
        hasMore: false,
      });

      const result = await service.detectUpdatedThreads('channel-uuid-1', 'C01ABC123');

      expect(result.threadsChecked).toBe(1);
      expect(result.threadsUpdated).toBe(1);
      expect(result.errors).toBe(0);
      expect(db.transaction).toHaveBeenCalled();
    });

    it('should skip threads with unchanged latestReplyTs (no ingestThread call)', async () => {
      db.query.slackThreads.findMany.mockResolvedValue([
        { id: 'thread-uuid-1', threadTs: '1700000000.000100', latestReplyTs: '1700000001.000200' },
      ]);

      // fetchThreadReplies returns same latest_reply as stored
      slackClient.fetchThreadReplies.mockResolvedValueOnce({
        messages: [
          {
            ts: '1700000000.000100',
            user: 'U01ABC',
            text: 'Thread root',
            threadTs: '1700000000.000100',
            latestReply: '1700000001.000200',
            raw: { ts: '1700000000.000100', latest_reply: '1700000001.000200' },
          },
        ],
        hasMore: false,
      });

      const result = await service.detectUpdatedThreads('channel-uuid-1', 'C01ABC123');

      expect(result.threadsChecked).toBe(1);
      expect(result.threadsUpdated).toBe(0);
      expect(result.errors).toBe(0);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('should isolate errors per thread and continue processing remaining threads', async () => {
      db.query.slackThreads.findMany.mockResolvedValue([
        { id: 'thread-uuid-1', threadTs: '1700000000.000100', latestReplyTs: '1700000001.000200' },
        { id: 'thread-uuid-2', threadTs: '1700000003.000100', latestReplyTs: '1700000004.000200' },
      ]);

      // First thread throws, second thread is unchanged
      slackClient.fetchThreadReplies
        .mockRejectedValueOnce(new Error('Slack timeout'))
        .mockResolvedValueOnce({
          messages: [
            {
              ts: '1700000003.000100',
              user: 'U01ABC',
              text: 'Thread 2 root',
              threadTs: '1700000003.000100',
              latestReply: '1700000004.000200',
              raw: { ts: '1700000003.000100', latest_reply: '1700000004.000200' },
            },
          ],
          hasMore: false,
        });

      const result = await service.detectUpdatedThreads('channel-uuid-1', 'C01ABC123');

      expect(result.errors).toBe(1);
      expect(result.threadsChecked).toBe(1);
      expect(result.threadsUpdated).toBe(0);
    });
  });
});
