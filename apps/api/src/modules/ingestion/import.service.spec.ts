import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import { ImportService } from './import.service.js';
import type { SlackExportMessage } from '@slack-thread-manager/shared';

function createMockDb() {
  return {
    query: {
      slackChannels: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'channel-uuid-1',
          slackChannelId: 'C01ABC123',
          name: 'general',
          isActive: true,
        }),
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

describe('ImportService', () => {
  let service: ImportService;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    db = createMockDb();

    const module = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: DATABASE_TOKEN, useValue: db },
      ],
    }).compile();

    service = module.get(ImportService);
  });

  describe('groupIntoThreads', () => {
    it('should group messages by thread_ts', () => {
      const messages: SlackExportMessage[] = [
        { ts: '1700000000.000100', user: 'U01', text: 'Thread starter', thread_ts: '1700000000.000100' },
        { ts: '1700000001.000200', user: 'U02', text: 'Reply 1', thread_ts: '1700000000.000100' },
        { ts: '1700000002.000300', user: 'U01', text: 'Reply 2', thread_ts: '1700000000.000100' },
      ];

      const threads = service.groupIntoThreads(messages);

      expect(threads.size).toBe(1);
      expect(threads.get('1700000000.000100')).toHaveLength(3);
    });

    it('should treat messages without thread_ts as individual threads', () => {
      const messages: SlackExportMessage[] = [
        { ts: '1700000000.000100', user: 'U01', text: 'Standalone 1' },
        { ts: '1700000001.000200', user: 'U02', text: 'Standalone 2' },
      ];

      const threads = service.groupIntoThreads(messages);

      expect(threads.size).toBe(2);
      expect(threads.get('1700000000.000100')).toHaveLength(1);
      expect(threads.get('1700000001.000200')).toHaveLength(1);
    });

    it('should handle mixed threaded and standalone messages', () => {
      const messages: SlackExportMessage[] = [
        { ts: '1700000000.000100', user: 'U01', text: 'Thread start', thread_ts: '1700000000.000100', reply_count: 1 },
        { ts: '1700000001.000200', user: 'U02', text: 'Reply', thread_ts: '1700000000.000100' },
        { ts: '1700000002.000300', user: 'U03', text: 'Standalone' },
      ];

      const threads = service.groupIntoThreads(messages);

      expect(threads.size).toBe(2);
      expect(threads.get('1700000000.000100')).toHaveLength(2);
      expect(threads.get('1700000002.000300')).toHaveLength(1);
    });

    it('should skip non-message types', () => {
      const messages: SlackExportMessage[] = [
        { ts: '1', user: 'U01', text: 'Normal', type: 'message' },
        { ts: '2', user: 'U02', text: 'File', type: 'file_comment' },
        { ts: '3', user: 'U03', text: 'Also normal' },
      ];

      const threads = service.groupIntoThreads(messages);

      expect(threads.size).toBe(2);
      expect(threads.has('2')).toBe(false);
    });

    it('should skip channel_join and channel_leave subtypes', () => {
      const messages: SlackExportMessage[] = [
        { ts: '1', user: 'U01', text: 'Hello' },
        { ts: '2', user: 'U02', text: 'joined', subtype: 'channel_join' },
        { ts: '3', user: 'U03', text: 'left', subtype: 'channel_leave' },
      ];

      const threads = service.groupIntoThreads(messages);

      expect(threads.size).toBe(1);
      expect(threads.has('1')).toBe(true);
    });
  });

  describe('importMessages', () => {
    it('should import messages and return summary', async () => {
      const messages: SlackExportMessage[] = [
        { ts: '1700000000.000100', user: 'U01', text: 'Thread 1', thread_ts: '1700000000.000100' },
        { ts: '1700000001.000200', user: 'U02', text: 'Reply', thread_ts: '1700000000.000100' },
        { ts: '1700000002.000300', user: 'U03', text: 'Standalone' },
      ];

      const result = await service.importMessages('channel-uuid-1', 'T01TEAM', messages);

      expect(result.threadsFound).toBe(2);
      expect(result.threadsStored).toBe(2);
      expect(result.errors).toBe(0);
      expect(db.transaction).toHaveBeenCalledTimes(2);
    });

    it('should throw NotFoundException for unknown channel', async () => {
      db.query.slackChannels.findFirst.mockResolvedValue(null);

      await expect(
        service.importMessages('nonexistent-uuid', 'T01TEAM', [
          { ts: '1', user: 'U01', text: 'msg' },
        ]),
      ).rejects.toThrow(NotFoundException);
    });

    it('should continue when one thread fails', async () => {
      db.transaction
        .mockRejectedValueOnce(new Error('DB error'))
        .mockImplementation(async (fn) => {
          const tx = {
            insert: vi.fn().mockReturnValue({
              values: vi.fn().mockReturnValue({
                onConflictDoUpdate: vi.fn().mockReturnValue({
                  returning: vi.fn().mockResolvedValue([{ id: 'thread-uuid-2' }]),
                }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          };
          return fn(tx);
        });

      const messages: SlackExportMessage[] = [
        { ts: '1', user: 'U01', text: 'Thread A', thread_ts: '1' },
        { ts: '2', user: 'U02', text: 'Thread B', thread_ts: '2' },
      ];

      const result = await service.importMessages('channel-uuid-1', 'T01TEAM', messages);

      expect(result.threadsFound).toBe(2);
      expect(result.threadsStored).toBe(1);
      expect(result.errors).toBe(1);
    });
  });
});
