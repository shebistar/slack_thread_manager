import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import { BackfillService } from './backfill.service.js';
import { IngestionService } from './ingestion.service.js';

function createMockChannels() {
  return [
    { id: 'chan-uuid-0', slackChannelId: 'C00ABCDE', name: 'general', isActive: true },
    { id: 'chan-uuid-1', slackChannelId: 'C01ABCDE', name: 'dev', isActive: true },
  ];
}

function createMockDb() {
  return {
    query: {
      slackChannels: {
        findFirst: vi.fn().mockResolvedValue(createMockChannels()[0]),
        findMany: vi.fn().mockResolvedValue(createMockChannels()),
      },
    },
  };
}

function createMockIngestionService() {
  return {
    ingestChannel: vi.fn().mockResolvedValue({ threadsFound: 3, threadsStored: 3, errors: 0 }),
  };
}

/** Drain the microtask queue so fire-and-forget async completes */
async function waitForAsync() {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('BackfillService', () => {
  let service: BackfillService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockIngestionService: ReturnType<typeof createMockIngestionService>;

  beforeEach(async () => {
    mockDb = createMockDb();
    mockIngestionService = createMockIngestionService();

    const module = await Test.createTestingModule({
      providers: [
        BackfillService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
        { provide: IngestionService, useValue: mockIngestionService },
      ],
    }).compile();

    service = module.get(BackfillService);
  });

  describe('startBackfill', () => {
    it('should return a jobId and create a pending job', () => {
      const { jobId } = service.startBackfill({ oldestTs: '1700000000.000000' });

      expect(typeof jobId).toBe('string');
      expect(jobId).toMatch(/^[0-9a-f-]{36}$/i);

      const status = service.getBackfillStatus(jobId);
      expect(status).toBeDefined();
      expect(status!.status).toBe('pending');
      expect(status!.threadsStored).toBe(0);
      expect(status!.startedAt).toBeInstanceOf(Date);
    });
  });

  describe('getBackfillStatus', () => {
    it('should return undefined for an unknown jobId', () => {
      const result = service.getBackfillStatus('non-existent-job-id');
      expect(result).toBeUndefined();
    });
  });

  describe('runBackfill — all channels', () => {
    it('should call ingestChannel for every active channel and complete successfully', async () => {
      const { jobId } = service.startBackfill({ oldestTs: '1700000000.000000' });
      await waitForAsync();

      expect(mockDb.query.slackChannels.findMany).toHaveBeenCalled();
      expect(mockIngestionService.ingestChannel).toHaveBeenCalledTimes(2);
      expect(mockIngestionService.ingestChannel).toHaveBeenCalledWith(
        'chan-uuid-0', 'C00ABCDE', 'general', '1700000000.000000',
      );
      expect(mockIngestionService.ingestChannel).toHaveBeenCalledWith(
        'chan-uuid-1', 'C01ABCDE', 'dev', '1700000000.000000',
      );

      const status = service.getBackfillStatus(jobId);
      expect(status?.status).toBe('complete');
    });

    it('should accumulate threadsStored across channels', async () => {
      mockIngestionService.ingestChannel
        .mockResolvedValueOnce({ threadsFound: 3, threadsStored: 3, errors: 0 })
        .mockResolvedValueOnce({ threadsFound: 5, threadsStored: 5, errors: 0 });

      const { jobId } = service.startBackfill({ oldestTs: '1700000000.000000' });
      await waitForAsync();

      const status = service.getBackfillStatus(jobId);
      expect(status?.threadsStored).toBe(8);
      expect(status?.channelsProcessed).toBe(2);
    });
  });

  describe('runBackfill — specific channel', () => {
    it('should call ingestChannel only for the specified channel', async () => {
      const { jobId } = service.startBackfill({ channelId: 'chan-uuid-0', oldestTs: '1700000000.000000' });
      await waitForAsync();

      expect(mockDb.query.slackChannels.findFirst).toHaveBeenCalled();
      expect(mockIngestionService.ingestChannel).toHaveBeenCalledTimes(1);
      expect(mockIngestionService.ingestChannel).toHaveBeenCalledWith(
        'chan-uuid-0', 'C00ABCDE', 'general', '1700000000.000000',
      );

      const status = service.getBackfillStatus(jobId);
      expect(status?.status).toBe('complete');
    });

    it('should set status to failed when channelId is not found in DB', async () => {
      mockDb.query.slackChannels.findFirst.mockResolvedValue(null);

      const { jobId } = service.startBackfill({ channelId: 'non-existent-uuid', oldestTs: '1700000000.000000' });
      await waitForAsync();

      expect(mockIngestionService.ingestChannel).not.toHaveBeenCalled();
      const status = service.getBackfillStatus(jobId);
      expect(status?.status).toBe('failed');
      expect(status?.errorMessage).toBe('Channel not found');
    });
  });

  describe('runBackfill — completion and error states', () => {
    it('should set status to complete with completedAt on success', async () => {
      const { jobId } = service.startBackfill({ oldestTs: '1700000000.000000' });
      await waitForAsync();

      const status = service.getBackfillStatus(jobId);
      expect(status?.status).toBe('complete');
      expect(status?.completedAt).toBeInstanceOf(Date);
    });

    it('should accumulate errors when ingestChannel throws, job still completes', async () => {
      mockIngestionService.ingestChannel.mockRejectedValue(new Error('Slack API timeout'));

      const { jobId } = service.startBackfill({ oldestTs: '1700000000.000000' });
      await waitForAsync();

      const status = service.getBackfillStatus(jobId);
      expect(status?.status).toBe('complete');
      expect(status?.errors).toBe(2);
    });

    it('should set status to failed when an unexpected top-level error occurs', async () => {
      mockDb.query.slackChannels.findMany.mockRejectedValue(new Error('DB connection failed'));

      const { jobId } = service.startBackfill({ oldestTs: '1700000000.000000' });
      await waitForAsync();

      const status = service.getBackfillStatus(jobId);
      expect(status?.status).toBe('failed');
      expect(status?.errorMessage).toBe('DB connection failed');
    });
  });
});
