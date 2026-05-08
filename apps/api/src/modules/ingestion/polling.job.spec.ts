import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DATABASE_TOKEN } from '../../database/database.module.js';
import { PollingJob } from './polling.job.js';
import { IngestionService } from './ingestion.service.js';
import { SlackClientService } from '../slack/slack-client.service.js';

function createMockChannels(overrides: Partial<{ lastPolledTs: Date | null }>[] = [{}]) {
  return overrides.map((o, i) => ({
    id: `chan-uuid-${i}`,
    slackChannelId: `C0${i}ABCDE`,
    name: `channel-${i}`,
    workstreamId: null,
    isActive: true,
    createdAt: new Date(),
    lastPolledTs: o.lastPolledTs ?? null,
  }));
}

describe('PollingJob', () => {
  let pollingJob: PollingJob;
  let mockIngestionService: {
    ingestChannel: ReturnType<typeof vi.fn>;
    detectUpdatedThreads: ReturnType<typeof vi.fn>;
  };
  let mockSlackClient: { isConfigured: ReturnType<typeof vi.fn> };
  let mockDb: {
    query: { slackChannels: { findMany: ReturnType<typeof vi.fn> } };
    update: ReturnType<typeof vi.fn>;
  };
  let mockUpdateWhere: ReturnType<typeof vi.fn>;
  let mockUpdateSet: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockIngestionService = {
      ingestChannel: vi.fn().mockResolvedValue({ threadsFound: 2, threadsStored: 2, errors: 0 }),
      detectUpdatedThreads: vi.fn().mockResolvedValue({ threadsChecked: 0, threadsUpdated: 0, errors: 0 }),
    };

    mockSlackClient = {
      isConfigured: vi.fn().mockReturnValue(true),
    };

    mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
    mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    mockDb = {
      query: {
        slackChannels: {
          findMany: vi.fn().mockResolvedValue(createMockChannels()),
        },
      },
      update: vi.fn().mockReturnValue({ set: mockUpdateSet }),
    };

    const module = await Test.createTestingModule({
      providers: [
        PollingJob,
        { provide: DATABASE_TOKEN, useValue: mockDb },
        { provide: IngestionService, useValue: mockIngestionService },
        { provide: SlackClientService, useValue: mockSlackClient },
        { provide: SchedulerRegistry, useValue: { getCronJob: vi.fn(), deleteCronJob: vi.fn(), addCronJob: vi.fn() } },
      ],
    }).compile();

    pollingJob = module.get(PollingJob);
  });

  describe('handlePollingCron', () => {
    it('should skip when Slack is not configured', async () => {
      mockSlackClient.isConfigured.mockReturnValue(false);

      await pollingJob.handlePollingCron();

      expect(mockDb.query.slackChannels.findMany).not.toHaveBeenCalled();
      expect(mockIngestionService.ingestChannel).not.toHaveBeenCalled();
    });

    it('should poll active channels and pass watermark as oldest', async () => {
      const polledDate = new Date('2026-05-07T12:00:00Z');
      mockDb.query.slackChannels.findMany.mockResolvedValue(
        createMockChannels([{ lastPolledTs: polledDate }]),
      );

      await pollingJob.handlePollingCron();

      expect(mockIngestionService.ingestChannel).toHaveBeenCalledWith(
        'chan-uuid-0',
        'C00ABCDE',
        'channel-0',
        String(polledDate.getTime() / 1000),
      );
    });

    it('should pass undefined as oldest when channel has never been polled', async () => {
      mockDb.query.slackChannels.findMany.mockResolvedValue(
        createMockChannels([{ lastPolledTs: null }]),
      );

      await pollingJob.handlePollingCron();

      expect(mockIngestionService.ingestChannel).toHaveBeenCalledWith(
        'chan-uuid-0',
        'C00ABCDE',
        'channel-0',
        undefined,
      );
    });

    it('should advance watermark only after successful channel ingestion', async () => {
      await pollingJob.handlePollingCron();

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockUpdateWhere).toHaveBeenCalled();
    });

    it('should NOT advance watermark when channel ingestion throws', async () => {
      mockIngestionService.ingestChannel.mockRejectedValue(new Error('Slack API down'));

      await pollingJob.handlePollingCron();

      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should NOT advance watermark when ingestChannel returns partial errors', async () => {
      mockIngestionService.ingestChannel.mockResolvedValue({ threadsFound: 3, threadsStored: 2, errors: 1 });

      await pollingJob.handlePollingCron();

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(pollingJob.getLastBatchStatus()).toBe('failed');
    });

    it('should set batch status to failed when DB findMany throws', async () => {
      mockDb.query.slackChannels.findMany.mockRejectedValue(new Error('DB connection error'));

      await pollingJob.handlePollingCron();

      expect(pollingJob.getLastBatchStatus()).toBe('failed');
      expect(pollingJob.getLastBatchRun()).toBeInstanceOf(Date);
      expect(mockIngestionService.ingestChannel).not.toHaveBeenCalled();
    });

    it('should NOT advance watermark when DB update throws after successful ingest', async () => {
      mockUpdateWhere.mockRejectedValueOnce(new Error('DB update failed'));

      await pollingJob.handlePollingCron();

      expect(pollingJob.getLastBatchStatus()).toBe('failed');
    });

    it('should isolate per-channel errors — failed channel does not block others', async () => {
      const channels = createMockChannels([{ lastPolledTs: null }, { lastPolledTs: null }]);
      mockDb.query.slackChannels.findMany.mockResolvedValue(channels);

      mockIngestionService.ingestChannel
        .mockRejectedValueOnce(new Error('Channel 0 failed'))
        .mockResolvedValueOnce({ threadsFound: 3, threadsStored: 3, errors: 0 });

      await pollingJob.handlePollingCron();

      expect(mockIngestionService.ingestChannel).toHaveBeenCalledTimes(2);
      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });

    it('should set batch status to success when all channels succeed', async () => {
      await pollingJob.handlePollingCron();

      expect(pollingJob.getLastBatchStatus()).toBe('success');
      expect(pollingJob.getLastBatchRun()).toBeInstanceOf(Date);
    });

    it('should set batch status to failed when any channel fails', async () => {
      mockIngestionService.ingestChannel.mockRejectedValue(new Error('fail'));

      await pollingJob.handlePollingCron();

      expect(pollingJob.getLastBatchStatus()).toBe('failed');
      expect(pollingJob.getLastBatchRun()).toBeInstanceOf(Date);
    });

    it('should call detectUpdatedThreads for each active channel (Phase 2)', async () => {
      const channels = createMockChannels([{ lastPolledTs: null }, { lastPolledTs: null }]);
      mockDb.query.slackChannels.findMany.mockResolvedValue(channels);

      await pollingJob.handlePollingCron();

      expect(mockIngestionService.detectUpdatedThreads).toHaveBeenCalledTimes(2);
      expect(mockIngestionService.detectUpdatedThreads).toHaveBeenCalledWith('chan-uuid-0', 'C00ABCDE');
      expect(mockIngestionService.detectUpdatedThreads).toHaveBeenCalledWith('chan-uuid-1', 'C01ABCDE');
    });

    it('should NOT set lastBatchStatus to failed when Phase 2 detectUpdatedThreads throws', async () => {
      mockIngestionService.detectUpdatedThreads.mockRejectedValue(new Error('Phase 2 failed'));

      await pollingJob.handlePollingCron();

      // Phase 1 succeeded — status should still be success
      expect(pollingJob.getLastBatchStatus()).toBe('success');
      // Watermark was still advanced
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('getLastBatchRun / getLastBatchStatus', () => {
    it('should return never and null before any polling', () => {
      expect(pollingJob.getLastBatchStatus()).toBe('never');
      expect(pollingJob.getLastBatchRun()).toBeNull();
    });
  });
});
