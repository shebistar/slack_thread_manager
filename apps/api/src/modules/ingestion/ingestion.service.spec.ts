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
});
